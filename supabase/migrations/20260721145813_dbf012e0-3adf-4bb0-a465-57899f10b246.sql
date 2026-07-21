
-- C3: Atomic public first-contact booking commit
-- Wraps idempotency lookup + early-stage reuse + insert + event log in a single txn.
CREATE OR REPLACE FUNCTION public.commit_first_contact_booking_atomic(
  p_idempotency_key text,
  p_contact jsonb,
  p_slot jsonb,
  p_consultant_id uuid,
  p_program_id uuid,
  p_metadata jsonb,
  p_routing_decision jsonb
)
RETURNS TABLE (funnel_item_id uuid, mode text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(coalesce(p_contact->>'email',''));
  v_name text := coalesce(p_contact->>'name','');
  v_phone text := nullif(coalesce(p_contact->>'phone',''),'');
  v_org text := nullif(coalesce(p_contact->>'organization',''),'');
  v_msg text := nullif(coalesce(p_contact->>'message',''),'');
  v_slot_date text := p_slot->>'date';
  v_slot_time text := p_slot->>'time';
  v_first_contact_at timestamptz := (v_slot_date || 'T' || v_slot_time || ':00')::timestamptz;
  v_existing_id uuid;
  v_existing_stage text;
  v_existing_meta jsonb;
  v_new_id uuid;
BEGIN
  IF v_email = '' THEN
    RAISE EXCEPTION 'email_required';
  END IF;

  -- 1) Idempotency: same idempotency_key already committed?
  SELECT id INTO v_existing_id
  FROM public.funnel_items
  WHERE metadata_json->>'idempotency_key' = p_idempotency_key
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    funnel_item_id := v_existing_id;
    mode := 'idempotent_reuse';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 2) Early-stage lead reuse (lock the row so a concurrent booking doesn't race)
  SELECT id, stage, metadata_json
    INTO v_existing_id, v_existing_stage, v_existing_meta
  FROM public.funnel_items
  WHERE contact_email = v_email
    AND stage IN ('new','first_contact_booked')
  ORDER BY created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.funnel_items
       SET first_contact_at = v_first_contact_at,
           stage = CASE WHEN v_existing_stage = 'new' THEN 'first_contact_booked' ELSE v_existing_stage END,
           owner_consultant_id = p_consultant_id,
           program_id = p_program_id,
           last_activity_at = now(),
           metadata_json = coalesce(v_existing_meta,'{}'::jsonb) || coalesce(p_metadata,'{}'::jsonb)
     WHERE id = v_existing_id;

    INSERT INTO public.funnel_events (funnel_item_id, event_type, metadata)
    VALUES (v_existing_id, 'booking_rescheduled',
            jsonb_build_object('date', v_slot_date, 'time', v_slot_time,
                               'source','public_booking',
                               'routing', p_routing_decision));

    funnel_item_id := v_existing_id;
    mode := 'reused_early_stage';
    RETURN NEXT;
    RETURN;
  END IF;

  -- 3) Fresh insert
  INSERT INTO public.funnel_items (
    stage, type, contact_name, contact_email, contact_phone,
    organization_name, notes, source, program_id, owner_consultant_id,
    first_contact_at, metadata_json
  ) VALUES (
    'first_contact_booked','lead', v_name, v_email, v_phone,
    v_org, v_msg, 'public_booking', p_program_id, p_consultant_id,
    v_first_contact_at, coalesce(p_metadata,'{}'::jsonb)
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.funnel_events (funnel_item_id, event_type, to_stage, metadata)
  VALUES (v_new_id, 'created', 'first_contact_booked',
          jsonb_build_object('source','public_booking',
                             'slot', p_slot,
                             'routing', p_routing_decision));

  funnel_item_id := v_new_id;
  mode := 'created';
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_first_contact_booking_atomic(text, jsonb, jsonb, uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_first_contact_booking_atomic(text, jsonb, jsonb, uuid, uuid, jsonb, jsonb) TO service_role;

-- C4: Atomic CRM staged import commit
-- Transactionally claims batch, inserts valid rows into funnel_items and
-- marks each staged row as committed. Per-row failures are captured but do
-- not abort the whole batch (uses a subtransaction per row).
CREATE OR REPLACE FUNCTION public.commit_crm_lead_import_batch_atomic(
  p_batch_id uuid,
  p_authorized_row_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (committed integer, errors jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_status text;
  v_created_by uuid;
  v_row record;
  v_inserted_id uuid;
  v_committed integer := 0;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  -- Lock batch row for the duration of the commit
  SELECT status, created_by
    INTO v_batch_status, v_created_by
  FROM public.crm_lead_import_batches
  WHERE id = p_batch_id
  FOR UPDATE;

  IF v_batch_status IS NULL THEN
    RAISE EXCEPTION 'batch_not_found';
  END IF;
  IF v_batch_status <> 'staged' THEN
    RAISE EXCEPTION 'batch_not_in_staged_state:%', v_batch_status;
  END IF;

  UPDATE public.crm_lead_import_batches
     SET status = 'committing'
   WHERE id = p_batch_id;

  FOR v_row IN
    SELECT id, contact_name, contact_email, contact_phone, organization_name,
           source, notes, deal_value
    FROM public.crm_lead_import_rows
    WHERE batch_id = p_batch_id
      AND valid = true
      AND committed_funnel_item_id IS NULL
      AND (p_authorized_row_ids IS NULL OR id = ANY(p_authorized_row_ids))
    ORDER BY row_index
  LOOP
    BEGIN
      INSERT INTO public.funnel_items (
        contact_name, contact_email, contact_phone, organization_name,
        source, notes, deal_value, stage, type, owner_consultant_id
      ) VALUES (
        v_row.contact_name, v_row.contact_email, v_row.contact_phone,
        v_row.organization_name, coalesce(v_row.source, 'csv_import'),
        v_row.notes, v_row.deal_value, 'new', 'lead', v_created_by
      )
      RETURNING id INTO v_inserted_id;

      UPDATE public.crm_lead_import_rows
         SET committed_funnel_item_id = v_inserted_id
       WHERE id = v_row.id;

      v_committed := v_committed + 1;
    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors || jsonb_build_object(
        'row_id', v_row.id,
        'error', SQLERRM
      );
    END;
  END LOOP;

  UPDATE public.crm_lead_import_batches
     SET status = CASE
           WHEN jsonb_array_length(v_errors) > 0 AND v_committed = 0 THEN 'failed'
           ELSE 'committed'
         END,
         committed_rows = v_committed,
         committed_at = now()
   WHERE id = p_batch_id;

  committed := v_committed;
  errors := v_errors;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_crm_lead_import_batch_atomic(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_crm_lead_import_batch_atomic(uuid, uuid[]) TO service_role;
