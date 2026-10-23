ALTER TABLE public.startup_contracts ADD COLUMN IF NOT EXISTS activation_sync_pending boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION public.queue_signed_contract_activation() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.signature_status IN ('signed','completed') AND NEW.signed_at IS NOT NULL AND NEW.status IN ('draft','pending_signature','active') THEN
    IF TG_OP = 'INSERT' OR OLD.signature_status IS DISTINCT FROM NEW.signature_status OR OLD.signed_at IS DISTINCT FROM NEW.signed_at THEN NEW.activation_sync_pending := true; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.queue_signed_contract_activation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER queue_signed_contract_activation BEFORE INSERT OR UPDATE ON public.startup_contracts FOR EACH ROW EXECUTE FUNCTION public.queue_signed_contract_activation();
CREATE POLICY "Only system can manage activation recovery" ON public.startup_contracts AS RESTRICTIVE FOR UPDATE TO authenticated USING (true) WITH CHECK (activation_sync_pending = (SELECT c.activation_sync_pending FROM public.startup_contracts c WHERE c.id = startup_contracts.id));