-- RC5 Batch B pgTAP — apply_contract_signature_atomic + signing grants.
-- Runs against the migration in docs/rc5/drafts/2026-07-22_batch-b_signing_integrity.sql
-- once promoted to a numbered migration. Executed only by rc5:pgtap against
-- staging (RC5_ALLOW_STAGING_TESTS=true, non-production STAGING_DATABASE_URL).

BEGIN;
SELECT plan(15);

-- ---- Fixtures ----------------------------------------------------------
DO $fx$
DECLARE v_c uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  INSERT INTO public.startup_contracts (id, start_date, signature_status, founder_signer_status, counter_signer_status, counter_signer_email)
  VALUES (v_c, CURRENT_DATE, 'sent_for_signature', 'pending', 'pending', 'counter@example.com')
  ON CONFLICT (id) DO NOTHING;
END $fx$;

-- ---- 1. issue_contract_signing_grant rejects non-staff ------------------
SELECT throws_ok(
  $$ SELECT public.issue_contract_signing_grant(
       '11111111-1111-1111-1111-111111111111'::uuid,
       'founder', 'f@example.com', repeat('a',64), 1, 15) $$,
  '42501',
  'forbidden: staff only',
  'issue_contract_signing_grant requires staff role'
);

-- Promote the caller for the remaining tests: the staff gate is fail-closed, so
-- grant issuance below runs with an explicit service_role claim (the role gate
-- itself is covered by test 1 above).
SET LOCAL role = 'postgres';
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

-- ---- 2. RC5 Batch 1: no grant → fail closed (no bypass) -----------------
SELECT throws_ok(
  $$ SELECT public.apply_contract_signature_atomic(
       gen_random_uuid(), '11111111-1111-1111-1111-111111111111'::uuid, 'founder',
       'signed', NULL, '{}'::jsonb, NULL, NULL, NULL, NULL, NULL
     ) $$,
  '42501', 'signing_grant_required', 'signature without a grant is refused'
);

SELECT is(
  (SELECT count(*)::int FROM public.contract_signature_events
     WHERE contract_id = '11111111-1111-1111-1111-111111111111'),
  0, 'no evidence row written for an ungranted attempt'
);

-- ---- 2b. legacy 8-arg overload no longer exists -------------------------
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='apply_contract_signature_atomic'
      AND p.pronargs = 8),
  0, 'legacy 8-argument bypass overload dropped'
);

-- ---- 3. Issue + consume grant happy path -------------------------------
DO $set$
DECLARE v_c uuid := '22222222-2222-2222-2222-222222222222';
BEGIN
  INSERT INTO public.startup_contracts (id, start_date, signature_status, founder_signer_status)
  VALUES (v_c, CURRENT_DATE, 'sent_for_signature', 'pending')
  ON CONFLICT (id) DO NOTHING;
END $set$;

SELECT lives_ok(
  $$ WITH g AS (
       SELECT * FROM public.issue_contract_signing_grant(
         '22222222-2222-2222-2222-222222222222'::uuid,
         'founder', 'f2@example.com', repeat('b',64), 1, 15)
     )
     SELECT public.apply_contract_signature_atomic(
       gen_random_uuid(), '22222222-2222-2222-2222-222222222222'::uuid,
       'founder', 'signed', NULL, '{}'::jsonb, NULL, NULL,
       (SELECT nonce FROM g), repeat('b',64), 'payload-sha')
     FROM g $$,
  'grant issued + consumed atomically'
);

SELECT is(
  (SELECT consumed_at IS NOT NULL FROM public.contract_signing_grants
     WHERE contract_id='22222222-2222-2222-2222-222222222222'
     ORDER BY issued_at DESC LIMIT 1),
  true, 'grant marked consumed'
);

-- ---- 4. Reused nonce rejected ------------------------------------------
SELECT throws_ok(
  $$ SELECT public.apply_contract_signature_atomic(
       gen_random_uuid(), '22222222-2222-2222-2222-222222222222'::uuid,
       'founder', 'signed', NULL, '{}'::jsonb, NULL, NULL,
       (SELECT nonce FROM public.contract_signing_grants
          WHERE contract_id='22222222-2222-2222-2222-222222222222'
          ORDER BY issued_at DESC LIMIT 1),
       repeat('b',64), 'payload-sha') $$,
  '42501', NULL, 'consumed nonce cannot be reused'
);

-- ---- 5. Document hash mismatch rejected --------------------------------
DO $mm$
DECLARE v_c uuid := '33333333-3333-3333-3333-333333333333';
BEGIN
  INSERT INTO public.startup_contracts (id, start_date, signature_status, founder_signer_status)
  VALUES (v_c, CURRENT_DATE, 'sent_for_signature', 'pending')
  ON CONFLICT (id) DO NOTHING;
END $mm$;

SELECT throws_ok(
  $$ WITH g AS (
       SELECT * FROM public.issue_contract_signing_grant(
         '33333333-3333-3333-3333-333333333333'::uuid,
         'founder', 'f3@example.com', repeat('c',64), 1, 15)
     )
     SELECT public.apply_contract_signature_atomic(
       gen_random_uuid(), '33333333-3333-3333-3333-333333333333'::uuid,
       'founder', 'signed', NULL, '{}'::jsonb, NULL, NULL,
       (SELECT nonce FROM g), repeat('X',64), 'p')
     FROM g $$,
  '42501', NULL, 'document hash mismatch rejected'
);

-- ---- 6. Expired grant rejected -----------------------------------------
DO $exp$
DECLARE v_c uuid := '44444444-4444-4444-4444-444444444444';
        v_nonce text;
BEGIN
  INSERT INTO public.startup_contracts (id, start_date, signature_status, founder_signer_status)
  VALUES (v_c, CURRENT_DATE, 'sent_for_signature', 'pending')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.contract_signing_grants
    (contract_id, party_role, signer_email_at_issue, document_sha256, nonce, expires_at)
  VALUES (v_c, 'founder', 'x@e.com', repeat('d',64), 'expired-nonce', now() - interval '1 minute');
END $exp$;

SELECT throws_ok(
  $$ SELECT public.apply_contract_signature_atomic(
       gen_random_uuid(), '44444444-4444-4444-4444-444444444444'::uuid,
       'founder', 'signed', NULL, '{}'::jsonb, NULL, NULL,
       'expired-nonce', repeat('d',64), 'p') $$,
  '42501', NULL, 'expired grant rejected'
);

-- ---- 7. Bilateral: counter-signer completes → 'completed' --------------
DO $bi$
DECLARE v_c uuid := '55555555-5555-5555-5555-555555555555';
BEGIN
  INSERT INTO public.startup_contracts (id, start_date, signature_status, founder_signer_status, counter_signer_status, counter_signer_email)
  VALUES (v_c, CURRENT_DATE, 'sent_for_signature', 'signed', 'pending', 'c@e.com')
  ON CONFLICT (id) DO NOTHING;
END $bi$;

SELECT is(
  (WITH g AS (
     SELECT * FROM public.issue_contract_signing_grant(
       '55555555-5555-5555-5555-555555555555'::uuid,
       'counter_signer', 'c@e.com', repeat('e',64), 1, 15)
   )
   SELECT public.apply_contract_signature_atomic(
     gen_random_uuid(), '55555555-5555-5555-5555-555555555555'::uuid,
     'counter_signer', 'signed', NULL, '{}'::jsonb, NULL, NULL,
     (SELECT nonce FROM g), repeat('e',64), 'payload-sha'
   ) ->> 'signature_status' FROM g),
  'completed', 'bilateral counter-sign → completed'
);

-- ---- 8. Terminal state regression rejected -----------------------------
SELECT throws_ok(
  $$ WITH g AS (
       SELECT * FROM public.issue_contract_signing_grant(
         '55555555-5555-5555-5555-555555555555'::uuid,
         'founder', 'f5@example.com', repeat('f',64), 1, 15)
     )
     SELECT public.apply_contract_signature_atomic(
       gen_random_uuid(), '55555555-5555-5555-5555-555555555555'::uuid,
       'founder', 'declined', NULL, '{}'::jsonb, NULL, NULL,
       (SELECT nonce FROM g), repeat('f',64), 'p') FROM g $$,
  '55000', NULL, 'completed → declined regression rejected'
);

-- ---- 9. Idempotent replay of same command_id ---------------------------
DO $rep$
DECLARE v_c uuid := '66666666-6666-6666-6666-666666666666';
        v_cmd uuid := gen_random_uuid();
BEGIN
  INSERT INTO public.startup_contracts (id, start_date, signature_status, founder_signer_status)
  VALUES (v_c, CURRENT_DATE, 'sent_for_signature', 'pending')
  ON CONFLICT (id) DO NOTHING;
  PERFORM public.apply_contract_signature_atomic(
    v_cmd, v_c, 'founder', 'signed', NULL, '{}'::jsonb, NULL, NULL,
    (SELECT nonce FROM public.issue_contract_signing_grant(v_c, 'founder', 'f6@example.com', repeat('g',64), 1, 15)),
    repeat('g',64), 'p');
  PERFORM set_config('rc5.replay_cmd', v_cmd::text, false);
END $rep$;

SELECT is(
  (WITH g AS (
     SELECT * FROM public.issue_contract_signing_grant(
       '66666666-6666-6666-6666-666666666666'::uuid,
       'founder', 'f6@example.com', repeat('g',64), 1, 15)
   )
   SELECT public.apply_contract_signature_atomic(
     current_setting('rc5.replay_cmd')::uuid,
     '66666666-6666-6666-6666-666666666666'::uuid,
     'founder', 'signed', NULL, '{}'::jsonb, NULL, NULL,
     (SELECT nonce FROM g), repeat('g',64), 'p'
   ) ->> 'idempotent' FROM g),
  'true', 'same command_id replay is idempotent'
);

SELECT is(
  (SELECT count(*)::int FROM public.contract_signature_events
    WHERE contract_id='66666666-6666-6666-6666-666666666666'),
  1, 'idempotent replay wrote no duplicate event'
);

-- ---- 10. Evidence FK is RESTRICT ---------------------------------------
SELECT is(
  (SELECT confdeltype FROM pg_constraint
    WHERE conname='contract_signature_events_contract_id_fkey'),
  'r', 'contract_signature_events FK is ON DELETE RESTRICT'
);

-- ---- 11. RLS: anon cannot read evidence --------------------------------
SET LOCAL role = 'anon';
SELECT is(
  (SELECT count(*)::int FROM public.contract_signature_events
    WHERE contract_id='66666666-6666-6666-6666-666666666666'),
  0, 'anon reads no signature evidence'
);
RESET role;

-- ---- 12. Grants table denies anon --------------------------------------
SET LOCAL role = 'anon';
SELECT is(
  (SELECT count(*)::int FROM public.contract_signing_grants),
  0, 'anon reads no signing grants'
);
RESET role;

SELECT * FROM finish();
ROLLBACK;
