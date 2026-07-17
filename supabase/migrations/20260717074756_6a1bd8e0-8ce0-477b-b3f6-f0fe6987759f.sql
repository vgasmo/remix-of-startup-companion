-- Perf: composite index for the hottest workspaces query
-- (WHERE status = ANY(...) ORDER BY updated_at DESC), which was
-- consuming 250s+ of DB time. Existing idx_workspaces_status is
-- partial-only on status; adding updated_at removes the sort step.
CREATE INDEX IF NOT EXISTS idx_workspaces_status_updated
  ON public.workspaces (status, updated_at DESC);