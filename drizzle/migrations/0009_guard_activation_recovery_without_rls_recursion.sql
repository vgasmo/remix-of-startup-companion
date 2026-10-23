DROP POLICY "Only system can manage activation recovery" ON public.startup_contracts;
CREATE OR REPLACE FUNCTION public.guard_activation_recovery() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('postgres','service_role','supabase_admin') AND NEW.activation_sync_pending IS DISTINCT FROM OLD.activation_sync_pending THEN
    RAISE EXCEPTION 'activation_recovery_system_only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_activation_recovery() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_activation_recovery BEFORE UPDATE ON public.startup_contracts FOR EACH ROW EXECUTE FUNCTION public.guard_activation_recovery();