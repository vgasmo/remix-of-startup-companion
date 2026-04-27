-- Forward neutralizing migration: re-assert correct contract intake validation
-- and ensure no legacy/stale lifecycle labels persist in startup_contracts.
-- This does not edit historical migrations; it asserts the canonical end state.

-- 1) Re-assert validate_intake_contract_link trigger logic (idempotent canonical version)
CREATE OR REPLACE FUNCTION public.validate_intake_contract_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Critical states that MUST have a contract_id
  IF NEW.status IN ('approved_for_signature', 'signature_sent', 'signed', 'activated') THEN
    IF NEW.contract_id IS NULL THEN
      RAISE EXCEPTION 'Cannot transition intake to "%" without a linked contract (contract_id is NULL). Create or link a contract first.', NEW.status
        USING HINT = 'Ensure a startup_contracts record is created and linked before approving for signature.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.startup_contracts WHERE id = NEW.contract_id) THEN
      RAISE EXCEPTION 'contract_id "%" references a non-existent contract record.', NEW.contract_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Ensure the trigger is attached (drop+create to guarantee canonical binding)
DROP TRIGGER IF EXISTS trg_validate_intake_contract_link ON public.contract_intakes;
CREATE TRIGGER trg_validate_intake_contract_link
  BEFORE INSERT OR UPDATE ON public.contract_intakes
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_intake_contract_link();

-- 2) Neutralize any stale legacy 'contract_active' status remnant in startup_contracts
--    by mapping to canonical 'active' (no-op when none exist).
UPDATE public.startup_contracts
SET status = 'active'
WHERE status::text = 'contract_active';
