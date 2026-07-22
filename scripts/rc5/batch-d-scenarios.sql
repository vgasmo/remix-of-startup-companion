-- RC5 Batch D — role-matrix scenarios for public.has_workspace_access(_user_id, _workspace_id).
-- Delegates to public.rc5_run_batch_d() (SECURITY DEFINER, self-rollback).
-- The function returns one row per scenario with ok=true when got matches expected.
--
--   psql -v ON_ERROR_STOP=1 -f scripts/rc5/batch-d-scenarios.sql
--
-- Errors and exits non-zero when any scenario fails.

\set ON_ERROR_STOP on

SELECT scenario, got, expected, ok FROM public.rc5_run_batch_d() ORDER BY 1;

DO $$
DECLARE
  fail_count int;
BEGIN
  SELECT count(*) INTO fail_count FROM public.rc5_run_batch_d() WHERE NOT ok;
  IF fail_count > 0 THEN
    RAISE EXCEPTION 'RC5 Batch D — % scenario(s) failed', fail_count;
  END IF;
  RAISE NOTICE 'RC5 Batch D: all 12 scenarios passed';
END $$;
