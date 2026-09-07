-- P1.1 pgTAP: the watchdog window must follow each job's own cadence, so weekly
-- and monthly jobs are not reported as stale/never-run every hour.
BEGIN;
SELECT plan(4);

SELECT has_function('public', 'check_automation_health', 'watchdog function exists');

-- A weekly job (604800s) with a successful run 3 days ago is healthy.
INSERT INTO public.automation_health_expectations
  (job_name, enabled, expected_cadence_seconds, grace_seconds, severity)
VALUES ('pgtap-weekly-job', true, 604800, 86400, 'high');

INSERT INTO public.cron_job_runs (job_name, status, started_at)
VALUES ('pgtap-weekly-job', 'ok', now() - interval '3 days');

SELECT lives_ok($$SELECT public.check_automation_health()$$, 'watchdog runs');

SELECT is(
  (SELECT count(*) FROM public.system_alerts
    WHERE kind = 'cron_stale' AND payload->>'job' = 'pgtap-weekly-job'),
  0::bigint,
  'weekly job with a 3-day-old success raises no stale alert');

-- A weekly job whose last success is 9 days old IS stale.
INSERT INTO public.automation_health_expectations
  (job_name, enabled, expected_cadence_seconds, grace_seconds, severity)
VALUES ('pgtap-weekly-late', true, 604800, 86400, 'high');

INSERT INTO public.cron_job_runs (job_name, status, started_at)
VALUES ('pgtap-weekly-late', 'ok', now() - interval '9 days');

SELECT public.check_automation_health();

SELECT is(
  (SELECT count(*) FROM public.system_alerts
    WHERE kind = 'cron_stale' AND payload->>'job' = 'pgtap-weekly-late'),
  1::bigint,
  'weekly job overdue by more than cadence + grace still alerts');

SELECT * FROM finish();
ROLLBACK;
