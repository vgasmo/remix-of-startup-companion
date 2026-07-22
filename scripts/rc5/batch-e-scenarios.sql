-- RC5 Batch E — monthly founder pulse messaging + outbox scenarios.
-- Delegates to public.rc5_run_batch_e() (SECURITY DEFINER, self-rollback via sentinel EXCEPTION).
-- Returns one row per scenario; ok=true when got matches expected.
--
--   psql -v ON_ERROR_STOP=1 -f scripts/rc5/batch-e-scenarios.sql
--
-- Errors and exits non-zero when any scenario fails. Fixtures roll back at the end
-- of the function via RAISE EXCEPTION 'RC5_BATCH_E_ROLLBACK_SENTINEL'.

\set ON_ERROR_STOP on

SELECT scenario, got, expected, ok FROM public.rc5_run_batch_e() ORDER BY 1;

DO $$
DECLARE
  fail_count int;
BEGIN
  SELECT count(*) INTO fail_count FROM public.rc5_run_batch_e() WHERE NOT ok;
  IF fail_count > 0 THEN
    RAISE EXCEPTION 'RC5 Batch E — % scenario(s) failed', fail_count;
  END IF;
  RAISE NOTICE 'RC5 Batch E: all 8 scenarios passed';
END $$;
