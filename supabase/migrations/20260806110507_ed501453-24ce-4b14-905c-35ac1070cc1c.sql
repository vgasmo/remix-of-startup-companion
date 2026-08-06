-- Production defect: workspace_invitations.role is text while
-- workspace_users.role / user_roles.role are app_role. The insert below raised
-- 42804 ("column role is of type app_role but expression is of type text"),
-- so EVERY invitation acceptance failed. Cast explicitly and validate the label.
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_user_email text;
  v_inv record;
  v_already_member boolean;
  v_role_text text;
  v_role public.app_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  SELECT lower(email) INTO v_user_email FROM auth.users WHERE id = v_uid;
  IF v_user_email IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
    FROM public.workspace_invitations
   WHERE token_hash = p_token_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_accepted', true,
      'workspace_id', v_inv.workspace_id,
      'startup_id', v_inv.startup_id
    );
  END IF;

  IF v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'invitation_expired' USING ERRCODE = '22023';
  END IF;

  IF lower(v_inv.email) <> v_user_email THEN
    RAISE EXCEPTION 'invitation_email_mismatch' USING ERRCODE = '42501';
  END IF;

  v_role_text := lower(btrim(COALESCE(v_inv.role, 'founder')));
  IF NOT EXISTS (
    SELECT 1 FROM unnest(enum_range(NULL::public.app_role)) r
     WHERE r::text = v_role_text
  ) THEN
    RAISE EXCEPTION 'invitation_role_invalid: %', v_role_text USING ERRCODE = '22023';
  END IF;
  v_role := v_role_text::public.app_role;

  SELECT EXISTS (
    SELECT 1 FROM public.workspace_users
     WHERE workspace_id = v_inv.workspace_id AND user_id = v_uid
  ) INTO v_already_member;

  IF NOT v_already_member THEN
    INSERT INTO public.workspace_users (workspace_id, user_id, role, active)
    VALUES (v_inv.workspace_id, v_uid, v_role, true);
  END IF;

  -- Global role (idempotent) — founder invitations only; a mentor invite must
  -- never escalate to the founder global role.
  IF v_role = 'founder'::public.app_role THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_uid, 'founder'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  UPDATE public.workspace_invitations
     SET accepted_at = now()
   WHERE id = v_inv.id;

  UPDATE public.profiles
     SET account_status = 'approved'
   WHERE id = v_uid AND account_status IN ('pending', 'approved');

  RETURN jsonb_build_object(
    'success', true,
    'already_accepted', false,
    'workspace_id', v_inv.workspace_id,
    'startup_id', v_inv.startup_id,
    'role', v_role::text
  );
END;
$function$;