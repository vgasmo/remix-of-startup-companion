DO $$
DECLARE d text;
BEGIN
 d:=pg_get_functiondef('public.accept_workspace_invitation(text)'::regprocedure);
 IF md5(d) NOT IN ('3fe1007114afad33e2cb7382880840f5','7818cb02f6bbfd2902a52034da3710f8') THEN RAISE EXCEPTION 'rc12: definição de public.accept_workspace_invitation divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar',md5(d); END IF;
 IF position('RC12 email-first' IN d)=0 THEN
 IF position($q$  IF v_inv.accepted_at IS NOT NULL THEN$q$ IN d)=0 THEN RAISE EXCEPTION 'RC12: texto esperado não encontrado em accept_workspace_invitation (accepted_at)'; END IF;
 d:=replace(d,$q$  IF v_inv.accepted_at IS NOT NULL THEN$q$,$q$  -- RC12 email-first: só o destinatário do convite o pode "reabrir", mesmo depois de aceite
  IF lower(v_inv.email) <> v_user_email THEN
    RAISE EXCEPTION 'invitation_email_mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_inv.accepted_at IS NOT NULL THEN$q$);
 END IF;
 IF position('RC12 reativa' IN d)=0 THEN
 IF position($q$  IF NOT v_already_member THEN
    INSERT INTO public.workspace_users (workspace_id, user_id, role, active)
    VALUES (v_inv.workspace_id, v_uid, v_role, true);
  END IF;$q$ IN d)=0 THEN RAISE EXCEPTION 'RC12: texto esperado não encontrado em accept_workspace_invitation (adesão)'; END IF;
 d:=replace(d,$q$  IF NOT v_already_member THEN
    INSERT INTO public.workspace_users (workspace_id, user_id, role, active)
    VALUES (v_inv.workspace_id, v_uid, v_role, true);
  END IF;$q$,$q$  -- RC12 reativa: uma adesão desativada volta a ficar ativa e um team_member convidado como founder sobe a founder
  INSERT INTO public.workspace_users (workspace_id, user_id, role, active)
  VALUES (v_inv.workspace_id, v_uid, v_role, true)
  ON CONFLICT (workspace_id, user_id) DO UPDATE
    SET active = true,
        role = CASE WHEN NOT public.workspace_users.active THEN EXCLUDED.role
                    WHEN public.workspace_users.role = 'team_member'::public.app_role
                     AND EXCLUDED.role = 'founder'::public.app_role THEN EXCLUDED.role
                    ELSE public.workspace_users.role END;$q$);
 END IF;
 EXECUTE d;
END $$;
DROP POLICY IF EXISTS "Users can view own invitations" ON public.workspace_invitations;
CREATE POLICY "Users can view own invitations" ON public.workspace_invitations FOR SELECT TO authenticated USING (lower(email)=lower(coalesce(auth.jwt()->>'email','')));
DROP POLICY IF EXISTS "Users can accept own invitations" ON public.workspace_invitations;
DROP POLICY IF EXISTS "Staff can view invitations" ON public.workspace_invitations;
CREATE POLICY "Staff can view invitations" ON public.workspace_invitations FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "Staff can create invitations" ON public.workspace_invitations;
CREATE POLICY "Staff can create invitations" ON public.workspace_invitations FOR INSERT TO authenticated WITH CHECK (public.is_staff());
DROP POLICY IF EXISTS "Staff can update invitations" ON public.workspace_invitations;
CREATE POLICY "Staff can update invitations" ON public.workspace_invitations FOR UPDATE TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff());