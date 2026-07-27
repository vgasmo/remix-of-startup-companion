CREATE OR REPLACE FUNCTION public.commit_first_contact_booking_atomic(
  p_idempotency_key text, p_contact jsonb, p_slot jsonb, p_consultant_id uuid,
  p_program_id uuid, p_metadata jsonb, p_routing_decision jsonb
) RETURNS TABLE (funnel_item_id uuid, mode text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text := lower(coalesce(p_contact->>'email',''));
  v_name text := coalesce(p_contact->>'name','');
  v_phone text := nullif(coalesce(p_contact->>'phone',''),'');
  v_org text := nullif(coalesce(p_contact->>'organization',''),'');
  v_msg text := nullif(coalesce(p_contact->>'message',''),'');
  v_slot_date text := p_slot->>'date';
  v_slot_time text := p_slot->>'time';
  v_first_contact_at timestamptz :=
    ((v_slot_date || 'T' || v_slot_time || ':00')::timestamp) AT TIME ZONE 'Europe/Lisbon';
  v_link_id uuid := nullif(p_routing_decision->>'link_id','')::uuid;
  v_existing_id uuid; v_existing_stage text; v_existing_meta jsonb;
  v_new_id uuid; v_enriched_meta jsonb;
BEGIN
  IF v_email = '' THEN RAISE EXCEPTION 'email_required'; END IF;

  v_enriched_meta := coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object(
    'booking_slot_utc', to_char(v_first_contact_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'submitter_email_normalized', v_email, 'link_id', v_link_id);

  SELECT id INTO v_existing_id FROM public.funnel_items
   WHERE metadata_json->>'idempotency_key' = p_idempotency_key LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    funnel_item_id := v_existing_id; mode := 'idempotent_reuse'; RETURN NEXT; RETURN;
  END IF;

  IF v_link_id IS NOT NULL THEN
    SELECT id INTO v_existing_id FROM public.funnel_items
     WHERE (metadata_json->>'link_id')::uuid = v_link_id
       AND metadata_json->>'submitter_email_normalized' = v_email
       AND metadata_json->>'booking_slot_utc' = v_enriched_meta->>'booking_slot_utc'
     LIMIT 1 FOR UPDATE;
    IF v_existing_id IS NOT NULL THEN
      funnel_item_id := v_existing_id; mode := 'idempotent_reuse'; RETURN NEXT; RETURN;
    END IF;
  END IF;

  SELECT id, stage, metadata_json INTO v_existing_id, v_existing_stage, v_existing_meta
    FROM public.funnel_items
   WHERE contact_email = v_email AND stage IN ('new','first_contact_booked')
   ORDER BY created_at DESC LIMIT 1 FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.funnel_items
       SET first_contact_at = v_first_contact_at,
           stage = CASE WHEN v_existing_stage = 'new' THEN 'first_contact_booked' ELSE v_existing_stage END,
           owner_consultant_id = p_consultant_id,
           program_id = p_program_id,
           last_activity_at = now(),
           metadata_json = public.jsonb_deep_merge(coalesce(v_existing_meta,'{}'::jsonb), v_enriched_meta)
     WHERE id = v_existing_id;
    INSERT INTO public.funnel_events (funnel_item_id, event_type, metadata)
    VALUES (v_existing_id, 'booking_rescheduled',
            jsonb_build_object('date', v_slot_date, 'time', v_slot_time,
                               'source','public_booking', 'routing', p_routing_decision));
    funnel_item_id := v_existing_id; mode := 'reused_early_stage'; RETURN NEXT; RETURN;
  END IF;

  BEGIN
    INSERT INTO public.funnel_items (stage, type, contact_name, contact_email, contact_phone,
      organization_name, notes, source, program_id, owner_consultant_id, first_contact_at, metadata_json)
    VALUES ('first_contact_booked','lead', v_name, v_email, v_phone, v_org, v_msg, 'public_booking',
      p_program_id, p_consultant_id, v_first_contact_at, v_enriched_meta)
    RETURNING id INTO v_new_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO v_existing_id FROM public.funnel_items
     WHERE metadata_json->>'idempotency_key' = p_idempotency_key LIMIT 1;
    IF v_existing_id IS NULL THEN RAISE; END IF;
    funnel_item_id := v_existing_id; mode := 'idempotent_reuse'; RETURN NEXT; RETURN;
  END;

  INSERT INTO public.funnel_events (funnel_item_id, event_type, to_stage, metadata)
  VALUES (v_new_id, 'created', 'first_contact_booked',
          jsonb_build_object('source','public_booking', 'slot', p_slot, 'routing', p_routing_decision));

  funnel_item_id := v_new_id; mode := 'created'; RETURN NEXT;
END; $$;

REVOKE ALL ON FUNCTION public.commit_first_contact_booking_atomic(text, jsonb, jsonb, uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_first_contact_booking_atomic(text, jsonb, jsonb, uuid, uuid, jsonb, jsonb) TO service_role;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_funnel_items_link_email_slot_utc
  ON public.funnel_items (((metadata_json->>'link_id')), ((metadata_json->>'submitter_email_normalized')), ((metadata_json->>'booking_slot_utc')))
  WHERE metadata_json ? 'link_id' AND metadata_json ? 'submitter_email_normalized' AND metadata_json ? 'booking_slot_utc';

CREATE OR REPLACE FUNCTION public.claim_first_contact_outbox_batch(p_batch_size int DEFAULT 25, p_lease_seconds int DEFAULT 120)
RETURNS SETOF public.first_contact_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT id FROM public.first_contact_outbox
    WHERE status IN ('pending','failed') AND next_attempt_at <= now()
    ORDER BY next_attempt_at ASC FOR UPDATE SKIP LOCKED
    LIMIT greatest(1, coalesce(p_batch_size, 25))
  )
  UPDATE public.first_contact_outbox o
     SET status = 'in_progress', attempts = coalesce(o.attempts,0) + 1,
         next_attempt_at = now() + make_interval(secs => greatest(30, coalesce(p_lease_seconds,120)))
   WHERE o.id IN (SELECT id FROM claimed) RETURNING o.*;
END; $$;

CREATE OR REPLACE FUNCTION public.mark_first_contact_outbox_completed(p_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.first_contact_outbox SET status = 'completed', completed_at = now(), last_error = NULL WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.mark_first_contact_outbox_failed(p_id uuid, p_error text, p_backoff_seconds int DEFAULT 300)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.first_contact_outbox
     SET status = 'failed', last_error = left(coalesce(p_error,''), 2000),
         next_attempt_at = now() + make_interval(secs => greatest(30, coalesce(p_backoff_seconds,300)))
   WHERE id = p_id;
$$;

REVOKE ALL ON FUNCTION public.claim_first_contact_outbox_batch(int, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_first_contact_outbox_completed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_first_contact_outbox_failed(uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_first_contact_outbox_batch(int, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_first_contact_outbox_completed(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_first_contact_outbox_failed(uuid, text, int) TO service_role;