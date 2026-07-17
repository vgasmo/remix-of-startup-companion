-- =========================================================================
-- REALTIME: publish workspace stage/health/KPI tables so the UI can drop polling
-- =========================================================================
DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'workspaces','workspace_users','stage_history','workspace_health_history',
    'workspace_health_alerts','kpi_values','action_items'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    -- REPLICA IDENTITY FULL for tables where we care about UPDATE payloads
    IF t IN ('workspaces','workspace_users','workspace_health_alerts','kpi_values','action_items') THEN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- =========================================================================
-- EMAIL SYNC HEALTH: retries + structured runs + deduped alerts
-- =========================================================================

-- 1) Per-consultant failure tracking
ALTER TABLE public.email_sync_status
  ADD COLUMN IF NOT EXISTS consecutive_failures INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_alert_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_run_ms INT;

-- 2) Per-run structured log
CREATE TABLE IF NOT EXISTS public.email_sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','ok','partial','failed','skipped')),
  triggered_by TEXT NOT NULL DEFAULT 'cron',
  consultants_total INT NOT NULL DEFAULT 0,
  consultants_ok INT NOT NULL DEFAULT 0,
  consultants_failed INT NOT NULL DEFAULT 0,
  emails_processed INT NOT NULL DEFAULT 0,
  emails_logged INT NOT NULL DEFAULT 0,
  emails_unmatched INT NOT NULL DEFAULT 0,
  duration_ms INT,
  error_summary TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.email_sync_runs TO authenticated;
GRANT ALL ON public.email_sync_runs TO service_role;

ALTER TABLE public.email_sync_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read email sync runs" ON public.email_sync_runs;
CREATE POLICY "Staff can read email sync runs"
  ON public.email_sync_runs FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.has_role(auth.uid(),'consultor'::app_role)
    OR public.has_role(auth.uid(),'backoffice'::app_role)
  );

CREATE INDEX IF NOT EXISTS idx_email_sync_runs_started
  ON public.email_sync_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_sync_runs_status
  ON public.email_sync_runs (status, started_at DESC);

-- 3) Health check function — emits deduped system_alerts when unhealthy
CREATE OR REPLACE FUNCTION public.check_email_sync_health()
RETURNS TABLE (
  status TEXT,
  minutes_since_last_success NUMERIC,
  failing_consultants INT,
  details JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_ok TIMESTAMPTZ;
  v_minutes NUMERIC;
  v_failing INT;
  v_det JSONB;
  v_status TEXT;
  v_dedupe TEXT;
BEGIN
  SELECT MAX(finished_at) INTO v_last_ok
    FROM public.email_sync_runs
    WHERE status IN ('ok','partial');

  v_minutes := COALESCE(EXTRACT(EPOCH FROM (now() - v_last_ok))/60, 9999);

  SELECT COUNT(*) INTO v_failing
    FROM public.email_sync_status
    WHERE consecutive_failures >= 3 AND provider = 'outlook';

  SELECT jsonb_build_object(
    'last_success_at', v_last_ok,
    'minutes_since_last_success', ROUND(v_minutes, 1),
    'failing', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object(
         'email', mailbox_email,
         'failures', consecutive_failures,
         'last_error', last_sync_error,
         'last_sync_at', last_sync_at
       ))
       FROM public.email_sync_status
       WHERE consecutive_failures >= 3 AND provider='outlook'),
      '[]'::jsonb)
  ) INTO v_det;

  IF v_minutes > 30 THEN
    v_status := 'stale';
  ELSIF v_failing > 0 THEN
    v_status := 'flapping';
  ELSE
    v_status := 'healthy';
  END IF;

  IF v_status <> 'healthy' THEN
    -- One alert per hour per kind
    v_dedupe := 'email_sync_' || v_status || '_' || to_char(now(),'YYYY-MM-DD-HH24');
    IF NOT EXISTS (
      SELECT 1 FROM public.system_alerts
      WHERE dedupe_key = v_dedupe
    ) THEN
      INSERT INTO public.system_alerts (kind, severity, dedupe_key, payload)
      VALUES (
        'email_sync_' || v_status,
        CASE WHEN v_status='stale' THEN 'high' ELSE 'medium' END,
        v_dedupe,
        v_det
      );
    END IF;
  END IF;

  RETURN QUERY SELECT v_status, ROUND(v_minutes,1), v_failing, v_det;
END;
$$;

REVOKE ALL ON FUNCTION public.check_email_sync_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_email_sync_health() TO service_role;
GRANT EXECUTE ON FUNCTION public.check_email_sync_health() TO authenticated;

-- Publish email_sync_runs + email_sync_status so admin dashboards can subscribe
DO $$
BEGIN
  ALTER TABLE public.email_sync_runs REPLICA IDENTITY FULL;
  ALTER TABLE public.email_sync_status REPLICA IDENTITY FULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='email_sync_runs') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_sync_runs;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='email_sync_status') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.email_sync_status;
  END IF;
END $$;

-- Schedule the health watchdog every 10 minutes (idempotent)
SELECT cron.unschedule('email-sync-health-check')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='email-sync-health-check');

SELECT cron.schedule(
  'email-sync-health-check',
  '*/10 * * * *',
  $cron$ SELECT public.check_email_sync_health(); $cron$
);