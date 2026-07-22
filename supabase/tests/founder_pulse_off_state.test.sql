-- pgTAP: Batch D — Monthly Founder Pulse OFF-first invariants.
-- Run against staging after applying 2026-07-22_batch-d_pulse_off_guard.sql.
--
-- Contract: with the feature flag OFF, every cron entry point must produce
-- zero cycles, zero notification_attempts, zero notifications, zero emails.
BEGIN;
SELECT plan(9);

-- Ensure baseline: flag OFF.
UPDATE public.feature_flags SET enabled = false
 WHERE key = 'founder_monthly_pulse' AND scope = 'global';

-- Snapshot counts before invocation.
CREATE TEMP TABLE _pulse_baseline AS
SELECT
  (SELECT COUNT(*) FROM public.founder_pulse_cycles WHERE period_month = date_trunc('month', now())::date) AS cycles,
  (SELECT COUNT(*) FROM public.notification_attempts WHERE event_key LIKE 'founder_pulse:%') AS attempts,
  (SELECT COUNT(*) FROM public.notifications WHERE type = 'founder_pulse') AS notifs,
  (SELECT COUNT(*) FROM public.email_log WHERE template_key = 'founder_pulse') AS emails;

-- 1. Cron RPC short-circuits with flag_off marker.
SELECT is(
  (public.open_and_notify_monthly_founder_pulse_cycles())->>'skipped',
  'flag_off',
  'cron RPC short-circuits when flag OFF');

-- 2. Zero cycles created.
SELECT is(
  (SELECT COUNT(*)::int FROM public.founder_pulse_cycles
    WHERE period_month = date_trunc('month', now())::date),
  (SELECT cycles::int FROM _pulse_baseline),
  'no new cycles when flag OFF');

-- 3. Zero attempts created.
SELECT is(
  (SELECT COUNT(*)::int FROM public.notification_attempts WHERE event_key LIKE 'founder_pulse:%'),
  (SELECT attempts::int FROM _pulse_baseline),
  'no notification_attempts when flag OFF');

-- 4. Zero notifications created.
SELECT is(
  (SELECT COUNT(*)::int FROM public.notifications WHERE type = 'founder_pulse'),
  (SELECT notifs::int FROM _pulse_baseline),
  'no in-app notifications when flag OFF');

-- 5. Zero emails logged.
SELECT is(
  (SELECT COUNT(*)::int FROM public.email_log WHERE template_key = 'founder_pulse'),
  (SELECT emails::int FROM _pulse_baseline),
  'no pulse emails when flag OFF');

-- 6. open_monthly_founder_pulse_cycles returns 0 when flag OFF.
SELECT is(public.open_monthly_founder_pulse_cycles(), 0, 'opener RPC returns 0 when flag OFF');

-- 7. enqueue_pulse_notifications returns 0 when flag OFF, even with a manually inserted cycle.
DO $$
DECLARE v_ws UUID; v_c UUID;
BEGIN
  SELECT id INTO v_ws FROM public.workspaces WHERE status = 'active' LIMIT 1;
  IF v_ws IS NOT NULL THEN
    INSERT INTO public.founder_pulse_cycles(workspace_id, period_month, status)
    VALUES (v_ws, date_trunc('month', now())::date, 'open')
    ON CONFLICT (workspace_id, period_month) DO UPDATE SET status = 'open'
    RETURNING id INTO v_c;
    PERFORM set_config('pulse.test_cycle', v_c::text, true);
  END IF;
END $$;
SELECT is(
  COALESCE(public.enqueue_pulse_notifications(NULLIF(current_setting('pulse.test_cycle', true), '')::uuid), 0),
  0,
  'enqueue RPC returns 0 when flag OFF even with an open cycle');

-- 8. Structural dedup index exists.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname = 'notification_attempts_pulse_dedup_uidx'
  ),
  'unique (cycle_id, workspace_id, respondent_id, channel) index installed');

-- 9. State check constraint exists.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'notification_attempts_state_chk'
       AND conrelid = 'public.notification_attempts'::regclass
  ),
  'notification_attempts.state check constraint installed');

SELECT * FROM finish();
ROLLBACK;
