-- Stream A: Restore safe claim_startup boundary.
-- Regression: 20260703130240 extended auto-claim to pending/claimed/active workspaces.
-- Restore original invariant: only imported_unclaimed may auto-claim.
-- Any other status match → pending staff review; never auto-add membership,
-- never touch active workspaces.

CREATE OR REPLACE FUNCTION public.claim_startup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_email_confirmed TIMESTAMPTZ;
  v_match RECORD;
  v_existing_active RECORD;
  v_request_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT email, email_confirmed_at
    INTO v_user_email, v_email_confirmed
    FROM auth.users WHERE id = v_user_id;

  -- Idempotency: already an active member somewhere → no-op.
  SELECT wu.workspace_id
    INTO v_existing_active
    FROM workspace_users wu
    JOIN workspaces w ON w.id = wu.workspace_id
   WHERE wu.user_id = v_user_id AND wu.active = true
     AND w.status IN ('claimed', 'active')
   LIMIT 1;

  IF v_existing_active.workspace_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'already_member',
      'workspace_id', v_existing_active.workspace_id
    );
  END IF;

  -- Do not create a second pending request if one already exists.
  SELECT id INTO v_request_id
    FROM startup_claim_requests
   WHERE user_id = v_user_id AND status = 'pending'
   LIMIT 1;
  IF v_request_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'status', 'pending_review',
      'request_id', v_request_id,
      'message', 'Your claim request is pending staff review'
    );
  END IF;

  -- Look up any email match, but categorize by workspace status.
  SELECT s.id AS startup_id, s.name AS startup_name,
         w.id AS workspace_id, w.status AS workspace_status
    INTO v_match
    FROM startups s
    JOIN workspaces w ON w.startup_id = s.id
   WHERE LOWER(s.main_contact_email) = LOWER(v_user_email)
   ORDER BY CASE w.status
              WHEN 'imported_unclaimed' THEN 1
              WHEN 'pending' THEN 2
              WHEN 'claimed' THEN 3
              WHEN 'active' THEN 4
              ELSE 5
            END
   LIMIT 1;

  IF v_match.workspace_id IS NULL THEN
    INSERT INTO startup_claim_requests (user_id, status, match_method, user_email)
    VALUES (v_user_id, 'pending', 'manual_request', v_user_email)
    RETURNING id INTO v_request_id;

    RETURN jsonb_build_object(
      'status', 'pending_review',
      'request_id', v_request_id,
      'message', 'Your request has been submitted for staff review'
    );
  END IF;

  -- Safe auto-claim: imported_unclaimed only, and email must be confirmed.
  IF v_match.workspace_status = 'imported_unclaimed' AND v_email_confirmed IS NOT NULL THEN
    INSERT INTO workspace_users (workspace_id, user_id, role, active)
    VALUES (v_match.workspace_id, v_user_id, 'founder', true)
    ON CONFLICT DO NOTHING;

    UPDATE workspaces
       SET status = 'claimed', needs_onboarding = true, updated_at = now()
     WHERE id = v_match.workspace_id AND status = 'imported_unclaimed';

    INSERT INTO startup_claim_requests
      (user_id, startup_id, workspace_id, status, match_method, user_email, resolved_at, resolved_by)
    VALUES
      (v_user_id, v_match.startup_id, v_match.workspace_id, 'auto_claimed',
       'email_match_imported', v_user_email, now(), v_user_id);

    INSERT INTO user_roles (user_id, role) VALUES (v_user_id, 'founder') ON CONFLICT DO NOTHING;

    UPDATE profiles
       SET account_status = 'approved', updated_at = now()
     WHERE id = v_user_id AND account_status != 'approved';

    RETURN jsonb_build_object(
      'status', 'auto_claimed',
      'startup_name', v_match.startup_name,
      'workspace_id', v_match.workspace_id
    );
  END IF;

  -- Match against pending/claimed/active → NEVER auto-add. Staff review only.
  INSERT INTO startup_claim_requests
    (user_id, startup_id, workspace_id, status, match_method, user_email)
  VALUES
    (v_user_id, v_match.startup_id, v_match.workspace_id, 'pending',
     'email_match_' || v_match.workspace_status, v_user_email)
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'status', 'pending_review',
    'request_id', v_request_id,
    'workspace_status', v_match.workspace_status,
    'message', 'A workspace matching your email already exists; staff will review your request'
  );
END;
$function$;

COMMENT ON FUNCTION public.claim_startup() IS
'Safe claim boundary (v4.0): only imported_unclaimed workspaces auto-claim on verified-email exact match. Every other match creates a pending staff-review request. Never auto-adds a second founder to active/claimed/pending workspaces.';