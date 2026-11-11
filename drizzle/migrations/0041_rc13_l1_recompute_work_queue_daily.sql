-- RC13 Lote 1 · 4 · daily recompute of the staff work queue (same pattern as recompute-health-scores-daily). Idempotent.
DO $do$
BEGIN
  PERFORM cron.unschedule('recompute-work-queue-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'recompute-work-queue-daily');
  PERFORM cron.schedule('recompute-work-queue-daily', '15 6 * * *',
    format('SELECT public.cron_invoke_edge(%L)', 'recompute-work-queue'));
END
$do$;

INSERT INTO public.automation_health_expectations (job_name, enabled, expected_cadence_seconds, grace_seconds, severity, owner)
VALUES ('recompute-work-queue', true, 86400, 1800, 'medium', 'ops')
ON CONFLICT (job_name) DO UPDATE SET enabled = EXCLUDED.enabled,
  expected_cadence_seconds = EXCLUDED.expected_cadence_seconds, grace_seconds = EXCLUDED.grace_seconds,
  severity = EXCLUDED.severity, owner = EXCLUDED.owner, updated_at = now();