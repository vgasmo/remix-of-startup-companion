
ALTER TABLE public.communication_log
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_communication_log_not_archived
  ON public.communication_log (workspace_id, occurred_at DESC)
  WHERE archived_at IS NULL;
