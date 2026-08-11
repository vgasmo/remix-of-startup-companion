-- ============================================================
-- RC5 Batch G1 — Automation plumbing truth
-- ============================================================

-- 1. Single-use cron invocation tokens ------------------------
CREATE TABLE IF NOT EXISTS public.cron_invocation_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  job_name text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.cron_invocation_tokens TO service_role;
ALTER TABLE public.cron_invocation_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cron_invocation_tokens_service_only" ON public.cron_invocation_tokens;
CREATE POLICY "cron_invocation_tokens_service_only"
  ON public.cron_invocation_tokens FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_cron_invocation_tokens_expiry
  ON public.cron_invocation_tokens (expires_at);

CREATE OR REPLACE FUNCTION public.issue_cron_token(p_job_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token text;
BEGIN
  DELETE FROM public.cron_invocation_tokens WHERE expires_at < now() - interval '1 day';
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.cron_invocation_tokens (token_hash, job_name, expires_at)
  VALUES (encode(digest(v_token, 'sha256'), 'hex'), p_job_name, now() + interval '5 minutes');
  RETURN v_token;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_cron_token(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_cron_token(p_token text, p_job_name text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_ok boolean := false;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN false;
  END IF;

  UPDATE public.cron_invocation_tokens
     SET consumed_at = now()
   WHERE token_hash = encode(digest(p_token, 'sha256'), 'hex')
     AND consumed_at IS NULL
     AND expires_at > now()
     AND (p_job_name IS NULL OR job_name = p_job_name)
  RETURNING true INTO v_ok;

  RETURN COALESCE(v_ok, false);
END;
$$;

REVOKE ALL ON FUNCTION public.consume_cron_token(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_cron_token(text, text) TO service_role;

-- 2. Canonical edge invoker -----------------------------------
CREATE OR REPLACE FUNCTION public.cron_invoke_edge(p_function text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, net
AS $$
DECLARE
  v_url text;
  v_token text;
  v_request_id bigint;
BEGIN
  IF p_function IS NULL OR p_function = '' THEN
    RAISE EXCEPTION 'cron_invoke_edge: function name required' USING ERRCODE = '22023';
  END IF;

  v_url := 'https://apxzuslwhjujgrcsfzqw.supabase.co/functions/v1/' || p_function;
  v_token := public.issue_cron_token(p_function);

  SELECT net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', v_token
    ),
    body := COALESCE(p_payload, '{}'::jsonb),
    timeout_milliseconds := 60000
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION public.cron_invoke_edge(text, jsonb) FROM PUBLIC, anon, authenticated;

-- 3. RPC-cron wrapper that records runs -----------------------
CREATE OR REPLACE FUNCTION public.cron_invoke_rpc(p_job_name text, p_function text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
BEGIN
  EXECUTE format('SELECT %s', p_function);
  PERFORM public.log_cron_job_run(
    p_job_name, 'ok',
    (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int,
    NULL, NULL, jsonb_build_object('invoked', p_function), 'cron'
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run(
    p_job_name, 'failed',
    (EXTRACT(EPOCH FROM (clock_timestamp() - v_started)) * 1000)::int,
    SQLSTATE, left(SQLERRM, 400), jsonb_build_object('invoked', p_function), 'cron'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cron_invoke_rpc(text, text) FROM PUBLIC, anon, authenticated;

-- 4. Fix the watchdog dedupe (partial unique index cannot back ON CONFLICT)
UPDATE public.system_alerts SET dedupe_key = 'legacy:' || id::text WHERE dedupe_key IS NULL;
ALTER TABLE public.system_alerts ALTER COLUMN dedupe_key SET NOT NULL;
DROP INDEX IF EXISTS public.uq_system_alerts_dedupe;
CREATE UNIQUE INDEX IF NOT EXISTS uq_system_alerts_dedupe
  ON public.system_alerts (dedupe_key);

-- 5. Re-create every function-based schedule through cron_invoke_edge
DO $do$
DECLARE
  v_jobs jsonb := jsonb_build_array(
    jsonb_build_object('name','archive-contracts-daily','sched','0 2 * * *','fn','archive-contracts-to-sharepoint'),
    jsonb_build_object('name','auto-sync-outlook-emails','sched','*/5 * * * *','fn','sync-outlook-emails'),
    jsonb_build_object('name','automation-engine-hourly','sched','0 * * * *','fn','automation-engine'),
    jsonb_build_object('name','check-contract-anniversaries-daily','sched','0 6 * * *','fn','check-contract-anniversaries'),
    jsonb_build_object('name','check-mentor-nda-expiry-daily','sched','0 8 * * *','fn','check-mentor-nda-expiry'),
    jsonb_build_object('name','check-missed-milestones-daily','sched','0 9 * * *','fn','check-missed-milestones'),
    jsonb_build_object('name','compute-cohort-benchmarks-daily','sched','0 4 * * *','fn','compute-cohort-benchmarks'),
    jsonb_build_object('name','generate-crm-notifications-daily','sched','30 8 * * *','fn','generate-crm-notifications'),
    jsonb_build_object('name','open-monthly-founder-pulse','sched','0 8 1 * *','fn','open-monthly-founder-pulse'),
    jsonb_build_object('name','recompute-health-scores-daily','sched','0 6 * * *','fn','recompute-health-scores'),
    jsonb_build_object('name','run-checkin-reminders-weekly','sched','0 9 * * 1','fn','run-checkin-reminders'),
    jsonb_build_object('name','run-ecosystem-snapshot-daily','sched','0 3 * * *','fn','run-ecosystem-snapshot'),
    jsonb_build_object('name','run-intake-reminders','sched','0 9 * * *','fn','run-intake-reminders'),
    jsonb_build_object('name','send-email-digest-weekly','sched','0 8 * * 1','fn','send-email-digest'),
    jsonb_build_object('name','send-milestone-reminders-daily','sched','30 8 * * *','fn','send-milestone-reminders'),
    jsonb_build_object('name','send-weekly-health-digest-weekly','sched','30 7 * * 1','fn','send-weekly-health-digest'),
    jsonb_build_object('name','sweep-session-transcripts','sched','*/20 * * * *','fn','sweep-session-transcripts')
  );
  v_job jsonb;
BEGIN
  FOR v_job IN SELECT * FROM jsonb_array_elements(v_jobs) LOOP
    PERFORM cron.unschedule((v_job->>'name'))
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = (v_job->>'name'));
    PERFORM cron.schedule(
      (v_job->>'name'),
      (v_job->>'sched'),
      format('SELECT public.cron_invoke_edge(%L)', v_job->>'fn')
    );
  END LOOP;
END
$do$;

-- 6. RPC-based schedules now log their runs
DO $do$
DECLARE
  v_jobs jsonb := jsonb_build_array(
    jsonb_build_object('name','check-automation-health-15m','sched','*/15 * * * *','job','check_automation_health','fn','public.check_automation_health()'),
    jsonb_build_object('name','email-sync-health-check','sched','*/10 * * * *','job','check_email_sync_health','fn','public.check_email_sync_health()'),
    jsonb_build_object('name','ecosystem-invariants-hourly','sched','17 * * * *','job','check_ecosystem_invariants','fn','public.check_ecosystem_invariants()'),
    jsonb_build_object('name','reconcile-contract-founders-hourly','sched','17 * * * *','job','reconcile_contract_founders','fn','public.reconcile_contract_founders(NULL)')
  );
  v_job jsonb;
BEGIN
  FOR v_job IN SELECT * FROM jsonb_array_elements(v_jobs) LOOP
    PERFORM cron.unschedule((v_job->>'name'))
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = (v_job->>'name'));
    PERFORM cron.schedule(
      (v_job->>'name'),
      (v_job->>'sched'),
      format('SELECT public.cron_invoke_rpc(%L, %L)', v_job->>'job', v_job->>'fn')
    );
  END LOOP;
END
$do$;

-- 7. Health registry alignment --------------------------------
INSERT INTO public.automation_health_expectations (job_name, expected_cadence_seconds, grace_seconds, severity, owner)
VALUES
  ('check_ecosystem_invariants', 3600, 900, 'medium', 'ops'),
  ('reconcile_contract_founders', 3600, 900, 'high', 'ops'),
  ('open-monthly-founder-pulse', 2678400, 86400, 'medium', 'ops')
ON CONFLICT (job_name) DO UPDATE
  SET expected_cadence_seconds = EXCLUDED.expected_cadence_seconds,
      grace_seconds = EXCLUDED.grace_seconds,
      severity = EXCLUDED.severity,
      updated_at = now();