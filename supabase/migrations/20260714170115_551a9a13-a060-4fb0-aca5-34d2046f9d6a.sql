
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
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

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

  SELECT id, status, funnel_item_id
    INTO v_intake
    FROM public.contract_intakes
   WHERE contract_id = NEW.id
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_became_signed THEN
    IF v_intake.id IS NOT NULL THEN
      IF v_intake.status NOT IN ('signed','activated') THEN
        UPDATE public.contract_intakes SET status = 'signed' WHERE id = v_intake.id;
        INSERT INTO public.intake_events (intake_id, event_type, from_status, to_status, metadata)
          VALUES (v_intake.id, 'lifecycle_sync_signed', v_intake.status, 'signed',
                  jsonb_build_object('source','trigger:contract_downstream','contract_id',NEW.id));
      END IF;
      IF v_intake.status <> 'activated' THEN
        UPDATE public.contract_intakes SET status = 'activated' WHERE id = v_intake.id;
        INSERT INTO public.intake_events (intake_id, event_type, from_status, to_status, metadata)
          VALUES (v_intake.id, 'lifecycle_sync_activated', 'signed', 'activated',
                  jsonb_build_object('source','trigger:contract_downstream','contract_id',NEW.id));
      END IF;
    END IF;

    IF v_intake.funnel_item_id IS NOT NULL THEN
      UPDATE public.funnel_items SET stage = 'contracted'
       WHERE id = v_intake.funnel_item_id
         AND stage NOT IN ('contracted','incubating','archived','rejected');
    ELSIF NEW.funnel_item_id IS NOT NULL THEN
      UPDATE public.funnel_items SET stage = 'contracted'
       WHERE id = NEW.funnel_item_id
         AND stage NOT IN ('contracted','incubating','archived','rejected');
    END IF;

    INSERT INTO public.contract_lifecycle_events (contract_id, event_type, event_date, details)
      VALUES (NEW.id, 'signature_synced_signed', CURRENT_DATE,
              jsonb_build_object('source','trigger:contract_downstream',
                                 'old_status',OLD.status,'new_status',NEW.status));

  ELSIF v_became_sent THEN
    IF v_intake.id IS NOT NULL
       AND v_intake.status NOT IN ('signature_sent','signed','activated') THEN
      UPDATE public.contract_intakes SET status = 'signature_sent' WHERE id = v_intake.id;
      INSERT INTO public.intake_events (intake_id, event_type, from_status, to_status, metadata)
        VALUES (v_intake.id, 'lifecycle_sync_signature_sent', v_intake.status, 'signature_sent',
                jsonb_build_object('source','trigger:contract_downstream','contract_id',NEW.id));
    END IF;

    IF v_intake.funnel_item_id IS NOT NULL THEN
      UPDATE public.funnel_items SET stage = 'sent_for_signature'
       WHERE id = v_intake.funnel_item_id
         AND stage NOT IN ('sent_for_signature','contracted','incubating','archived','rejected');
    ELSIF NEW.funnel_item_id IS NOT NULL THEN
      UPDATE public.funnel_items SET stage = 'sent_for_signature'
       WHERE id = NEW.funnel_item_id
         AND stage NOT IN ('sent_for_signature','contracted','incubating','archived','rejected');
    END IF;

    INSERT INTO public.contract_lifecycle_events (contract_id, event_type, event_date, details)
      VALUES (NEW.id, 'signature_synced_sent', CURRENT_DATE,
              jsonb_build_object('source','trigger:contract_downstream',
                                 'old_signature_status',OLD.signature_status,
                                 'new_signature_status',NEW.signature_status));
  END IF;

  RETURN NEW;
END;
$$;
