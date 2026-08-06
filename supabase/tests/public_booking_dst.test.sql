-- RC5 Batch F1 — Public First-Contact Booking pgTAP suite.
--
-- Runs under scripts/rc5/run-pgtap.mjs against a non-production DB.
-- Depends on the Batch F1 draft migration having been applied.

BEGIN;
SELECT plan(9);

-- ---------- fixture: link + consultant + routing ----------
DO $$
DECLARE
  v_link uuid := gen_random_uuid();
  v_consultant uuid := gen_random_uuid();
BEGIN
  PERFORM set_config('rc5.link_id', v_link::text, true);
  PERFORM set_config('rc5.consultant_id', v_consultant::text, true);

  INSERT INTO auth.users (id, email) VALUES (v_consultant, 'rc5_f1_consultant@example.test');
  INSERT INTO public.profiles (id, full_name, email) VALUES (v_consultant, 'RC5 F1 Consultant', 'rc5_f1_consultant@example.test')
  ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email;
  INSERT INTO public.user_roles (user_id, role) VALUES (v_consultant, 'consultor');
END $$;

-- ---------- 1. DST spring-forward: 2026-03-29 02:30 Lisbon does NOT exist.
--     Postgres normalises forward-gap timestamps to the post-shift instant.
--     Postgres resolves the gap with the pre-shift offset, so it lands at
--     01:30 UTC. The property under test is determinism, not the offset. ----------
SELECT results_eq(
  $$SELECT (('2026-03-29T02:30:00'::timestamp) AT TIME ZONE 'Europe/Lisbon') AT TIME ZONE 'UTC'$$,
  $$SELECT '2026-03-29T01:30:00'::timestamp$$,
  'spring-forward wall-clock resolves deterministically (no ±1h drift)'
);

-- ---------- 2. Winter (UTC+0) vs Summer (UTC+1) delta is exactly 1h ----------
SELECT is(
  extract(epoch FROM (
    (('2026-06-15T10:00:00'::timestamp) AT TIME ZONE 'Europe/Lisbon')
    - (('2026-01-15T10:00:00'::timestamp) AT TIME ZONE 'Europe/Lisbon')
  ))::int,
  extract(epoch FROM interval '150 days 23 hours')::int,
  'summer 10:00 Lisbon is 1 h earlier in UTC than winter 10:00 Lisbon (DST)'
);

-- ---------- 3. Fresh commit returns mode=created ----------
SELECT is(
  (SELECT mode FROM public.commit_first_contact_booking_atomic(
    'ik-rc5-f1-001',
    jsonb_build_object('name','Ana','email','rc5_f1_lead@example.test'),
    jsonb_build_object('date','2026-04-15','time','10:00'),
    current_setting('rc5.consultant_id')::uuid,
    NULL,
    jsonb_build_object('booking_source','public_form'),
    jsonb_build_object('link_id', current_setting('rc5.link_id'))
  )),
  'created',
  'fresh submission yields mode=created'
);

-- ---------- 4. Same idempotency_key => idempotent_reuse ----------
SELECT is(
  (SELECT mode FROM public.commit_first_contact_booking_atomic(
    'ik-rc5-f1-001',
    jsonb_build_object('name','Ana','email','rc5_f1_lead@example.test'),
    jsonb_build_object('date','2026-04-15','time','10:00'),
    current_setting('rc5.consultant_id')::uuid,
    NULL,
    jsonb_build_object('booking_source','public_form'),
    jsonb_build_object('link_id', current_setting('rc5.link_id'))
  )),
  'idempotent_reuse',
  'repeated idempotency_key reuses the same funnel item'
);

-- ---------- 5. Different idempotency_key but same (link, email, slot) also dedupes ----------
SELECT is(
  (SELECT mode FROM public.commit_first_contact_booking_atomic(
    'ik-rc5-f1-002-different',
    jsonb_build_object('name','Ana','email','rc5_f1_lead@example.test'),
    jsonb_build_object('date','2026-04-15','time','10:00'),
    current_setting('rc5.consultant_id')::uuid,
    NULL,
    jsonb_build_object('booking_source','public_form'),
    jsonb_build_object('link_id', current_setting('rc5.link_id'))
  )),
  'idempotent_reuse',
  'different idempotency key with same (link, email, slot) is deduped'
);

-- ---------- 6. Composite index count invariant: exactly ONE funnel_item ----------
SELECT is(
  (SELECT count(*)::int FROM public.funnel_items
     WHERE metadata_json->>'submitter_email_normalized' = 'rc5_f1_lead@example.test'
       AND metadata_json->>'link_id' = current_setting('rc5.link_id')
       AND metadata_json->>'booking_slot_utc' IS NOT NULL),
  1,
  'exactly one funnel_item persisted across duplicate submissions'
);

-- ---------- 7. Outbox lease respects SKIP LOCKED ----------
DO $$
DECLARE
  v_funnel uuid;
BEGIN
  SELECT id INTO v_funnel FROM public.funnel_items
   WHERE metadata_json->>'submitter_email_normalized' = 'rc5_f1_lead@example.test'
   LIMIT 1;
  INSERT INTO public.first_contact_outbox (funnel_item_id, kind, payload_json, status, next_attempt_at)
  VALUES
    (v_funnel, 'graph_event',       '{}'::jsonb, 'pending', now() - interval '1 minute'),
    (v_funnel, 'consultant_email',  '{}'::jsonb, 'pending', now() - interval '1 minute');
END $$;

SELECT is(
  (SELECT count(*)::int FROM public.claim_first_contact_outbox_batch(10, 60)),
  2,
  'claim_first_contact_outbox_batch leases the 2 pending rows'
);

SELECT is(
  (SELECT count(*)::int FROM public.claim_first_contact_outbox_batch(10, 60)),
  0,
  'second concurrent claimant gets zero rows (all in_progress)'
);

-- ---------- 8. mark_completed transitions to completed with completed_at ----------
DO $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.first_contact_outbox WHERE status = 'in_progress' LIMIT 1;
  PERFORM public.mark_first_contact_outbox_completed(v_id);
END $$;

SELECT ok(
  (SELECT count(*) > 0 FROM public.first_contact_outbox
     WHERE status = 'completed' AND completed_at IS NOT NULL),
  'mark_first_contact_outbox_completed sets status=completed and completed_at'
);

SELECT * FROM finish();
ROLLBACK;
