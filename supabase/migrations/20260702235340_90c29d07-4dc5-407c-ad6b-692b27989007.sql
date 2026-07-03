ALTER TABLE public.checkin_instances
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_checkin_instances_review_pending
  ON public.checkin_instances (workspace_id)
  WHERE status = 'submitted' AND reviewed_at IS NULL;