SELECT cron.unschedule('auto-sync-outlook-emails')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-sync-outlook-emails');

SELECT cron.schedule(
  'auto-sync-outlook-emails',
  '*/5 * * * *',
  $$SELECT public.cron_invoke_edge('sync-outlook-emails', '{"auto_sync": true, "triggered_by": "cron"}'::jsonb)$$
);