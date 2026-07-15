-- 1. Unschedule generate-invoices-monthly (violates "No Invoicing" governance)
DO $do$ BEGIN PERFORM cron.unschedule('generate-invoices-monthly'); EXCEPTION WHEN OTHERS THEN NULL; END $do$;

-- 2. send-milestone-reminders — daily 08:30 UTC
DO $do$ BEGIN PERFORM cron.unschedule('send-milestone-reminders-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $do$;
SELECT cron.schedule(
  'send-milestone-reminders-daily',
  '30 8 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-milestone-reminders',
    headers := ('{"Content-Type": "application/json", "x-cron-secret": "' || current_setting('app.settings.cron_secret', true) || '"}')::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- 3. send-email-digest — Mondays 08:00 UTC
DO $do$ BEGIN PERFORM cron.unschedule('send-email-digest-weekly'); EXCEPTION WHEN OTHERS THEN NULL; END $do$;
SELECT cron.schedule(
  'send-email-digest-weekly',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-email-digest',
    headers := ('{"Content-Type": "application/json", "x-cron-secret": "' || current_setting('app.settings.cron_secret', true) || '"}')::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);

-- 4. send-weekly-health-digest — Mondays 07:30 UTC
DO $do$ BEGIN PERFORM cron.unschedule('send-weekly-health-digest-weekly'); EXCEPTION WHEN OTHERS THEN NULL; END $do$;
SELECT cron.schedule(
  'send-weekly-health-digest-weekly',
  '30 7 * * 1',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/send-weekly-health-digest',
    headers := ('{"Content-Type": "application/json", "x-cron-secret": "' || current_setting('app.settings.cron_secret', true) || '"}')::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);