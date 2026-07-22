-- RC5 Batch B — apply_contract_signature_atomic 8-scenario harness.
-- Runs entirely inside a single transaction rolled back at the end so the
-- live DB is untouched. All fixtures are namespaced rc5-b-* and each scenario
-- RAISEs on failure so `psql -v ON_ERROR_STOP=1` fails the run.

\set ON_ERROR_STOP on
BEGIN;

DO $harness$
DECLARE
  v_c_single uuid := gen_random_uuid();     -- single-party contract
  v_c_bi     uuid := gen_random_uuid();     -- bilateral contract
  v_c_reg    uuid := gen_random_uuid();     -- for state-regression test
  v_c_dec    uuid := gen_random_uuid();     -- decline path
  v_c_void   uuid := gen_random_uuid();     -- void path
  v_c_conc   uuid := gen_random_uuid();     -- concurrent parties
  v_cmd1 uuid := gen_random_uuid();
  v_cmd2 uuid := gen_random_uuid();
  v_cmd_founder uuid := gen_random_uuid();
  v_cmd_counter uuid := gen_random_uuid();
  v_r1 jsonb; v_r2 jsonb;
  v_cnt int;
  v_status text;
  v_founder text;
  v_counter text;
  v_bool boolean;
BEGIN
  -- ---- Fixtures ----
  INSERT INTO public.startup_contracts (id, start_date, signature_status, founder_signer_status, counter_signer_status, counter_signer_email)
  VALUES
    (v_c_single, CURRENT_DATE, 'sent_for_signature', 'pending', NULL, NULL),
    (v_c_bi,     CURRENT_DATE, 'sent_for_signature', 'pending', 'pending', 'counter@example.com'),
    (v_c_reg,    CURRENT_DATE, 'sent_for_signature', 'pending', NULL, NULL),
    (v_c_dec,    CURRENT_DATE, 'sent_for_signature', 'pending', NULL, NULL),
    (v_c_void,   CURRENT_DATE, 'sent_for_signature', 'pending', 'pending', 'counter@example.com'),
    (v_c_conc,   CURRENT_DATE, 'sent_for_signature', 'pending', 'pending', 'counter@example.com');

  -- ---- Scenario 1: single-party founder → completed ----
  v_r1 := public.apply_contract_signature_atomic(
    p_command_id := v_cmd1, p_contract_id := v_c_single,
    p_party := 'founder', p_to_status := 'signed',
    p_evidence := jsonb_build_object('method','simple_electronic_signature'));
  IF (v_r1->>'signature_status') <> 'completed' THEN
    RAISE EXCEPTION 'S1 expected completed, got %', v_r1;
  END IF;

  -- ---- Scenario 2: idempotent retry with same command_id ----
  v_r2 := public.apply_contract_signature_atomic(
    p_command_id := v_cmd1, p_contract_id := v_c_single,
    p_party := 'founder', p_to_status := 'signed',
    p_evidence := jsonb_build_object('method','simple_electronic_signature'));
  IF (v_r2->>'idempotent') <> 'true' THEN
    RAISE EXCEPTION 'S2 expected idempotent=true, got %', v_r2;
  END IF;
  SELECT count(*) INTO v_cnt FROM public.contract_signature_events
    WHERE contract_id = v_c_single AND command_id = v_cmd1;
  IF v_cnt <> 1 THEN RAISE EXCEPTION 'S2 dup event, count=%', v_cnt; END IF;

  -- ---- Scenario 3: bilateral founder signs → partially_signed ----
  v_r1 := public.apply_contract_signature_atomic(
    p_command_id := gen_random_uuid(), p_contract_id := v_c_bi,
    p_party := 'founder', p_to_status := 'signed',
    p_evidence := '{}'::jsonb);
  IF (v_r1->>'signature_status') <> 'partially_signed' THEN
    RAISE EXCEPTION 'S3 expected partially_signed, got %', v_r1;
  END IF;

  -- ---- Scenario 4: counter-signer completes bilateral → completed ----
  v_r2 := public.apply_contract_signature_atomic(
    p_command_id := gen_random_uuid(), p_contract_id := v_c_bi,
    p_party := 'counter_signer', p_to_status := 'signed',
    p_evidence := '{}'::jsonb);
  IF (v_r2->>'signature_status') <> 'completed' THEN
    RAISE EXCEPTION 'S4 expected completed, got %', v_r2;
  END IF;
  SELECT signed_at IS NOT NULL INTO v_bool FROM public.startup_contracts WHERE id = v_c_bi;
  IF NOT v_bool THEN RAISE EXCEPTION 'S4 signed_at not stamped'; END IF;

  -- ---- Scenario 5: state regression blocked (signed → sent must raise) ----
  BEGIN
    PERFORM public.apply_contract_signature_atomic(
      p_command_id := gen_random_uuid(), p_contract_id := v_c_reg,
      p_party := 'founder', p_to_status := 'signed', p_evidence := '{}'::jsonb);
    PERFORM public.apply_contract_signature_atomic(
      p_command_id := gen_random_uuid(), p_contract_id := v_c_reg,
      p_party := 'founder', p_to_status := 'sent', p_evidence := '{}'::jsonb);
    RAISE EXCEPTION 'S5 regression allowed (should have raised)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE '%regression allowed%' THEN RAISE; END IF;
  END;

  -- ---- Scenario 6: declined path ----
  v_r1 := public.apply_contract_signature_atomic(
    p_command_id := gen_random_uuid(), p_contract_id := v_c_dec,
    p_party := 'founder', p_to_status := 'declined', p_evidence := '{}'::jsonb);
  IF (v_r1->>'signature_status') <> 'declined' THEN
    RAISE EXCEPTION 'S6 expected declined, got %', v_r1;
  END IF;

  -- ---- Scenario 7: voided path (staff kill switch) ----
  v_r1 := public.apply_contract_signature_atomic(
    p_command_id := gen_random_uuid(), p_contract_id := v_c_void,
    p_party := 'counter_signer', p_to_status := 'voided', p_evidence := '{}'::jsonb);
  IF (v_r1->>'signature_status') <> 'voided' THEN
    RAISE EXCEPTION 'S7 expected voided, got %', v_r1;
  END IF;

  -- ---- Scenario 8: concurrent-like sequence founder+counter each with own command
  -- both events landed, final state = completed, exactly two events (no clobber) ----
  PERFORM public.apply_contract_signature_atomic(
    p_command_id := v_cmd_founder, p_contract_id := v_c_conc,
    p_party := 'founder', p_to_status := 'signed', p_evidence := '{}'::jsonb);
  PERFORM public.apply_contract_signature_atomic(
    p_command_id := v_cmd_counter, p_contract_id := v_c_conc,
    p_party := 'counter_signer', p_to_status := 'signed', p_evidence := '{}'::jsonb);
  SELECT signature_status, founder_signer_status, counter_signer_status
    INTO v_status, v_founder, v_counter
    FROM public.startup_contracts WHERE id = v_c_conc;
  IF v_status <> 'completed' OR v_founder <> 'signed' OR v_counter <> 'signed' THEN
    RAISE EXCEPTION 'S8 final state wrong: status=% founder=% counter=%', v_status, v_founder, v_counter;
  END IF;
  SELECT count(*) INTO v_cnt FROM public.contract_signature_events WHERE contract_id = v_c_conc;
  IF v_cnt <> 2 THEN RAISE EXCEPTION 'S8 expected 2 events, got %', v_cnt; END IF;

  RAISE NOTICE 'RC5 Batch B: all 8 scenarios passed';
END
$harness$;

ROLLBACK;
