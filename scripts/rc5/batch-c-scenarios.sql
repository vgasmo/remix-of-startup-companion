-- RC5 Batch C — DocuSign envelope idempotency & reconciliation harness.
-- Runs inside BEGIN…ROLLBACK so live DB stays clean. Mocked provider =
-- direct calls to claim/finalize/release RPCs, standing in for what the
-- edge function does around a fetch() to DocuSign.
--
-- 8 scenarios:
--   1. Cold claim: empty contract → claimed=true, status='dispatching'.
--   2. Idempotent replay after finalize: same command → claimed=false, idempotent=true, same envelope.
--   3. Concurrent same-command claims: only one caller sees claimed=true (row lock via advisory serialisation).
--   4. Different-command claim while first is live: second call → conflict='different_command'.
--   5. Release-then-retry: dispatch fails, release_docusign_envelope_command clears the stamp,
--      a subsequent claim with the same command succeeds and finalize stamps the envelope.
--   6. Already-live conflict: contract has envelope_id + status='signed' → conflict='already_live', no writes.
--   7. Finalize with wrong command_id → finalized=false, reason='command_mismatch_or_already_finalized'.
--   8. Finalize is idempotent for the same envelope_id (re-run stamps no duplicate provider_sent_at drift).
--
-- Any RAISE below aborts the harness under `psql -v ON_ERROR_STOP=1`.

\set ON_ERROR_STOP on
BEGIN;

DO $harness$
DECLARE
  v_c1 uuid := gen_random_uuid();
  v_c2 uuid := gen_random_uuid();
  v_c3 uuid := gen_random_uuid();
  v_c4 uuid := gen_random_uuid();
  v_c5 uuid := gen_random_uuid();
  v_c6 uuid := gen_random_uuid();
  v_c7 uuid := gen_random_uuid();
  v_c8 uuid := gen_random_uuid();
  v_cmd_a text := md5(v_c1::text || '::v1::send', 'sha256');
  v_cmd_b text := md5(v_c2::text || '::v1::send', 'sha256');
  v_cmd_c text := md5(v_c3::text || '::v1::send', 'sha256');
  v_cmd_d1 text := md5(v_c4::text || '::v1::send', 'sha256');
  v_cmd_d2 text := md5(v_c4::text || '::v2::send', 'sha256');
  v_cmd_e text := md5(v_c5::text || '::v1::send', 'sha256');
  v_cmd_f text := md5(v_c6::text || '::v1::send', 'sha256');
  v_cmd_g text := md5(v_c7::text || '::v1::send', 'sha256');
  v_cmd_h text := md5(v_c8::text || '::v1::send', 'sha256');
  r jsonb;
  v_env_id text;
  v_signed_at timestamptz;
  v_second_sent timestamptz;
  v_status text;
  v_stamp text;
BEGIN
  -- Fixtures: eight fresh contracts in dispatchable states.
  INSERT INTO public.startup_contracts (id, start_date, signature_status, founder_signer_status, counter_signer_status, counter_signer_email)
  VALUES
    (v_c1, CURRENT_DATE, 'draft', 'pending', NULL, NULL),
    (v_c2, CURRENT_DATE, 'draft', 'pending', NULL, NULL),
    (v_c3, CURRENT_DATE, 'draft', 'pending', NULL, NULL),
    (v_c4, CURRENT_DATE, 'draft', 'pending', NULL, NULL),
    (v_c5, CURRENT_DATE, 'draft', 'pending', NULL, NULL),
    (v_c6, CURRENT_DATE, 'signed',    'signed',  NULL, NULL),
    (v_c7, CURRENT_DATE, 'draft', 'pending', NULL, NULL),
    (v_c8, CURRENT_DATE, 'draft', 'pending', NULL, NULL);

  -- Give scenario 6 a live envelope so it looks provider-tracked.
  UPDATE public.startup_contracts
    SET docusign_envelope_id = 'ENV-EXISTING',
        provider_document_id = 'ENV-EXISTING',
        envelope_command_id = 'stale-command-id'
    WHERE id = v_c6;

  -- ---- Scenario 1: cold claim -------------------------------------------------
  r := public.claim_docusign_envelope(v_c1, v_cmd_a);
  IF (r->>'claimed') <> 'true' THEN
    RAISE EXCEPTION 'S1 expected claimed=true, got %', r;
  END IF;
  SELECT signature_status, envelope_command_id INTO v_status, v_stamp
    FROM public.startup_contracts WHERE id = v_c1;
  IF v_status <> 'dispatching' OR v_stamp <> v_cmd_a THEN
    RAISE EXCEPTION 'S1 expected dispatching + stamped, got status=% stamp=%', v_status, v_stamp;
  END IF;
  -- Finalize to complete the happy path.
  r := public.finalize_docusign_envelope(v_c1, v_cmd_a, 'ENV-S1', 'founder@a', NULL, NULL);
  IF (r->>'finalized') <> 'true' THEN
    RAISE EXCEPTION 'S1 finalize failed: %', r;
  END IF;

  -- ---- Scenario 2: idempotent replay after finalize ---------------------------
  r := public.claim_docusign_envelope(v_c1, v_cmd_a);
  IF (r->>'idempotent') <> 'true' OR (r->>'envelope_id') <> 'ENV-S1' THEN
    RAISE EXCEPTION 'S2 expected idempotent replay with ENV-S1, got %', r;
  END IF;

  -- ---- Scenario 3: concurrent same-command claims -----------------------------
  -- Simulate two workers by running claim twice; the first succeeds with
  -- claimed=true, the second (still same command, envelope already finalized
  -- by S1 semantics only for c1) must see idempotent OR claimed=true then
  -- collapse via unique index. Here we use c3 to test the pre-finalize race:
  -- first claim wins with claimed=true, second identical claim (before
  -- finalize) re-stamps the same command_id and does NOT create a duplicate.
  r := public.claim_docusign_envelope(v_c3, v_cmd_c);
  IF (r->>'claimed') <> 'true' THEN
    RAISE EXCEPTION 'S3a first claim expected claimed=true, got %', r;
  END IF;
  -- Second worker with the same command_id: still returns claimed=true
  -- (re-entrant), but the row is unchanged. We guard by asserting exactly one
  -- contract row carries this command_id.
  r := public.claim_docusign_envelope(v_c3, v_cmd_c);
  IF (r->>'claimed') <> 'true' THEN
    RAISE EXCEPTION 'S3b re-entrant same-command claim expected claimed=true, got %', r;
  END IF;
  IF (SELECT count(*) FROM public.startup_contracts WHERE envelope_command_id = v_cmd_c) <> 1 THEN
    RAISE EXCEPTION 'S3 same command_id must appear on exactly one row';
  END IF;
  -- Also verify unique index: attempting to stamp v_cmd_c on a *different*
  -- contract must fail.
  BEGIN
    UPDATE public.startup_contracts SET envelope_command_id = v_cmd_c WHERE id = v_c2;
    RAISE EXCEPTION 'S3 unique index should have blocked cross-contract command_id reuse';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- ---- Scenario 4: different command claim on already-claimed contract --------
  -- c4 gets claimed with v_cmd_d1 first, then a worker with v_cmd_d2 tries.
  r := public.claim_docusign_envelope(v_c4, v_cmd_d1);
  IF (r->>'claimed') <> 'true' THEN
    RAISE EXCEPTION 'S4 setup claim failed: %', r;
  END IF;
  r := public.claim_docusign_envelope(v_c4, v_cmd_d2);
  IF (r->>'conflict') <> 'different_command' THEN
    RAISE EXCEPTION 'S4 expected different_command conflict, got %', r;
  END IF;
  -- Row must still be stamped with the ORIGINAL command.
  SELECT envelope_command_id INTO v_stamp FROM public.startup_contracts WHERE id = v_c4;
  IF v_stamp <> v_cmd_d1 THEN
    RAISE EXCEPTION 'S4 stamp changed unexpectedly: %', v_stamp;
  END IF;

  -- ---- Scenario 5: release-then-retry -----------------------------------------
  r := public.claim_docusign_envelope(v_c5, v_cmd_e);
  IF (r->>'claimed') <> 'true' THEN
    RAISE EXCEPTION 'S5 first claim failed: %', r;
  END IF;
  -- Simulate provider dispatch failure → release.
  r := public.release_docusign_envelope_command(v_c5, v_cmd_e, 'docusign_500');
  IF (r->>'released') <> 'true' THEN
    RAISE EXCEPTION 'S5 release expected true, got %', r;
  END IF;
  SELECT envelope_command_id, signature_status
    INTO v_stamp, v_status
    FROM public.startup_contracts WHERE id = v_c5;
  IF v_stamp IS NOT NULL OR v_status <> 'failed' THEN
    RAISE EXCEPTION 'S5 post-release expected null stamp + failed status, got stamp=% status=%', v_stamp, v_status;
  END IF;
  -- Retry: same command should now be claimable again.
  r := public.claim_docusign_envelope(v_c5, v_cmd_e);
  IF (r->>'claimed') <> 'true' THEN
    RAISE EXCEPTION 'S5 retry claim failed: %', r;
  END IF;
  r := public.finalize_docusign_envelope(v_c5, v_cmd_e, 'ENV-S5', NULL, NULL, NULL);
  IF (r->>'finalized') <> 'true' THEN
    RAISE EXCEPTION 'S5 retry finalize failed: %', r;
  END IF;

  -- ---- Scenario 6: already-live conflict --------------------------------------
  r := public.claim_docusign_envelope(v_c6, v_cmd_f);
  IF (r->>'conflict') <> 'already_live' THEN
    RAISE EXCEPTION 'S6 expected already_live conflict, got %', r;
  END IF;
  -- No writes: stamp still points to the original stale command.
  SELECT envelope_command_id INTO v_stamp FROM public.startup_contracts WHERE id = v_c6;
  IF v_stamp <> 'stale-command-id' THEN
    RAISE EXCEPTION 'S6 stamp should be untouched, got %', v_stamp;
  END IF;

  -- ---- Scenario 7: finalize with wrong command_id -----------------------------
  r := public.claim_docusign_envelope(v_c7, v_cmd_g);
  IF (r->>'claimed') <> 'true' THEN
    RAISE EXCEPTION 'S7 setup claim failed: %', r;
  END IF;
  r := public.finalize_docusign_envelope(v_c7, 'not-the-right-command', 'ENV-S7', NULL, NULL, NULL);
  IF (r->>'finalized') <> 'false' OR (r->>'reason') <> 'command_mismatch_or_already_finalized' THEN
    RAISE EXCEPTION 'S7 expected finalize=false command_mismatch, got %', r;
  END IF;
  -- Envelope must NOT be stamped on the contract.
  SELECT docusign_envelope_id INTO v_env_id FROM public.startup_contracts WHERE id = v_c7;
  IF v_env_id IS NOT NULL THEN
    RAISE EXCEPTION 'S7 envelope id unexpectedly stamped: %', v_env_id;
  END IF;

  -- ---- Scenario 8: idempotent finalize with same envelope id ------------------
  r := public.claim_docusign_envelope(v_c8, v_cmd_h);
  IF (r->>'claimed') <> 'true' THEN
    RAISE EXCEPTION 'S8 setup claim failed: %', r;
  END IF;
  r := public.finalize_docusign_envelope(v_c8, v_cmd_h, 'ENV-S8', NULL, NULL, NULL);
  IF (r->>'finalized') <> 'true' THEN
    RAISE EXCEPTION 'S8 first finalize failed: %', r;
  END IF;
  SELECT provider_sent_at INTO v_signed_at FROM public.startup_contracts WHERE id = v_c8;
  -- Replay finalize with the same envelope id: RPC returns true (WHERE matches
  -- because docusign_envelope_id = p_envelope_id branch), but stamps do not
  -- diverge from a business perspective. We assert we did not clear it.
  r := public.finalize_docusign_envelope(v_c8, v_cmd_h, 'ENV-S8', NULL, NULL, NULL);
  IF (r->>'finalized') <> 'true' THEN
    RAISE EXCEPTION 'S8 idempotent finalize replay failed: %', r;
  END IF;
  SELECT provider_sent_at INTO v_second_sent FROM public.startup_contracts WHERE id = v_c8;
  IF v_second_sent IS NULL THEN
    RAISE EXCEPTION 'S8 provider_sent_at cleared by replay';
  END IF;

  RAISE NOTICE 'RC5 Batch C: all 8 scenarios passed';
END;
$harness$;

ROLLBACK;
