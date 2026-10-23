ALTER POLICY "Authenticated users can view buildings" ON public.buildings USING (public.is_staff() OR public.is_backoffice() OR EXISTS (SELECT 1 FROM public.startup_contracts c WHERE c.building_id = buildings.id AND public.has_workspace_access(c.workspace_id)));
ALTER POLICY "Authenticated can read cell map" ON public.financial_cell_map USING (public.is_staff());
ALTER POLICY "Staff can manage cell map" ON public.financial_cell_map USING (public.is_staff()) WITH CHECK (public.is_staff());
ALTER POLICY "Authenticated users can read financial_model_metric_map" ON public.financial_model_metric_map USING (public.is_staff());
ALTER POLICY "Admin and consultors can manage metric mappings" ON public.financial_model_metric_map USING (public.is_staff()) WITH CHECK (public.is_staff());
ALTER POLICY "Authenticated users can view template assignments" ON public.playbook_template_assignments USING (public.is_staff() OR (public.is_account_active() AND EXISTS (SELECT 1 FROM public.playbooks p JOIN public.templates t ON t.id = playbook_template_assignments.template_id WHERE p.id = playbook_template_assignments.playbook_id AND p.is_active AND (p.program_id IS NULL OR public.has_program_access(p.program_id)) AND (t.is_global OR public.has_program_access(t.program_id)))));
ALTER POLICY "Authenticated users can read quality_checks_config" ON public.quality_checks_config USING (public.is_staff());
REVOKE ALL ON public.buildings, public.financial_cell_map, public.financial_model_metric_map, public.playbook_template_assignments, public.quality_checks_config FROM anon;

CREATE OR REPLACE FUNCTION public.guard_contract_integrity() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  trusted boolean := current_user IN ('postgres', 'service_role', 'supabase_admin');
  frozen_keys text[] := ARRAY['contract_number','start_date','end_date','monthly_fee','currency','incubation_type_id','building_id','room_id','square_meters','discount_percentage','discount_reason','discount_applied_by','discount_start_date','discount_end_date','equity_percentage','billing_day','payment_terms_days','company_nif','organization_name','company_address','company_city','company_postal_code','company_country','legal_representative_name','legal_representative_email','legal_representative_phone','additional_representatives','pricing_snapshot_json','pricing_version_id','pricing_line_id','startup_category','is_associate','has_startup_portugal_status','is_post_incubation','contract_template_version','regulation_version','regulation_accepted_at','document_url','contract_pdf_path'];
  k text;
BEGIN
  IF NOT trusted THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.signed_at IS NOT NULL OR NEW.signature_status IN ('signed','completed','partially_signed') OR NEW.status = 'active' OR NEW.signature_proof_json IS NOT NULL OR NEW.founder_signer_status = 'signed' OR NEW.counter_signer_status = 'signed' THEN
        RAISE EXCEPTION 'signature_requires_verified_action' USING ERRCODE = '42501';
      END IF;
    ELSE
      IF NEW.signed_at IS DISTINCT FROM OLD.signed_at OR NEW.signature_proof_json IS DISTINCT FROM OLD.signature_proof_json OR NEW.provider_completed_at IS DISTINCT FROM OLD.provider_completed_at OR (NEW.signature_status IS DISTINCT FROM OLD.signature_status AND NEW.signature_status IN ('signed','completed','partially_signed')) OR (NEW.founder_signer_status IS DISTINCT FROM OLD.founder_signer_status AND NEW.founder_signer_status = 'signed') OR (NEW.counter_signer_status IS DISTINCT FROM OLD.counter_signer_status AND NEW.counter_signer_status = 'signed') THEN
        RAISE EXCEPTION 'signature_requires_verified_action' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;
  IF NEW.status = 'active' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'active') THEN
    IF NEW.signed_at IS NULL OR NEW.signature_status NOT IN ('signed','completed') OR NEW.signature_status IS NULL THEN
      RAISE EXCEPTION 'contract_signature_required' USING ERRCODE = '42501';
    END IF;
    IF NOT trusted AND NOT (TG_OP = 'UPDATE' AND OLD.status = 'suspended' AND OLD.signed_at IS NOT NULL AND OLD.signature_status IN ('signed','completed')) THEN
      RAISE EXCEPTION 'activation_requires_verified_action' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND (OLD.signed_at IS NOT NULL OR OLD.signature_status IN ('signed','completed','partially_signed')) THEN
    IF NEW.signed_at IS DISTINCT FROM OLD.signed_at AND OLD.signed_at IS NOT NULL THEN
      RAISE EXCEPTION 'signature_timestamp_immutable' USING ERRCODE = '42501';
    END IF;
    FOREACH k IN ARRAY frozen_keys LOOP
      IF (to_jsonb(NEW)->k) IS DISTINCT FROM (to_jsonb(OLD)->k) THEN
        IF k IN ('end_date','monthly_fee') AND current_user = 'postgres' AND current_setting('app.contract_renewal', true) = OLD.id::text THEN CONTINUE; END IF;
        IF k = 'end_date' AND current_user = 'service_role' AND NEW.end_date > OLD.end_date THEN CONTINUE; END IF;
        RAISE EXCEPTION 'signed_contract_terms_immutable: %', k USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_contract_integrity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_contract_integrity BEFORE INSERT OR UPDATE ON public.startup_contracts FOR EACH ROW EXECUTE FUNCTION public.guard_contract_integrity();

CREATE OR REPLACE FUNCTION public.staff_record_manual_contract_signature(p_contract_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.startup_contracts%ROWTYPE;
BEGIN
  IF NOT (public.is_staff() OR public.is_backoffice()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.startup_contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract_not_found' USING ERRCODE = 'P0002'; END IF;
  IF c.status = 'active' AND c.signed_at IS NOT NULL AND c.signature_status IN ('signed','completed') THEN RETURN; END IF;
  IF c.status NOT IN ('draft','pending_signature') OR c.signature_status IN ('declined','voided') THEN RAISE EXCEPTION 'contract_not_signable' USING ERRCODE = '42501'; END IF;
  UPDATE public.startup_contracts SET signature_status = 'signed', signed_at = COALESCE(signed_at, now()), status = 'active', founder_signer_status = 'signed', counter_signer_status = 'signed', updated_at = now() WHERE id = c.id;
  INSERT INTO public.contract_lifecycle_events(contract_id,event_type,event_date,performed_by,details) VALUES(c.id,'manual_signature_recorded',current_date,auth.uid(),jsonb_build_object('source','staff_record_manual_contract_signature','method','staff_attestation'));
END $$;
REVOKE ALL ON FUNCTION public.staff_record_manual_contract_signature(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_record_manual_contract_signature(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_renew_contract(p_contract_id uuid, p_end_date date, p_monthly_fee numeric, p_term_start date DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c public.startup_contracts%ROWTYPE;
BEGIN
  IF NOT (public.is_staff() OR public.is_backoffice()) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.startup_contracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract_not_found' USING ERRCODE = 'P0002'; END IF;
  IF c.status NOT IN ('active','expired') OR c.signed_at IS NULL OR c.signature_status NOT IN ('signed','completed') OR c.signature_status IS NULL THEN RAISE EXCEPTION 'contract_signature_required' USING ERRCODE = '42501'; END IF;
  IF p_end_date IS NULL OR (c.end_date IS NOT NULL AND p_end_date <= c.end_date) THEN RAISE EXCEPTION 'end_date_not_after_current' USING ERRCODE = '22023'; END IF;
  IF p_monthly_fee IS NULL OR p_monthly_fee < 0 THEN RAISE EXCEPTION 'invalid_monthly_fee' USING ERRCODE = '22023'; END IF;
  PERFORM set_config('app.contract_renewal', c.id::text, true);
  UPDATE public.startup_contracts SET end_date=p_end_date, monthly_fee=p_monthly_fee, status='active', terminated_at=NULL, termination_reason=NULL, updated_at=now() WHERE id=c.id;
  PERFORM set_config('app.contract_renewal', '', true);
  INSERT INTO public.contract_lifecycle_events(contract_id,event_type,event_date,performed_by,details) VALUES(c.id,'renewal',current_date,auth.uid(),jsonb_build_object('previous_end_date',c.end_date,'new_term_start',p_term_start,'new_end_date',p_end_date,'previous_monthly_fee',c.monthly_fee,'monthly_fee',p_monthly_fee));
END $$;
REVOKE ALL ON FUNCTION public.staff_renew_contract(uuid,date,numeric,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_renew_contract(uuid,date,numeric,date) TO authenticated;