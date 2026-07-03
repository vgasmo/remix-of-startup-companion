-- C1: extend claim_startup email-match to also cover CRM-converted workspaces
-- ('pending','claimed','active') so a founder whose lead was converted to a
-- workspace lands as a member automatically instead of manual staff review.
--
-- Rules:
--   * Activate only from pre-active states (imported_unclaimed, pending, claimed).
--   * If the workspace is already active, just add the founder as a member.
--   * If the founder is already an active member of an active/claimed workspace,
--     return 'already_claimed' (unchanged behavior).
CREATE OR REPLACE FUNCTION public.claim_startup()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id UUID;
  v_user_email TEXT;
  v_startup RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;

  IF EXISTS (
    SELECT 1 FROM workspace_users wu
    JOIN workspaces w ON w.id = wu.workspace_id
    WHERE wu.user_id = v_user_id AND wu.active = true
    AND w.status IN ('claimed', 'active')
  ) THEN
    RETURN jsonb_build_object('status', 'already_claimed', 'message', 'You already have an active workspace');
  END IF;

  IF EXISTS (
    SELECT 1 FROM startup_claim_requests
    WHERE user_id = v_user_id AND status = 'pending'
  ) THEN
    RETURN jsonb_build_object('status', 'pending', 'message', 'Your claim request is pending staff review');
  END IF;

  -- Extended match: include CRM-converted workspaces (pending/claimed/active),
  -- not just imported_unclaimed.
  SELECT s.id AS startup_id, s.name AS startup_name, w.id AS workspace_id, w.status AS workspace_status
  INTO v_startup
  FROM startups s
  JOIN workspaces w ON w.startup_id = s.id
  WHERE LOWER(s.main_contact_email) = LOWER(v_user_email)
    AND w.status IN ('imported_unclaimed', 'pending', 'claimed', 'active')
  ORDER BY
    CASE w.status
      WHEN 'active' THEN 1
      WHEN 'claimed' THEN 2
      WHEN 'pending' THEN 3
      WHEN 'imported_unclaimed' THEN 4
      ELSE 5
    END
  LIMIT 1;

  IF v_startup IS NOT NULL THEN
    INSERT INTO workspace_users (workspace_id, user_id, role, active)
    VALUES (v_startup.workspace_id, v_user_id, 'founder', true)
    ON CONFLICT DO NOTHING;

    -- Activate only from pre-active states; leave active workspaces alone.
    IF v_startup.workspace_status IN ('pending', 'claimed', 'imported_unclaimed') THEN
      UPDATE workspaces
      SET status = 'active', needs_onboarding = false, updated_at = now()
      WHERE id = v_startup.workspace_id;
    END IF;

    INSERT INTO startup_claim_requests (user_id, startup_id, workspace_id, status, match_method, user_email)
    VALUES (v_user_id, v_startup.startup_id, v_startup.workspace_id, 'auto_claimed', 'email_match', v_user_email);

    INSERT INTO user_roles (user_id, role) VALUES (v_user_id, 'founder') ON CONFLICT DO NOTHING;

    UPDATE profiles
    SET account_status = 'approved', updated_at = now()
    WHERE id = v_user_id AND account_status != 'approved';

    RETURN jsonb_build_object(
      'status', 'auto_claimed',
      'startup_name', v_startup.startup_name,
      'workspace_id', v_startup.workspace_id
    );
  ELSE
    INSERT INTO startup_claim_requests (user_id, status, match_method, user_email)
    VALUES (v_user_id, 'pending', 'manual_request', v_user_email);

    RETURN jsonb_build_object('status', 'pending', 'message', 'Your request has been submitted for staff review');
  END IF;
END;
$function$;