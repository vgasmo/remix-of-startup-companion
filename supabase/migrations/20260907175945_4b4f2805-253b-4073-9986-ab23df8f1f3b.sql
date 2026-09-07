-- =========================================================================
-- P1.1 — watchdog window must follow each job's own cadence
-- =========================================================================
CREATE OR REPLACE FUNCTION public.check_automation_health()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_row record; v_dedupe text; v_grace interval;
BEGIN
  FOR v_row IN
    SELECT e.job_name, e.expected_cadence_seconds, e.grace_seconds, e.severity,
           r.last_ok, r.last_failed, r.failures_24h
    FROM public.automation_health_expectations e
    LEFT JOIN LATERAL (
      SELECT MAX(started_at) FILTER (WHERE status='ok') AS last_ok,
             MAX(started_at) FILTER (WHERE status='failed') AS last_failed,
             COUNT(*) FILTER (WHERE status='failed' AND started_at > now()-interval '24 hours') AS failures_24h
      FROM public.cron_job_runs
      WHERE job_name = e.job_name
        AND started_at > now() - GREATEST(interval '48 hours',
              make_interval(secs => 2 * e.expected_cadence_seconds + e.grace_seconds))
    ) r ON TRUE
    WHERE e.enabled = true
  LOOP
    v_grace := make_interval(secs => v_row.expected_cadence_seconds + v_row.grace_seconds);
    IF v_row.last_ok IS NULL OR v_row.last_ok < now()-v_grace THEN
      v_dedupe := 'cron_stale:'||v_row.job_name||':'||to_char(now(),'YYYY-MM-DD-HH24');
      INSERT INTO public.system_alerts (kind,severity,dedupe_key,payload)
      VALUES ('cron_stale', v_row.severity, v_dedupe,
              jsonb_build_object('job',v_row.job_name,'last_ok',v_row.last_ok,'last_failed',v_row.last_failed,'never_run',v_row.last_ok IS NULL))
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
    IF COALESCE(v_row.failures_24h,0) >= 3 THEN
      v_dedupe := 'cron_failed:'||v_row.job_name||':'||to_char(now(),'YYYY-MM-DD');
      INSERT INTO public.system_alerts (kind,severity,dedupe_key,payload)
      VALUES ('cron_failed','critical',v_dedupe,
              jsonb_build_object('job',v_row.job_name,'failures_24h',v_row.failures_24h))
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
  END LOOP;
END; $function$;

CREATE OR REPLACE VIEW public.automation_health_summary AS
 SELECT e.job_name,
    e.severity AS expected_severity,
    e.enabled,
    e.expected_cadence_seconds,
    e.grace_seconds,
    r.last_ok,
    r.last_failed,
    r.last_started,
    r.failures_24h,
        CASE
            WHEN e.enabled = false THEN 'DISABLED'::text
            WHEN r.last_started IS NULL THEN 'NEVER_RUN'::text
            WHEN r.last_ok IS NULL AND r.last_failed IS NOT NULL THEN 'FAILING'::text
            WHEN r.last_ok IS NOT NULL AND r.last_ok < (now() - make_interval(secs => (e.expected_cadence_seconds + e.grace_seconds)::double precision)) THEN 'STALE'::text
            WHEN r.last_failed IS NOT NULL AND r.last_ok IS NOT NULL AND r.last_ok > r.last_failed AND r.last_failed > (now() - '24:00:00'::interval) THEN 'RECOVERED'::text
            WHEN r.last_ok IS NOT NULL THEN 'OK'::text
            ELSE 'UNKNOWN'::text
        END AS health_state
   FROM public.automation_health_expectations e
     LEFT JOIN LATERAL ( SELECT max(cron_job_runs.started_at) FILTER (WHERE cron_job_runs.status = 'ok'::text) AS last_ok,
            max(cron_job_runs.started_at) FILTER (WHERE cron_job_runs.status = 'failed'::text) AS last_failed,
            max(cron_job_runs.started_at) AS last_started,
            count(*) FILTER (WHERE cron_job_runs.status = 'failed'::text AND cron_job_runs.started_at > (now() - '24:00:00'::interval)) AS failures_24h
           FROM public.cron_job_runs
          WHERE cron_job_runs.job_name = e.job_name
            AND cron_job_runs.started_at > now() - GREATEST(interval '7 days',
                  make_interval(secs => 2 * e.expected_cadence_seconds + e.grace_seconds))) r ON true;

DELETE FROM public.system_alerts
 WHERE kind = 'cron_stale'
   AND payload->>'job' IN ('run-checkin-reminders','send-email-digest',
                           'send-weekly-health-digest','open-monthly-founder-pulse');

-- =========================================================================
-- P1.5 — GDPR retention for Founder Pulse responses
-- =========================================================================
ALTER TABLE public.founder_pulse_responses
  ALTER COLUMN respondent_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.anonymize_stale_founder_pulse_responses()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_affected integer := 0;
BEGIN
  UPDATE public.founder_pulse_responses
     SET respondent_id = NULL, blockers = NULL, wins = NULL, ask = NULL,
         metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('anonymized_at', now())
   WHERE submitted_at < now() - interval '18 months' AND respondent_id IS NOT NULL;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END; $$;

REVOKE ALL ON FUNCTION public.anonymize_stale_founder_pulse_responses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.anonymize_stale_founder_pulse_responses() TO service_role;

-- =========================================================================
-- P1.6 — CRM import batch finalization uses real columns
-- =========================================================================
ALTER TABLE public.crm_lead_import_batches
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.finalize_crm_import_batch(p_batch_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pending int; v_failed int; v_new_state text;
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice')) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) FILTER (WHERE valid AND committed_funnel_item_id IS NULL),
         count(*) FILTER (WHERE NOT valid)
    INTO v_pending, v_failed
    FROM public.crm_lead_import_rows WHERE batch_id = p_batch_id;

  v_new_state := CASE WHEN v_failed = 0 AND v_pending = 0 THEN 'committed' ELSE 'partial_needs_review' END;

  UPDATE public.crm_lead_import_batches
     SET lifecycle_state = v_new_state, updated_at = now() WHERE id = p_batch_id;

  RETURN v_new_state;
END; $$;

-- =========================================================================
-- P1.8 — founder kill-switch must not break chained writers
-- =========================================================================
REVOKE ALL ON FUNCTION public.founder_notifications_blocked(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.founder_notifications_blocked(uuid) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_pulse_notifications(p_cycle_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_cycle RECORD; v_founder RECORD; v_cmd TEXT; v_event_key TEXT; v_notification_id UUID; v_inserted INTEGER := 0;
BEGIN
  IF NOT public.is_feature_flag_enabled('founder_monthly_pulse') THEN RETURN 0; END IF;
  SELECT c.id, c.workspace_id, c.period_month, c.status INTO v_cycle FROM public.founder_pulse_cycles c WHERE c.id = p_cycle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cycle not found: %', p_cycle_id USING ERRCODE = 'P0002'; END IF;
  IF v_cycle.status <> 'open' THEN RETURN 0; END IF;
  FOR v_founder IN
    SELECT wu.user_id FROM public.workspace_users wu
    JOIN public.profiles p ON p.id = wu.user_id
    WHERE wu.workspace_id = v_cycle.workspace_id AND wu.active = true AND wu.role = 'founder'
      AND p.account_status = 'approved'::public.account_status
      AND public.is_account_active(wu.user_id) = true
      AND NOT public.founder_notifications_blocked(wu.user_id)
  LOOP
    v_cmd := 'pulse:' || v_cycle.id::text || ':' || v_founder.user_id::text || ':in_app';
    v_event_key := 'founder_pulse:' || v_cycle.id::text;
    INSERT INTO public.notifications (user_id, type, title, message, link, event_key, entity_type, entity_id, metadata)
    VALUES (v_founder.user_id, 'founder_pulse', 'Pulse mensal disponível', 'Partilha rapidamente o teu estado deste mês.',
      '/dashboard?pulse=' || v_cycle.id::text, v_event_key, 'founder_pulse_cycle', v_cycle.id,
      jsonb_build_object('workspace_id', v_cycle.workspace_id, 'period_month', v_cycle.period_month))
    ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO UPDATE SET metadata = EXCLUDED.metadata
    RETURNING id INTO v_notification_id;

    -- A BEFORE INSERT trigger may suppress the row; never queue an orphan attempt.
    IF v_notification_id IS NULL THEN CONTINUE; END IF;

    BEGIN
      INSERT INTO public.notification_attempts (notification_id, event_key, channel, state, client_command_id, metadata, max_attempts)
      VALUES (v_notification_id, v_event_key, 'in_app', 'queued', v_cmd,
        jsonb_build_object('cycle_id', v_cycle.id, 'workspace_id', v_cycle.workspace_id, 'user_id', v_founder.user_id), 5);
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN NULL; END;
  END LOOP;
  RETURN v_inserted;
END; $function$;