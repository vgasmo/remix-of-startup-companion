
-- =====================================================================
-- Canonical signature-state sync: startup_contracts ↔ contract_intakes ↔ funnel_items
-- Single source of truth with bidirectional propagation guarded against loops
-- via pg_trigger_depth() so any of the three sides can be the entrypoint.
-- =====================================================================

-- ---------- 1. Contract → Intake + CRM (canonical outbound) ----------
CREATE OR REPLACE FUNCTION public.sync_contract_signature_downstream()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intake RECORD;
  v_became_sent   boolean := false;
  v_became_signed boolean := false;
BEGIN
  -- Only run at depth 1 to avoid cascading loops from sibling triggers
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  -- Detect transitions
  v_became_sent := (
    (COALESCE(NEW.signature_status,'') = 'sent_for_signature'
       AND COALESCE(OLD.signature_status,'') <> 'sent_for_signature')
    OR
    (COALESCE(NEW.status,'') = 'pending_signature'
       AND COALESCE(OLD.status,'') <> 'pending_signature')
  );

  v_became_signed := (
    (NEW.signed_at IS NOT NULL AND OLD.signed_at IS NULL)
    OR
    (COALESCE(NEW.status,'') IN ('active','signed')
       AND COALESCE(OLD.status,'') NOT IN ('active','signed'))
  );

  IF NOT v_became_sent AND NOT v_became_signed THEN
    RETURN NEW;
  END IF;

  -- Locate the most recent linked intake (may be null for CRM-direct contracts)
  SELECT id, status, funnel_item_id
    INTO v_intake
    FROM public.contract_intakes
   WHERE contract_id = NEW.id
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_became_signed THEN
    IF v_intake.id IS NOT NULL THEN
      IF v_intake.status NOT IN ('signed','activated') THEN
        UPDATE public.contract_intakes
           SET status = 'signed'
         WHERE id = v_intake.id;
        INSERT INTO public.intake_events (intake_id, event_type, from_status, to_status, metadata)
          VALUES (v_intake.id, 'lifecycle_sync_signed', v_intake.status, 'signed',
                  jsonb_build_object('source','trigger:contract_downstream','contract_id',NEW.id));
      END IF;
      IF v_intake.status <> 'activated' THEN
        UPDATE public.contract_intakes
           SET status = 'activated'
         WHERE id = v_intake.id;
        INSERT INTO public.intake_events (intake_id, event_type, from_status, to_status, metadata)
          VALUES (v_intake.id, 'lifecycle_sync_activated', 'signed', 'activated',
                  jsonb_build_object('source','trigger:contract_downstream','contract_id',NEW.id));
      END IF;
    END IF;

    -- CRM funnel: contracted (via intake or direct contract link)
    IF v_intake.funnel_item_id IS NOT NULL THEN
      UPDATE public.funnel_items
         SET stage = 'contracted'
       WHERE id = v_intake.funnel_item_id
         AND stage NOT IN ('contracted','incubating','archived','rejected');
    ELSIF NEW.funnel_item_id IS NOT NULL THEN
      UPDATE public.funnel_items
         SET stage = 'contracted'
       WHERE id = NEW.funnel_item_id
         AND stage NOT IN ('contracted','incubating','archived','rejected');
    END IF;

    INSERT INTO public.contract_lifecycle_events (contract_id, event_type, metadata)
      VALUES (NEW.id, 'signature_synced_signed',
              jsonb_build_object('source','trigger:contract_downstream',
                                 'old_status',OLD.status,'new_status',NEW.status));

  ELSIF v_became_sent THEN
    IF v_intake.id IS NOT NULL
       AND v_intake.status NOT IN ('signature_sent','signed','activated') THEN
      UPDATE public.contract_intakes
         SET status = 'signature_sent'
       WHERE id = v_intake.id;
      INSERT INTO public.intake_events (intake_id, event_type, from_status, to_status, metadata)
        VALUES (v_intake.id, 'lifecycle_sync_signature_sent', v_intake.status, 'signature_sent',
                jsonb_build_object('source','trigger:contract_downstream','contract_id',NEW.id));
    END IF;

    IF v_intake.funnel_item_id IS NOT NULL THEN
      UPDATE public.funnel_items
         SET stage = 'sent_for_signature'
       WHERE id = v_intake.funnel_item_id
         AND stage NOT IN ('sent_for_signature','contracted','incubating','archived','rejected');
    ELSIF NEW.funnel_item_id IS NOT NULL THEN
      UPDATE public.funnel_items
         SET stage = 'sent_for_signature'
       WHERE id = NEW.funnel_item_id
         AND stage NOT IN ('sent_for_signature','contracted','incubating','archived','rejected');
    END IF;

    INSERT INTO public.contract_lifecycle_events (contract_id, event_type, metadata)
      VALUES (NEW.id, 'signature_synced_sent',
              jsonb_build_object('source','trigger:contract_downstream',
                                 'old_signature_status',OLD.signature_status,
                                 'new_signature_status',NEW.signature_status));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_contract_signature_downstream ON public.startup_contracts;
CREATE TRIGGER trg_sync_contract_signature_downstream
AFTER UPDATE OF status, signature_status, signed_at, signature_requested_at
ON public.startup_contracts
FOR EACH ROW
EXECUTE FUNCTION public.sync_contract_signature_downstream();


-- ---------- 2. Intake → Contract (inbound sync) ----------
CREATE OR REPLACE FUNCTION public.sync_intake_status_to_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.contract_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  IF NEW.status = 'signature_sent' THEN
    UPDATE public.startup_contracts
       SET status = 'pending_signature',
           signature_status = COALESCE(signature_status,'sent_for_signature'),
           signature_requested_at = COALESCE(signature_requested_at, now())
     WHERE id = NEW.contract_id
       AND status IS DISTINCT FROM 'active'
       AND signed_at IS NULL;

  ELSIF NEW.status IN ('signed','activated') THEN
    UPDATE public.startup_contracts
       SET signed_at = COALESCE(signed_at, now()),
           status = CASE WHEN status IN ('terminated','cancelled') THEN status ELSE 'active' END,
           signature_status = COALESCE(signature_status,'completed')
     WHERE id = NEW.contract_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_intake_status_to_contract ON public.contract_intakes;
CREATE TRIGGER trg_sync_intake_status_to_contract
AFTER UPDATE OF status ON public.contract_intakes
FOR EACH ROW
EXECUTE FUNCTION public.sync_intake_status_to_contract();


-- ---------- 3. CRM funnel stage → Contract (inbound sync) ----------
CREATE OR REPLACE FUNCTION public.sync_funnel_stage_to_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.linked_contract_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN RETURN NEW; END IF;

  IF NEW.stage = 'sent_for_signature' THEN
    UPDATE public.startup_contracts
       SET status = 'pending_signature',
           signature_status = COALESCE(signature_status,'sent_for_signature'),
           signature_requested_at = COALESCE(signature_requested_at, now())
     WHERE id = NEW.linked_contract_id
       AND signed_at IS NULL
       AND status NOT IN ('active','terminated','cancelled');

  ELSIF NEW.stage IN ('contracted','incubating') THEN
    UPDATE public.startup_contracts
       SET signed_at = COALESCE(signed_at, now()),
           status = CASE WHEN status IN ('terminated','cancelled') THEN status ELSE 'active' END,
           signature_status = COALESCE(signature_status,'completed')
     WHERE id = NEW.linked_contract_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_funnel_stage_to_contract ON public.funnel_items;
CREATE TRIGGER trg_sync_funnel_stage_to_contract
AFTER UPDATE OF stage ON public.funnel_items
FOR EACH ROW
EXECUTE FUNCTION public.sync_funnel_stage_to_contract();

GRANT EXECUTE ON FUNCTION public.sync_contract_signature_downstream() TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_intake_status_to_contract()     TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_funnel_stage_to_contract()      TO service_role, authenticated;
