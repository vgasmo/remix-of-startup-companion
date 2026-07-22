-- Batch 0 (RC5 rescue): drop test-harness RPCs that were inadvertently
-- promoted into applied migrations 20260722071918 (rc5_run_batch_d) and
-- 20260722072018 (rc5_run_batch_e). Forward-only cleanup; no history edits.
DROP FUNCTION IF EXISTS public.rc5_run_batch_d();
DROP FUNCTION IF EXISTS public.rc5_run_batch_e();