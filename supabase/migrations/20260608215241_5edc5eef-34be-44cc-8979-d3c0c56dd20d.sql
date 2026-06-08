
-- 1. cohort_benchmarks
CREATE TABLE public.cohort_benchmarks (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id uuid NOT NULL REFERENCES public.programs(id) ON DELETE CASCADE,
  stage text NOT NULL,
  metric_key text NOT NULL,
  metric_label text,
  cohort_size integer NOT NULL,
  p25 numeric,
  p50 numeric,
  p75 numeric,
  p90 numeric,
  avg numeric,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program_id, stage, metric_key)
);

CREATE INDEX idx_cohort_benchmarks_program ON public.cohort_benchmarks(program_id, stage);

GRANT SELECT ON public.cohort_benchmarks TO authenticated;
GRANT ALL ON public.cohort_benchmarks TO service_role;

ALTER TABLE public.cohort_benchmarks ENABLE ROW LEVEL SECURITY;

-- Members of a workspace within the program can read benchmarks for that program.
CREATE POLICY "Program members can read cohort benchmarks"
ON public.cohort_benchmarks FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.workspaces w
    JOIN public.workspace_users wu ON wu.workspace_id = w.id
    WHERE w.program_id = cohort_benchmarks.program_id
      AND wu.user_id = auth.uid()
      AND wu.active = true
  )
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'consultor')
);

-- 2. Schedule cron (daily at 04:00 UTC)
SELECT cron.schedule(
  'compute-cohort-benchmarks-daily',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/compute-cohort-benchmarks',
    headers := ('{"Content-Type": "application/json", "x-cron-secret": "' || current_setting('app.settings.cron_secret', true) || '"}')::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
