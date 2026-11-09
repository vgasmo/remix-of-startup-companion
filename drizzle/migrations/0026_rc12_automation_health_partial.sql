DO $guard$
DECLARE v_def text; v_md5 text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO v_def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='check_automation_health' AND pg_get_function_identity_arguments(p.oid)='';
 v_md5:=md5(v_def);
 IF v_md5 NOT IN ('6ec2ef1a6fc4a52989a5bc4dec5bb39a','d5099e61fd87368518264c5dfaee15ae') THEN RAISE EXCEPTION 'rc12: definicao de public.check_automation_health divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar',v_md5; END IF;
 v_md5:=md5(regexp_replace(pg_get_viewdef('public.automation_health_summary'::regclass),'\s+',' ','g'));
 IF v_md5 NOT IN ('a85f40396badb19c65f28897f7ef8d5b','f1a14b7dbfcd5a805c31839fa8114f60') THEN RAISE EXCEPTION 'rc12: definicao de public.automation_health_summary divergente (md5 %), envie o resultado de pg_get_viewdef antes de aplicar',v_md5; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.check_automation_health() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_row record; v_dedupe text; v_grace interval;
BEGIN
 FOR v_row IN
 SELECT e.job_name,e.expected_cadence_seconds,e.grace_seconds,e.severity,r.last_ok,r.last_failed,r.failures_24h
 FROM public.automation_health_expectations e LEFT JOIN LATERAL (
 SELECT MAX(started_at) FILTER (WHERE status IN ('ok','partial')) AS last_ok,MAX(started_at) FILTER (WHERE status='failed') AS last_failed,COUNT(*) FILTER (WHERE status='failed' AND started_at>now()-interval '24 hours') AS failures_24h
 FROM public.cron_job_runs WHERE job_name=e.job_name AND triggered_by='cron' AND started_at>now()-GREATEST(interval '48 hours',make_interval(secs=>2*e.expected_cadence_seconds+e.grace_seconds))) r ON TRUE WHERE e.enabled=true
 LOOP
 v_grace:=make_interval(secs=>v_row.expected_cadence_seconds+v_row.grace_seconds);
 IF v_row.last_ok IS NULL OR v_row.last_ok<now()-v_grace THEN
 v_dedupe:='cron_stale:'||v_row.job_name||':'||to_char(now(),'YYYY-MM-DD-HH24');
 INSERT INTO public.system_alerts(kind,severity,dedupe_key,payload) VALUES('cron_stale',v_row.severity,v_dedupe,jsonb_build_object('job',v_row.job_name,'last_ok',v_row.last_ok,'last_failed',v_row.last_failed,'never_run',v_row.last_ok IS NULL)) ON CONFLICT(dedupe_key) DO NOTHING;
 END IF;
 IF COALESCE(v_row.failures_24h,0)>=3 THEN
 v_dedupe:='cron_failed:'||v_row.job_name||':'||to_char(now(),'YYYY-MM-DD');
 INSERT INTO public.system_alerts(kind,severity,dedupe_key,payload) VALUES('cron_failed','critical',v_dedupe,jsonb_build_object('job',v_row.job_name,'failures_24h',v_row.failures_24h)) ON CONFLICT(dedupe_key) DO NOTHING;
 END IF;
 END LOOP;
END; $function$;
CREATE OR REPLACE VIEW public.automation_health_summary AS
 SELECT e.job_name,e.severity AS expected_severity,e.enabled,e.expected_cadence_seconds,e.grace_seconds,r.last_ok,r.last_failed,r.last_started,r.failures_24h,
 CASE WHEN e.enabled=false THEN 'DISABLED'::text WHEN r.last_started IS NULL THEN 'NEVER_RUN'::text WHEN r.last_ok IS NULL AND r.last_failed IS NOT NULL THEN 'FAILING'::text WHEN r.last_ok IS NOT NULL AND r.last_ok<(now()-make_interval(secs=>(e.expected_cadence_seconds+e.grace_seconds)::double precision)) THEN 'STALE'::text WHEN r.last_failed IS NOT NULL AND r.last_ok IS NOT NULL AND r.last_ok>r.last_failed AND r.last_failed>(now()-'24:00:00'::interval) THEN 'RECOVERED'::text WHEN r.last_ok IS NOT NULL THEN 'OK'::text ELSE 'UNKNOWN'::text END AS health_state
 FROM public.automation_health_expectations e LEFT JOIN LATERAL (
 SELECT max(cron_job_runs.started_at) FILTER(WHERE cron_job_runs.status=ANY(ARRAY['ok'::text,'partial'::text])) AS last_ok,max(cron_job_runs.started_at) FILTER(WHERE cron_job_runs.status='failed'::text) AS last_failed,max(cron_job_runs.started_at) AS last_started,count(*) FILTER(WHERE cron_job_runs.status='failed'::text AND cron_job_runs.started_at>(now()-'24:00:00'::interval)) AS failures_24h
 FROM public.cron_job_runs WHERE cron_job_runs.job_name=e.job_name AND cron_job_runs.started_at>now()-GREATEST(interval '7 days',make_interval(secs=>2*e.expected_cadence_seconds+e.grace_seconds))) r ON true;
ALTER VIEW public.automation_health_summary SET(security_invoker=true);