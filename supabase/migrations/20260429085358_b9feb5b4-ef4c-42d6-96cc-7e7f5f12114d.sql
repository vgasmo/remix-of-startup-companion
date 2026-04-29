-- Harden workspace activation: any workspace that gains/has an active founder
-- member must be 'active' with needs_onboarding=false. This eliminates the
-- 'claimed' limbo state that previously hid workspaces from founders.

-- 1) Fix self-service claim_startup so it activates immediately (parity with approve_startup_claim)
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

  SELECT s.id AS startup_id, s.name AS startup_name, w.id AS workspace_id
  INTO v_startup
  FROM startups s
  JOIN workspaces w ON w.startup_id = s.id
  WHERE LOWER(s.main_contact_email) = LOWER(v_user_email)
  AND w.status = 'imported_unclaimed'
  LIMIT 1;

  IF v_startup IS NOT NULL THEN
    INSERT INTO workspace_users (workspace_id, user_id, role, active)
    VALUES (v_startup.workspace_id, v_user_id, 'founder', true)
    ON CONFLICT DO NOTHING;

    -- Activate immediately (was: status='claimed' which left founder in limbo)
    UPDATE workspaces
    SET status = 'active', needs_onboarding = false, updated_at = now()
    WHERE id = v_startup.workspace_id;

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

-- 2) Safety net trigger: when a founder member becomes active on a workspace,
--    promote that workspace to 'active' and clear needs_onboarding.
CREATE OR REPLACE FUNCTION public.auto_activate_workspace_on_founder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role = 'founder' AND NEW.active = true THEN
    UPDATE public.workspaces
    SET status = 'active',
        needs_onboarding = false,
        updated_at = now()
    WHERE id = NEW.workspace_id
      AND status IN ('claimed', 'imported_unclaimed');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_activate_workspace_on_founder ON public.workspace_users;
CREATE TRIGGER trg_auto_activate_workspace_on_founder
AFTER INSERT OR UPDATE OF role, active ON public.workspace_users
FOR EACH ROW
EXECUTE FUNCTION public.auto_activate_workspace_on_founder();