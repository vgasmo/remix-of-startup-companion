
-- 1) cron_job_runs: structured job-level log for scheduled work
CREATE TABLE IF NOT EXISTS public.cron_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','failed','partial','skipped')),
  duration_ms INTEGER,
  triggered_by TEXT NOT NULL DEFAULT 'cron',
  error_code TEXT,
  error_summary TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_job_runs_job_started
  ON public.cron_job_runs(job_name, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_cron_job_runs_status
  ON public.cron_job_runs(status, started_at DESC)
  WHERE status IN ('failed','partial');

GRANT SELECT ON public.cron_job_runs TO authenticated;
GRANT ALL ON public.cron_job_runs TO service_role;

ALTER TABLE public.cron_job_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read cron job runs" ON public.cron_job_runs;
CREATE POLICY "Admins can read cron job runs"
  ON public.cron_job_runs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 2) log helper for edge functions (service role)
CREATE OR REPLACE FUNCTION public.log_cron_job_run(
  p_job_name TEXT,
  p_status TEXT,
  p_duration_ms INTEGER DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_error_summary TEXT DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb,
  p_triggered_by TEXT DEFAULT 'cron'
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.cron_job_runs(
    job_name, status, duration_ms, error_code, error_summary, details, triggered_by,
    finished_at
  )
  VALUES (
    p_job_name, p_status, p_duration_ms, p_error_code, p_error_summary,
    COALESCE(p_details, '{}'::jsonb), p_triggered_by,
    CASE WHEN p_status IN ('ok','failed','partial','skipped') THEN now() ELSE NULL END
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.log_cron_job_run(TEXT,TEXT,INTEGER,TEXT,TEXT,JSONB,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_cron_job_run(TEXT,TEXT,INTEGER,TEXT,TEXT,JSONB,TEXT) TO service_role;

-- 3) Automation health watchdog: turns silent failures into system_alerts
CREATE OR REPLACE FUNCTION public.check_automation_health()
RETURNS TABLE(job_name TEXT, issue TEXT, details JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := now();
  v_thresholds JSONB := jsonb_build_object(
    'automation-engine', 90,          -- minutes: hourly, alert after 90m gap
    'sweep-session-transcripts', 60,  -- 20m cron, alert after 60m
    'check-contract-anniversaries', 1500, -- daily, alert after 25h
    'check-mentor-nda-expiry', 1500,
    'check-missed-milestones', 1500,
    'archive-contracts-to-sharepoint', 1500,
    'reconciler-run', 180
  );
  v_job TEXT;
  v_last_ok TIMESTAMPTZ;
  v_recent_failures INTEGER;
  v_max_gap_min INTEGER;
BEGIN
  FOR v_job IN SELECT jsonb_object_keys(v_thresholds) LOOP
    v_max_gap_min := (v_thresholds ->> v_job)::INT;

    SELECT MAX(finished_at) INTO v_last_ok
    FROM public.cron_job_runs
    WHERE cron_job_runs.job_name = v_job AND status = 'ok';

    SELECT COUNT(*) INTO v_recent_failures
    FROM public.cron_job_runs
    WHERE cron_job_runs.job_name = v_job
      AND status IN ('failed','partial')
      AND started_at > v_now - INTERVAL '6 hours';

    -- Two or more failures in the last 6h → alert
    IF v_recent_failures >= 2 THEN
      INSERT INTO public.system_alerts(alert_type, severity, message, metadata)
      VALUES (
        'automation_flapping',
        'warning',
        format('%s falhou %s vezes nas últimas 6h', v_job, v_recent_failures),
        jsonb_build_object('job', v_job, 'failures_6h', v_recent_failures)
      );
      RETURN QUERY SELECT v_job, 'flapping'::TEXT,
        jsonb_build_object('failures_6h', v_recent_failures);
    END IF;

    -- Stale: last successful run too old (or never)
    IF v_last_ok IS NULL OR v_last_ok < v_now - make_interval(mins => v_max_gap_min) THEN
      INSERT INTO public.system_alerts(alert_type, severity, message, metadata)
      VALUES (
        'automation_stale',
        'warning',
        format('%s sem execução OK há mais de %s minutos', v_job, v_max_gap_min),
        jsonb_build_object(
          'job', v_job,
          'last_ok', v_last_ok,
          'threshold_min', v_max_gap_min
        )
      );
      RETURN QUERY SELECT v_job, 'stale'::TEXT,
        jsonb_build_object('last_ok', v_last_ok, 'threshold_min', v_max_gap_min);
    END IF;
  END LOOP;

  -- Also inspect email_sync_runs: latest run failed
  IF EXISTS (
    SELECT 1 FROM public.email_sync_runs
    WHERE started_at > v_now - INTERVAL '2 hours'
      AND status = 'failed'
    ORDER BY started_at DESC LIMIT 1
  ) THEN
    INSERT INTO public.system_alerts(alert_type, severity, message, metadata)
    VALUES (
      'email_sync_failure',
      'warning',
      'Última execução do sync Outlook falhou',
      jsonb_build_object('component', 'email_sync_runs')
    );
    RETURN QUERY SELECT 'sync-outlook-emails'::TEXT, 'failed'::TEXT, '{}'::jsonb;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.check_automation_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_automation_health() TO service_role, authenticated;

-- 4) funnel_items → funnel_events trigger (guaranteed audit)
CREATE OR REPLACE FUNCTION public.log_funnel_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.stage IS DISTINCT FROM OLD.stage THEN
    INSERT INTO public.funnel_events(
      funnel_item_id, event_type, from_stage, to_stage, performed_by, metadata
    )
    VALUES (
      NEW.id,
      'stage_change',
      OLD.stage,
      NEW.stage,
      auth.uid(),
      jsonb_build_object('via', 'trigger', 'at', now())
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_funnel_items_log_stage_change ON public.funnel_items;
CREATE TRIGGER trg_funnel_items_log_stage_change
  AFTER UPDATE ON public.funnel_items
  FOR EACH ROW
  EXECUTE FUNCTION public.log_funnel_stage_change();

-- 5) CRM orphan reconciliation (dry-run capable)
CREATE OR REPLACE FUNCTION public.crm_reconcile_orphans(p_dry_run BOOLEAN DEFAULT true)
RETURNS TABLE(
  funnel_item_id UUID,
  resolved_via TEXT,
  linked_startup_id UUID,
  linked_workspace_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_startup UUID;
  v_workspace UUID;
  v_via TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_only';
  END IF;

  FOR r IN
    SELECT fi.id, fi.contact_email, fi.hubspot_company_id, fi.nif_normalized
    FROM public.funnel_items fi
    WHERE fi.linked_startup_id IS NULL
      AND fi.linked_workspace_id IS NULL
  LOOP
    v_startup := NULL; v_workspace := NULL; v_via := NULL;

    -- (a) hubspot_company_id direct match
    IF r.hubspot_company_id IS NOT NULL THEN
      SELECT s.id INTO v_startup FROM public.startups s
      WHERE s.hubspot_company_id = r.hubspot_company_id LIMIT 1;
      IF v_startup IS NOT NULL THEN v_via := 'hubspot_company_id'; END IF;
    END IF;

    -- (b) nif_normalized match
    IF v_startup IS NULL AND r.nif_normalized IS NOT NULL THEN
      SELECT s.id INTO v_startup FROM public.startups s
      WHERE s.nif_normalized = r.nif_normalized LIMIT 1;
      IF v_startup IS NOT NULL THEN v_via := 'nif'; END IF;
    END IF;

    -- (c) contact_email → workspace_users
    IF v_workspace IS NULL AND r.contact_email IS NOT NULL THEN
      SELECT wu.workspace_id INTO v_workspace
      FROM public.workspace_users wu
      JOIN public.profiles p ON p.id = wu.user_id
      WHERE lower(p.email) = lower(r.contact_email)
      LIMIT 1;
      IF v_workspace IS NOT NULL THEN v_via := COALESCE(v_via, 'email'); END IF;
    END IF;

    -- Derive workspace from startup if still missing
    IF v_workspace IS NULL AND v_startup IS NOT NULL THEN
      SELECT w.id INTO v_workspace
      FROM public.workspaces w
      WHERE w.startup_id = v_startup
      ORDER BY w.updated_at DESC NULLS LAST
      LIMIT 1;
    END IF;

    IF v_startup IS NOT NULL OR v_workspace IS NOT NULL THEN
      IF NOT p_dry_run THEN
        UPDATE public.funnel_items
        SET linked_startup_id = COALESCE(linked_startup_id, v_startup),
            linked_workspace_id = COALESCE(linked_workspace_id, v_workspace),
            updated_at = now()
        WHERE id = r.id;

        INSERT INTO public.funnel_events(funnel_item_id, event_type, metadata)
        VALUES (r.id, 'reconciled', jsonb_build_object('via', v_via, 'startup', v_startup, 'workspace', v_workspace));
      END IF;

      RETURN QUERY SELECT r.id, v_via, v_startup, v_workspace;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_reconcile_orphans(BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_reconcile_orphans(BOOLEAN) TO authenticated;

-- 6) Backfill last_contact_at from communication_log
CREATE OR REPLACE FUNCTION public.crm_backfill_last_contact_at()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_only';
  END IF;

  WITH latest AS (
    SELECT fi.id AS funnel_item_id,
           MAX(cl.original_timestamp) AS last_at
    FROM public.funnel_items fi
    LEFT JOIN public.communication_log cl
      ON cl.funnel_item_id = fi.id
    WHERE cl.original_timestamp IS NOT NULL
    GROUP BY fi.id
  )
  UPDATE public.funnel_items fi
  SET metadata_json = COALESCE(fi.metadata_json, '{}'::jsonb)
                      || jsonb_build_object('last_contact_at', l.last_at),
      last_activity_at = GREATEST(COALESCE(fi.last_activity_at, l.last_at), l.last_at)
  FROM latest l
  WHERE fi.id = l.funnel_item_id
    AND (
      fi.metadata_json ->> 'last_contact_at' IS NULL
      OR (fi.metadata_json ->> 'last_contact_at')::timestamptz < l.last_at
    );

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.crm_backfill_last_contact_at() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_backfill_last_contact_at() TO authenticated;
