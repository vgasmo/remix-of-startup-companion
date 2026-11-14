-- Disposable database only: never run against hosted pg_net responses.
BEGIN;
CREATE SCHEMA IF NOT EXISTS net;
CREATE TABLE IF NOT EXISTS net._http_response (
 id bigint, status_code integer, error_msg text, timed_out boolean, created timestamptz NOT NULL DEFAULT now()
);
INSERT INTO net._http_response(id,status_code,error_msg,timed_out,created) VALUES
 (-13001,200,NULL,false,now()), (-13002,299,NULL,false,now()),
 (-13003,199,NULL,false,now()), (-13004,300,NULL,false,now()),
 (-13005,200,'transport failed',false,now()), (-13006,NULL,'timeout',true,now()),
 (-13007,500,NULL,false,now()-interval '2 hours');
SELECT public.check_cron_http_responses();
DO $$ BEGIN
 IF (SELECT count(*) FROM public.system_alerts WHERE dedupe_key IN (
 'cron_http_response:-13003','cron_http_response:-13004','cron_http_response:-13005','cron_http_response:-13006')) <> 4
 THEN RAISE EXCEPTION 'Expected four failed responses'; END IF;
 IF EXISTS(SELECT 1 FROM public.system_alerts WHERE dedupe_key IN (
 'cron_http_response:-13001','cron_http_response:-13002','cron_http_response:-13007'))
 THEN RAISE EXCEPTION 'Successful/old responses must not alert'; END IF;
END $$;
SELECT public.check_cron_http_responses();
DO $$ BEGIN
 IF (SELECT count(*) FROM public.system_alerts WHERE dedupe_key LIKE 'cron_http_response:-1300%') <> 4
 THEN RAISE EXCEPTION 'Response IDs must deduplicate'; END IF;
END $$;
ROLLBACK;