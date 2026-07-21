
-- Widen severity vocabulary on the expectations table first.
ALTER TABLE public.automation_health_expectations
  DROP CONSTRAINT IF EXISTS automation_health_expectations_severity_check;
UPDATE public.automation_health_expectations SET severity = 'high' WHERE severity = 'warning';
ALTER TABLE public.automation_health_expectations
  ADD CONSTRAINT automation_health_expectations_severity_check
  CHECK (severity IN ('critical','high','medium','low','info'));

-- F1 registry
DELETE FROM public.automation_health_expectations WHERE job_name = 'email_sync_status';

INSERT INTO public.automation_health_expectations
  (job_name, expected_cadence_seconds, grace_seconds, severity, owner, enabled)
VALUES
  ('automation-engine',              3600,  600, 'critical', 'ops', true),
  ('sync-outlook-emails',             300,  120, 'high',     'ops', true),
  ('sweep-session-transcripts',      1200,  600, 'high',     'ops', true),
  ('check-missed-milestones',       86400, 1800, 'medium',   'ops', true),
  ('check-mentor-nda-expiry',       86400, 1800, 'medium',   'ops', true),
  ('generate-crm-notifications',    86400, 1800, 'medium',   'ops', true),
  ('recompute-health-scores',       86400, 1800, 'medium',   'ops', true),
  ('run-intake-reminders',          86400, 1800, 'low',      'ops', true),
  ('send-milestone-reminders',      86400, 1800, 'low',      'ops', true),
  ('archive-contracts-to-sharepoint',86400,3600, 'medium',   'ops', true),
  ('check-contract-anniversaries',  86400, 1800, 'medium',   'ops', true),
  ('compute-cohort-benchmarks',     86400, 3600, 'low',      'ops', true),
  ('run-checkin-reminders',        604800, 3600, 'low',      'ops', true),
  ('run-ecosystem-snapshot',        86400, 3600, 'low',      'ops', true),
  ('send-email-digest',            604800, 3600, 'low',      'ops', true),
  ('send-weekly-health-digest',    604800, 3600, 'low',      'ops', true),
  ('check_automation_health',        900,  300, 'high',      'ops', true),
  ('check_email_sync_health',        600,  300, 'high',      'ops', true)
ON CONFLICT (job_name) DO UPDATE
SET expected_cadence_seconds = EXCLUDED.expected_cadence_seconds,
    grace_seconds            = EXCLUDED.grace_seconds,
    severity                 = EXCLUDED.severity,
    owner                    = EXCLUDED.owner,
    enabled                  = EXCLUDED.enabled,
    updated_at               = now();

-- F2 system_alerts severity vocabulary
UPDATE public.system_alerts SET severity = 'high'     WHERE severity = 'warning';
UPDATE public.system_alerts SET severity = 'critical' WHERE severity = 'error';
UPDATE public.system_alerts SET severity = 'info'     WHERE severity IS NULL OR severity = '';

ALTER TABLE public.system_alerts DROP CONSTRAINT IF EXISTS system_alerts_severity_check;
ALTER TABLE public.system_alerts
  ADD CONSTRAINT system_alerts_severity_check
  CHECK (severity IN ('critical','high','medium','low','info'));

CREATE OR REPLACE FUNCTION public.check_automation_health()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
      WHERE job_name = e.job_name AND started_at > now()-interval '48 hours'
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
END; $$;
REVOKE ALL ON FUNCTION public.check_automation_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_automation_health() TO service_role;

CREATE OR REPLACE FUNCTION public.check_email_sync_health()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_stale int; v_flapping int;
BEGIN
  SELECT COUNT(*) INTO v_stale FROM public.email_sync_status
   WHERE last_success_at IS NOT NULL AND last_success_at < now()-interval '2 hours';
  IF v_stale > 0 THEN
    INSERT INTO public.system_alerts (kind,severity,dedupe_key,payload)
    VALUES ('email_sync_stale','critical','email_sync_stale:'||to_char(now(),'YYYY-MM-DD-HH24'),
            jsonb_build_object('stale_count',v_stale))
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  SELECT COUNT(*) INTO v_flapping FROM public.email_sync_runs
   WHERE started_at > now()-interval '1 hour' AND status = 'failed';
  IF v_flapping >= 3 THEN
    INSERT INTO public.system_alerts (kind,severity,dedupe_key,payload)
    VALUES ('email_sync_flapping','high','email_sync_flap:'||to_char(now(),'YYYY-MM-DD-HH24'),
            jsonb_build_object('failures_last_hour',v_flapping))
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.check_email_sync_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_email_sync_health() TO service_role;

CREATE OR REPLACE VIEW public.automation_health_summary
WITH (security_invoker = true) AS
SELECT
  e.job_name, e.severity AS expected_severity, e.enabled,
  e.expected_cadence_seconds, e.grace_seconds,
  r.last_ok, r.last_failed, r.last_started, r.failures_24h,
  CASE
    WHEN e.enabled = false                                     THEN 'DISABLED'
    WHEN r.last_started IS NULL                                THEN 'NEVER_RUN'
    WHEN r.last_ok IS NULL AND r.last_failed IS NOT NULL       THEN 'FAILING'
    WHEN r.last_ok IS NOT NULL
         AND r.last_ok < now()-make_interval(secs => e.expected_cadence_seconds + e.grace_seconds)
                                                               THEN 'STALE'
    WHEN r.last_failed IS NOT NULL AND r.last_ok IS NOT NULL
         AND r.last_ok > r.last_failed
         AND r.last_failed > now()-interval '24 hours'         THEN 'RECOVERED'
    WHEN r.last_ok IS NOT NULL                                 THEN 'OK'
    ELSE 'UNKNOWN'
  END AS health_state
FROM public.automation_health_expectations e
LEFT JOIN LATERAL (
  SELECT MAX(started_at) FILTER (WHERE status='ok') AS last_ok,
         MAX(started_at) FILTER (WHERE status='failed') AS last_failed,
         MAX(started_at) AS last_started,
         COUNT(*) FILTER (WHERE status='failed' AND started_at > now()-interval '24 hours') AS failures_24h
  FROM public.cron_job_runs
  WHERE job_name = e.job_name AND started_at > now()-interval '7 days'
) r ON TRUE;

GRANT SELECT ON public.automation_health_summary TO authenticated;

-- F3 transcripts
UPDATE public.session_transcripts SET source='teams_graph' WHERE source='import-teams-transcript';
UPDATE public.session_transcripts
   SET confidentiality='staff_only',
       pending_confidentiality_review = COALESCE(pending_confidentiality_review,true)
 WHERE source IS NULL
   AND (confidentiality IS NULL OR confidentiality NOT IN ('staff_only','workspace','public'));

ALTER TABLE public.session_transcripts DROP CONSTRAINT IF EXISTS session_transcripts_source_check;
ALTER TABLE public.session_transcripts
  ADD CONSTRAINT session_transcripts_source_check
  CHECK (source IS NULL OR source IN ('teams_graph','manual_upload','voice','unknown'));

CREATE TABLE IF NOT EXISTS public.session_transcript_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transcript_id uuid NOT NULL REFERENCES public.session_transcripts(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  old_confidentiality text,
  new_confidentiality text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.session_transcript_audit TO authenticated;
GRANT ALL ON public.session_transcript_audit TO service_role;
ALTER TABLE public.session_transcript_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff read transcript audit" ON public.session_transcript_audit;
CREATE POLICY "Staff read transcript audit"
  ON public.session_transcript_audit FOR SELECT TO authenticated
  USING (public.is_staff());
CREATE INDEX IF NOT EXISTS idx_transcript_audit_transcript
  ON public.session_transcript_audit(transcript_id, created_at DESC);

CREATE OR REPLACE VIEW public.session_transcripts_review_queue
WITH (security_invoker = true) AS
SELECT t.id, t.session_id, t.source, t.confidentiality,
       t.pending_confidentiality_review, t.contained_at, t.created_at,
       CASE
         WHEN t.source IS NULL                        THEN 'unknown_source'
         WHEN t.pending_confidentiality_review = true THEN 'pending_review'
         ELSE 'other'
       END AS review_reason
FROM public.session_transcripts t
WHERE t.pending_confidentiality_review = true OR t.source IS NULL;
GRANT SELECT ON public.session_transcripts_review_queue TO authenticated;

CREATE OR REPLACE FUNCTION public.staff_reclassify_transcript_confidentiality(
  p_transcript_id uuid, p_new_confidentiality text, p_reason text DEFAULT NULL
) RETURNS public.session_transcripts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_old text; v_row public.session_transcripts;
BEGIN
  IF v_actor IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_new_confidentiality NOT IN ('staff_only','workspace','public') THEN
    RAISE EXCEPTION 'invalid confidentiality: %', p_new_confidentiality USING ERRCODE = '22023';
  END IF;
  SELECT confidentiality INTO v_old FROM public.session_transcripts
   WHERE id = p_transcript_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transcript % not found', p_transcript_id USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.session_transcripts
     SET confidentiality = p_new_confidentiality,
         pending_confidentiality_review = false,
         contained_at = COALESCE(contained_at, now())
   WHERE id = p_transcript_id
   RETURNING * INTO v_row;
  INSERT INTO public.session_transcript_audit
    (transcript_id, actor_id, old_confidentiality, new_confidentiality, reason)
  VALUES (p_transcript_id, v_actor, v_old, p_new_confidentiality, p_reason);
  RETURN v_row;
END; $$;
REVOKE ALL ON FUNCTION public.staff_reclassify_transcript_confidentiality(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_reclassify_transcript_confidentiality(uuid, text, text)
  TO authenticated, service_role;
