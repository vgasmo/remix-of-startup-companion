-- Canonical scheduling: contract lifecycle engine (daily 06:00 UTC)
DO $do$
BEGIN
  PERFORM cron.unschedule('check-contract-anniversaries-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $do$;

SELECT cron.schedule(
  'check-contract-anniversaries-daily',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/check-contract-anniversaries',
    headers := ('{"Content-Type": "application/json", "x-cron-secret": "' || current_setting('app.settings.cron_secret', true) || '"}')::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- Canonical scheduling: weekly check-in reminders (Mondays 09:00 UTC)
DO $do$
BEGIN
  PERFORM cron.unschedule('run-checkin-reminders-weekly');
EXCEPTION WHEN OTHERS THEN NULL;
END $do$;

SELECT cron.schedule(
  'run-checkin-reminders-weekly',
  '0 9 * * 1',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/run-checkin-reminders',
    headers := ('{"Content-Type": "application/json", "x-cron-secret": "' || current_setting('app.settings.cron_secret', true) || '"}')::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);