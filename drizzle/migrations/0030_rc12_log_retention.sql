CREATE OR REPLACE FUNCTION public.purge_operational_logs() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_out jsonb:='{}'::jsonb; n integer;
BEGIN
 DELETE FROM public.client_error_logs WHERE id IN (SELECT id FROM public.client_error_logs WHERE created_at<now()-interval '90 days' LIMIT 50000); GET DIAGNOSTICS n=ROW_COUNT; v_out:=v_out||jsonb_build_object('client_error_logs',n);
 DELETE FROM public.analytics_events WHERE id IN (SELECT id FROM public.analytics_events WHERE created_at<now()-interval '180 days' LIMIT 50000); GET DIAGNOSTICS n=ROW_COUNT; v_out:=v_out||jsonb_build_object('analytics_events',n);
 DELETE FROM public.tool_usage_events WHERE id IN (SELECT id FROM public.tool_usage_events WHERE occurred_at<now()-interval '180 days' LIMIT 50000); GET DIAGNOSTICS n=ROW_COUNT; v_out:=v_out||jsonb_build_object('tool_usage_events',n);
 DELETE FROM public.cron_job_runs WHERE id IN (SELECT id FROM public.cron_job_runs WHERE started_at<now()-interval '90 days' LIMIT 50000); GET DIAGNOSTICS n=ROW_COUNT; v_out:=v_out||jsonb_build_object('cron_job_runs',n);
 DELETE FROM public.system_alerts WHERE id IN (SELECT id FROM public.system_alerts WHERE created_at<now()-interval '180 days' LIMIT 50000); GET DIAGNOSTICS n=ROW_COUNT; v_out:=v_out||jsonb_build_object('system_alerts',n);
 DELETE FROM public.email_sync_runs WHERE id IN (SELECT id FROM public.email_sync_runs WHERE started_at<now()-interval '90 days' LIMIT 50000); GET DIAGNOSTICS n=ROW_COUNT; v_out:=v_out||jsonb_build_object('email_sync_runs',n);
 DELETE FROM public.webhook_inbox WHERE id IN (SELECT id FROM public.webhook_inbox WHERE (status IN ('processed','duplicate') AND received_at<now()-interval '180 days') OR received_at<now()-interval '365 days' LIMIT 50000); GET DIAGNOSTICS n=ROW_COUNT; v_out:=v_out||jsonb_build_object('webhook_inbox',n);
 DELETE FROM public.notification_attempts WHERE id IN (SELECT id FROM public.notification_attempts WHERE state IN ('delivered','failed_terminal','sent','failed','skipped') AND created_at<now()-interval '180 days' LIMIT 50000); GET DIAGNOSTICS n=ROW_COUNT; v_out:=v_out||jsonb_build_object('notification_attempts',n);
 DELETE FROM public.public_booking_rate_limits WHERE id IN (SELECT id FROM public.public_booking_rate_limits WHERE bucket_start<now()-interval '3 days' LIMIT 50000); GET DIAGNOSTICS n=ROW_COUNT; v_out:=v_out||jsonb_build_object('public_booking_rate_limits',n);
 v_out:=v_out||jsonb_build_object('ai_rate_limits',public.cleanup_old_rate_limits());
 IF to_regclass('cron.job_run_details') IS NOT NULL THEN BEGIN
 EXECUTE $q$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '30 days'$q$;
 GET DIAGNOSTICS n=ROW_COUNT; v_out:=v_out||jsonb_build_object('cron_job_run_details',n);
 EXCEPTION WHEN insufficient_privilege THEN v_out:=v_out||jsonb_build_object('cron_job_run_details','permission_denied'); END; END IF;
 RETURN v_out;
END; $$;
REVOKE ALL ON FUNCTION public.purge_operational_logs() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.purge_operational_logs() TO service_role;
DO $do$ BEGIN
 IF to_regnamespace('cron') IS NOT NULL THEN
 PERFORM cron.unschedule('purge-operational-logs-daily') WHERE EXISTS(SELECT 1 FROM cron.job WHERE jobname='purge-operational-logs-daily');
 PERFORM cron.schedule('purge-operational-logs-daily','47 3 * * *',$cron$SELECT public.cron_invoke_rpc('purge_operational_logs', 'public.purge_operational_logs()')$cron$);
 END IF;
END $do$;