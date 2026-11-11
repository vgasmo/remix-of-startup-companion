CREATE OR REPLACE FUNCTION public.guard_contract_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
      -- RC13: a partially/fully signed contract can only move to declined/voided, never back to an editable state
      IF OLD.signature_status IN ('partially_signed','signed','completed')
         AND NEW.signature_status IS DISTINCT FROM OLD.signature_status
         AND COALESCE(NEW.signature_status,'') NOT IN ('declined','voided') THEN
        RAISE EXCEPTION 'signature_state_regression_forbidden' USING ERRCODE = '42501';
      END IF;
      IF COALESCE(OLD.signature_status,'') NOT IN ('declined','voided') AND (
           (OLD.founder_signer_status = 'signed' AND NEW.founder_signer_status IS DISTINCT FROM 'signed')
        OR (OLD.counter_signer_status = 'signed' AND NEW.counter_signer_status IS DISTINCT FROM 'signed')) THEN
        RAISE EXCEPTION 'signer_status_regression_forbidden' USING ERRCODE = '42501';
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
END $function$;

CREATE OR REPLACE FUNCTION public.guard_signed_contract_discounts()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contract_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.contract_id ELSE NEW.contract_id END;
  v_locked boolean;
BEGIN
  IF current_setting('app.contract_renewal', true) = v_contract_id::text THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  SELECT (signed_at IS NOT NULL OR signature_status IN ('partially_signed','signed','completed'))
    INTO v_locked FROM public.startup_contracts WHERE id = v_contract_id;
  IF TG_OP = 'UPDATE' AND NEW.contract_id IS DISTINCT FROM OLD.contract_id AND NOT COALESCE(v_locked,false) THEN
    SELECT (signed_at IS NOT NULL OR signature_status IN ('partially_signed','signed','completed'))
      INTO v_locked FROM public.startup_contracts WHERE id = OLD.contract_id;
  END IF;
  IF COALESCE(v_locked, false) THEN
    RAISE EXCEPTION 'signed_contract_discounts_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $function$;

DROP TRIGGER IF EXISTS guard_signed_contract_discounts ON public.contract_discounts;
CREATE TRIGGER guard_signed_contract_discounts
  BEFORE INSERT OR UPDATE OR DELETE ON public.contract_discounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_signed_contract_discounts();