CREATE TABLE IF NOT EXISTS public.integration_errors (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
 program_id uuid REFERENCES public.programs(id) ON DELETE SET NULL,
 integration_type text NOT NULL DEFAULT 'other', source text, error_code text, error_message text NOT NULL,
 error_details jsonb, request_payload jsonb, metadata jsonb, created_at timestamptz NOT NULL DEFAULT now(),
 resolved_at timestamptz, resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
REVOKE ALL ON public.integration_errors FROM PUBLIC,anon,authenticated;
GRANT SELECT,UPDATE ON public.integration_errors TO authenticated;
GRANT ALL ON public.integration_errors TO service_role;
CREATE INDEX IF NOT EXISTS idx_integration_errors_open ON public.integration_errors(created_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_integration_errors_workspace ON public.integration_errors(workspace_id) WHERE workspace_id IS NOT NULL;
ALTER TABLE public.integration_errors ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.integration_errors_normalize() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.integration_type IS NULL OR NEW.integration_type IN ('other','unknown') THEN NEW.integration_type:=COALESCE(NULLIF(NEW.source,''),'other'); END IF;
 NEW.error_message:=left(COALESCE(NEW.error_message,''),2000); RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_integration_errors_normalize ON public.integration_errors;
CREATE TRIGGER trg_integration_errors_normalize BEFORE INSERT ON public.integration_errors FOR EACH ROW EXECUTE FUNCTION public.integration_errors_normalize();
DROP POLICY IF EXISTS integration_errors_admin_select ON public.integration_errors;
CREATE POLICY integration_errors_admin_select ON public.integration_errors FOR SELECT TO authenticated USING(public.is_admin());
DROP POLICY IF EXISTS integration_errors_admin_update ON public.integration_errors;
CREATE POLICY integration_errors_admin_update ON public.integration_errors FOR UPDATE TO authenticated USING(public.is_admin()) WITH CHECK(public.is_admin());
DROP POLICY IF EXISTS rc12_suspended_block ON public.integration_errors;
CREATE POLICY rc12_suspended_block ON public.integration_errors AS RESTRICTIVE FOR ALL TO authenticated USING((SELECT public.account_not_suspended((SELECT auth.uid())))) WITH CHECK((SELECT public.account_not_suspended((SELECT auth.uid()))));
CREATE OR REPLACE FUNCTION public.notify_admins_on_system_alert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_key text;
BEGIN
 IF NEW.severity NOT IN ('critical','high') THEN RETURN NEW; END IF;
 v_key:='system_alert:'||NEW.kind||':'||COALESCE(NEW.payload->>'job','-')||':'||to_char(NEW.created_at,'YYYY-MM-DD');
 INSERT INTO public.notifications(user_id,type,title,message,link,metadata,entity_type,entity_id,event_key)
 SELECT ur.user_id,'system_alert','Alerta do sistema: '||NEW.kind,left(COALESCE(NEW.payload->>'job',NEW.kind)||' ('||NEW.severity||')',300),'/admin?tab=system-health',jsonb_build_object('alert_id',NEW.id,'severity',NEW.severity,'payload',NEW.payload),'system_alert',NEW.id,v_key FROM public.user_roles ur WHERE ur.role='admin'
 ON CONFLICT(user_id,event_key) WHERE event_key IS NOT NULL DO NOTHING;
 RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_admins_on_system_alert() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_notify_admins_on_system_alert ON public.system_alerts;
CREATE TRIGGER trg_notify_admins_on_system_alert AFTER INSERT ON public.system_alerts FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_system_alert();
NOTIFY pgrst,'reload schema';