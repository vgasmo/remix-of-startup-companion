
CREATE TABLE public.bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  url text,
  route text,
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'normal' CHECK (severity IN ('low','normal','high','blocker')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','triaged','in_progress','resolved','wont_fix')),
  user_agent text,
  viewport text,
  console_errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  screenshot_paths text[] NOT NULL DEFAULT '{}'::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.bug_reports TO authenticated;
GRANT ALL ON public.bug_reports TO service_role;

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own bug reports"
  ON public.bug_reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own bug reports"
  ON public.bug_reports FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Staff can view all bug reports"
  ON public.bug_reports FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin','consultor','backoffice')
  ));

CREATE POLICY "Staff can update bug reports"
  ON public.bug_reports FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin','consultor','backoffice')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role IN ('admin','consultor','backoffice')
  ));

CREATE INDEX idx_bug_reports_user ON public.bug_reports(user_id, created_at DESC);
CREATE INDEX idx_bug_reports_status ON public.bug_reports(status, created_at DESC);
CREATE INDEX idx_bug_reports_workspace ON public.bug_reports(workspace_id) WHERE workspace_id IS NOT NULL;

CREATE TRIGGER trg_bug_reports_updated_at
  BEFORE UPDATE ON public.bug_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS on storage.objects for the screenshots bucket (bucket is created via tool).
CREATE POLICY "Users upload own bug screenshots"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'bug-report-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users read own bug screenshots"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'bug-report-screenshots'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND ur.role IN ('admin','consultor','backoffice')
      )
    )
  );

CREATE POLICY "Users delete own bug screenshots"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'bug-report-screenshots'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
