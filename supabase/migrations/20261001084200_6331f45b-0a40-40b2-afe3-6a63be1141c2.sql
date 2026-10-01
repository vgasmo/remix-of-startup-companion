CREATE OR REPLACE FUNCTION public.approve_user_account(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status public.account_status;
BEGIN
  IF NOT (public.is_staff() OR public.can_access_backoffice()) THEN
    RAISE EXCEPTION 'Only staff can approve user accounts' USING ERRCODE = '42501';
  END IF;
  SELECT account_status INTO v_status FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v_status = 'approved' THEN RETURN true; END IF;
  IF v_status <> 'pending' AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can reactivate suspended accounts' USING ERRCODE = '42501';
  END IF;
  UPDATE public.profiles SET account_status = 'approved', updated_at = now() WHERE id = p_user_id;
  INSERT INTO public.activity_log(user_id, entity_type, entity_id, action, metadata)
  VALUES (auth.uid(), 'profile', p_user_id, 'account_approved',
          jsonb_build_object('approved_user_id', p_user_id, 'previous_status', v_status));
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.approve_user_account(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_user_account(uuid) TO authenticated;

DROP POLICY IF EXISTS "Backoffice can review pending workspaces" ON public.workspaces;
CREATE POLICY "Backoffice can review pending workspaces"
  ON public.workspaces FOR UPDATE TO authenticated
  USING (public.can_access_backoffice() AND status = 'pending')
  WITH CHECK (public.can_access_backoffice() AND status IN ('pending','active','rejected'));

DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.approve_startup_claim(uuid,uuid)'::regprocedure);
  IF position($q$WHERE id = v_claim.user_id AND account_status != 'approved';$q$ IN d) = 0 THEN
    RAISE EXCEPTION 'approve_startup_claim: texto esperado não encontrado';
  END IF;
  d := replace(d, $q$WHERE id = v_claim.user_id AND account_status != 'approved';$q$,
                  $q$WHERE id = v_claim.user_id AND account_status = 'pending';$q$);
  EXECUTE d;
END $$;

CREATE OR REPLACE FUNCTION public.notify_contract_event(p_contract_id uuid, p_event_type text, p_staff_title text, p_staff_message text, p_founder_title text, p_founder_message text, p_founder_link text DEFAULT '/workspace'::text, p_staff_link text DEFAULT '/admin?tab=backoffice&subtab=contracts'::text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_workspace uuid; v_count integer := 0;
BEGIN
  IF NOT (public.is_staff() OR public.can_access_backoffice()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_event_type IS NULL OR btrim(p_event_type) = '' THEN RAISE EXCEPTION 'event_type_required'; END IF;
  SELECT workspace_id INTO v_workspace FROM public.startup_contracts WHERE id = p_contract_id;
  INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id, link, read)
  SELECT DISTINCT ur.user_id, p_event_type, p_staff_title, p_staff_message, 'contract', p_contract_id, p_staff_link, false
    FROM public.user_roles ur WHERE ur.role IN ('admin','consultor','backoffice');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_workspace IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id, link, read)
    SELECT DISTINCT wu.user_id, p_event_type, p_founder_title, p_founder_message, 'contract', p_contract_id, p_founder_link, false
      FROM public.workspace_users wu
     WHERE wu.workspace_id = v_workspace AND wu.active = true AND wu.role = 'founder';
  END IF;
  RETURN v_count;
END; $function$;
REVOKE ALL ON FUNCTION public.notify_contract_event(uuid,text,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.notify_contract_event(uuid,text,text,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.backoffice_archive_workspace(p_workspace_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_staff() OR public.can_access_backoffice()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_staff() AND (
       NOT EXISTS (SELECT 1 FROM public.startup_contracts c
                    WHERE c.workspace_id = p_workspace_id AND c.status IN ('terminated','expired'))
       OR EXISTS (SELECT 1 FROM public.startup_contracts c
                   WHERE c.workspace_id = p_workspace_id AND c.status IN ('active','pending_signature','suspended'))) THEN
    RAISE EXCEPTION 'workspace_not_archivable' USING ERRCODE = '42501';
  END IF;
  UPDATE public.workspaces SET status = 'archived', archived_at = now(), updated_at = now()
   WHERE id = p_workspace_id AND status <> 'archived';
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.backoffice_archive_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backoffice_archive_workspace(uuid) TO authenticated;

DROP POLICY IF EXISTS "Backoffice can manage incubation types" ON public.incubation_types;
CREATE POLICY "Backoffice can manage incubation types" ON public.incubation_types
  FOR ALL TO authenticated USING (public.can_access_backoffice()) WITH CHECK (public.can_access_backoffice());
DROP POLICY IF EXISTS "Backoffice can manage contract discounts" ON public.contract_discounts;
CREATE POLICY "Backoffice can manage contract discounts" ON public.contract_discounts
  FOR ALL TO authenticated USING (public.can_access_backoffice()) WITH CHECK (public.can_access_backoffice());
DROP POLICY IF EXISTS "Backoffice can view work queue items" ON public.staff_work_queue_items;
CREATE POLICY "Backoffice can view work queue items" ON public.staff_work_queue_items
  FOR SELECT TO authenticated USING (public.is_backoffice());
DROP POLICY IF EXISTS "Backoffice can update work queue items" ON public.staff_work_queue_items;
CREATE POLICY "Backoffice can update work queue items" ON public.staff_work_queue_items
  FOR UPDATE TO authenticated USING (public.is_backoffice()) WITH CHECK (public.is_backoffice());
DROP POLICY IF EXISTS "Staff can create tasks" ON public.staff_tasks;
CREATE POLICY "Staff can create tasks" ON public.staff_tasks FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_backoffice()
    OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'consultor'));

DO $$
DECLARE r record; def text; before text;
BEGIN
  FOR r IN SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('staff_convert_funnel_item_to_startup','staff_rotate_intake_token',
                               'approve_startup_change_request','reject_startup_change_request')
  LOOP
    def := pg_get_functiondef(r.oid); before := def;
    def := replace(def, 'IF NOT public.is_staff() THEN', 'IF NOT (public.is_staff() OR public.is_backoffice()) THEN');
    def := replace(def, 'IF NOT (public.is_staff() OR coalesce(auth.role(), '''') = ''service_role'') THEN',
                        'IF NOT (public.is_staff() OR public.is_backoffice() OR coalesce(auth.role(), '''') = ''service_role'') THEN');
    def := replace(def, 'IF NOT is_admin() THEN', 'IF NOT (is_admin() OR is_backoffice()) THEN');
    def := replace(def, 'VALUES (v_workspace_id, v_user, ''consultor''::public.app_role, true)',
                        'SELECT v_workspace_id, v_user, ''consultor''::public.app_role, true WHERE public.is_staff()');
    IF def = before THEN RAISE EXCEPTION 'guard not found in %', r.proname; END IF;
    IF r.proname = 'staff_convert_funnel_item_to_startup' AND position('true WHERE public.is_staff()' IN def) = 0 THEN
      RAISE EXCEPTION 'membership insert not found in %', r.proname;
    END IF;
    EXECUTE def;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Connected users and staff can view mentor availability" ON public.mentor_availability;
CREATE POLICY "Connected users and staff can view mentor availability"
ON public.mentor_availability FOR SELECT TO authenticated
USING (
  public.is_staff()
  OR mentor_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.mentor_connections mc
             WHERE mc.mentor_id = mentor_availability.mentor_id
               AND mc.founder_id = auth.uid() AND mc.status = 'accepted')
  OR EXISTS (SELECT 1 FROM public.workspace_users wm
             JOIN public.workspace_users wf ON wf.workspace_id = wm.workspace_id
             WHERE wm.user_id = mentor_availability.mentor_id
               AND wm.role = 'mentor_externo' AND wm.active
               AND wf.user_id = auth.uid() AND wf.active
               AND wf.role IN ('founder', 'team_member'))
);

ALTER TABLE public.startup_contracts
  ADD COLUMN IF NOT EXISTS documents_json jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.startup_contracts.documents_json IS
  'Documentos carregados pelo founder no link público (public-contract-onboarding upload_document)';

CREATE OR REPLACE FUNCTION public.activate_workspace_for_signed_contract(p_contract_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ws uuid; v_status text;
BEGIN
  IF NOT (public.is_staff() OR public.is_backoffice()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT workspace_id INTO v_ws FROM public.startup_contracts
   WHERE id = p_contract_id AND status = 'active' AND signed_at IS NOT NULL;
  IF v_ws IS NULL THEN RETURN 'no_signed_contract'; END IF;
  UPDATE public.workspaces SET status = 'active', updated_at = now()
   WHERE id = v_ws AND status IN ('pending','claimed','imported_unclaimed')
  RETURNING status INTO v_status;
  RETURN COALESCE(v_status, 'unchanged');
END; $$;
REVOKE ALL ON FUNCTION public.activate_workspace_for_signed_contract(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_workspace_for_signed_contract(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.check_signup_allowed(p_email text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_open boolean; v_domain text;
BEGIN
  SELECT enabled INTO v_open FROM feature_flags WHERE key = 'open_registration' AND scope = 'global' LIMIT 1;
  IF COALESCE(v_open, false) THEN RETURN true; END IF;
  v_domain := split_part(lower(p_email), '@', 2);
  RETURN EXISTS (SELECT 1 FROM signup_allowlist WHERE lower(email) = lower(p_email) OR lower(domain) = v_domain)
      OR EXISTS (SELECT 1 FROM workspace_invitations wi
                  WHERE lower(wi.email) = lower(p_email) AND wi.accepted_at IS NULL AND wi.expires_at > now());
END; $function$;

DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.launch_survey_campaign(uuid,uuid[])'::regprocedure);
  IF position(E'AS $function$\nDECLARE' IN d) = 0
     OR position($q$IF NOT is_staff() THEN
    RAISE EXCEPTION 'permission denied: staff only' USING ERRCODE = '42501';$q$ IN d) = 0 THEN
    RAISE EXCEPTION 'launch_survey_campaign: texto esperado não encontrado';
  END IF;
  d := replace(d, E'AS $function$\nDECLARE', E'AS $function$\n#variable_conflict use_column\nDECLARE');
  d := replace(d, $q$IF NOT is_staff() THEN
    RAISE EXCEPTION 'permission denied: staff only' USING ERRCODE = '42501';$q$,
                  $q$IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'permission denied: admin only' USING ERRCODE = '42501';$q$);
  EXECUTE d;
END $$;

NOTIFY pgrst, 'reload schema';