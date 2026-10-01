-- RC10 · Parte B — restantes defeitos MED dos fluxos (CRM, assinatura, onboarding)
CREATE OR REPLACE FUNCTION public.backoffice_archive_workspace(p_workspace_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_staff() OR public.can_access_backoffice()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.startup_contracts c
              WHERE c.workspace_id = p_workspace_id AND c.status IN ('active','pending_signature','suspended')) THEN
    RETURN false;
  END IF;
  IF NOT public.is_staff() AND NOT EXISTS (SELECT 1 FROM public.startup_contracts c
              WHERE c.workspace_id = p_workspace_id AND c.status IN ('terminated','expired')) THEN
    RAISE EXCEPTION 'workspace_not_archivable' USING ERRCODE = '42501';
  END IF;
  UPDATE public.workspaces SET status = 'archived', archived_at = now(), updated_at = now()
   WHERE id = p_workspace_id AND status <> 'archived';
  RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION public.backoffice_archive_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backoffice_archive_workspace(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.prevent_invitee_field_tampering()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_is_staff boolean;
BEGIN
  IF coalesce(auth.role(), '') = 'service_role' THEN RETURN NEW; END IF;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
                  AND role = ANY (ARRAY['admin'::app_role, 'consultor'::app_role])) INTO v_is_staff;
  IF v_is_staff THEN RETURN NEW; END IF;
  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
     OR NEW.startup_id IS DISTINCT FROM OLD.startup_id OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.token_hash IS DISTINCT FROM OLD.token_hash OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
     OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'Invitees can only accept invitations; other fields are immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $function$;

DO $$
DECLARE f regprocedure; d text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.claim_startup()'::regprocedure,
    'public.staff_create_workspace_for_claim(uuid,text,uuid,text,text)'::regprocedure,
    'public.staff_assign_or_create_workspace(uuid,text,uuid,text,uuid,text,text)'::regprocedure]
  LOOP
    d := pg_get_functiondef(f);
    IF position($q$account_status != 'approved'$q$ IN d) > 0 THEN
      EXECUTE replace(d, $q$account_status != 'approved'$q$, $q$account_status = 'pending'$q$);
    ELSIF position($q$account_status = 'pending'$q$ IN d) = 0 THEN
      RAISE EXCEPTION 'RC10 B3: padrão account_status não encontrado em %', f;
    END IF;
  END LOOP;
  d := pg_get_functiondef('public.claim_startup()'::regprocedure);
  IF position('account_suspended' IN d) = 0 THEN
    IF position($q$SELECT email, email_confirmed_at$q$ IN d) = 0 THEN
      RAISE EXCEPTION 'RC10 B3: texto esperado não encontrado em claim_startup';
    END IF;
    EXECUTE replace(d, $q$SELECT email, email_confirmed_at$q$,
      $q$IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id AND account_status = 'suspended') THEN
    RAISE EXCEPTION 'account_suspended' USING ERRCODE = '42501';
  END IF;

  SELECT email, email_confirmed_at$q$);
  END IF;
END $$;

DROP POLICY IF EXISTS "Backoffice can view CRM communications" ON public.communication_log;
CREATE POLICY "Backoffice can view CRM communications" ON public.communication_log
  FOR SELECT TO authenticated
  USING (public.is_backoffice() AND funnel_item_id IS NOT NULL);
DROP POLICY IF EXISTS "Backoffice can log CRM activities" ON public.communication_log;
CREATE POLICY "Backoffice can log CRM activities" ON public.communication_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_backoffice() AND funnel_item_id IS NOT NULL
              AND activity_type IN ('note','call','meeting','task'));
DROP POLICY IF EXISTS "Backoffice can update CRM tasks" ON public.communication_log;
CREATE POLICY "Backoffice can update CRM tasks" ON public.communication_log
  FOR UPDATE TO authenticated
  USING (public.is_backoffice() AND funnel_item_id IS NOT NULL AND activity_type = 'task')
  WITH CHECK (public.is_backoffice() AND funnel_item_id IS NOT NULL AND activity_type = 'task');

DROP POLICY IF EXISTS "Backoffice can view staff roles" ON public.user_roles;
CREATE POLICY "Backoffice can view staff roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (role IN ('admin'::public.app_role, 'consultor'::public.app_role) AND public.is_backoffice());

CREATE OR REPLACE FUNCTION public.safe_profiles()
 RETURNS TABLE(id uuid, full_name text, avatar_url text, bio text, expertise text[], email text, phone text, linkedin_url text, created_at timestamp with time zone, updated_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT p.id,
         p.full_name,
         p.avatar_url,
         p.bio,
         p.expertise,
         CASE WHEN auth.uid() = p.id OR public.is_staff() THEN p.email END AS email,
         CASE WHEN auth.uid() = p.id OR public.is_staff() THEN p.phone END AS phone,
         CASE WHEN auth.uid() = p.id OR public.is_staff() THEN p.linkedin_url END AS linkedin_url,
         p.created_at,
         p.updated_at
    FROM public.profiles p
   WHERE auth.uid() IS NOT NULL
     AND (
       auth.uid() = p.id
       OR public.is_staff()
       OR (public.is_backoffice() AND EXISTS (
             SELECT 1 FROM public.user_roles r
              WHERE r.user_id = p.id AND r.role IN ('admin'::public.app_role, 'consultor'::public.app_role)))
       OR EXISTS (
         SELECT 1
           FROM public.workspace_users a
           JOIN public.workspace_users b ON a.workspace_id = b.workspace_id
          WHERE a.user_id = auth.uid() AND a.active
            AND b.user_id = p.id AND b.active
       )
     );
$function$;

UPDATE public.startup_contracts
   SET document_url = contract_pdf_path,
       pricing_snapshot_json = COALESCE(pricing_snapshot_json, '{}'::jsonb) || jsonb_build_object('pdf_bucket', 'contract-imports')
 WHERE signed_at IS NOT NULL AND document_url LIKE 'generated/%'
   AND contract_pdf_path IS NOT NULL AND contract_pdf_path <> document_url;