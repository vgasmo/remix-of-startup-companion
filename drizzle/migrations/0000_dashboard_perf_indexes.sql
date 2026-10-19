CREATE INDEX IF NOT EXISTS idx_workspaces_status_updated ON public.workspaces (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspaces_status_created ON public.workspaces (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspaces_assigned_consultor ON public.workspaces (assigned_consultor_id);
CREATE INDEX IF NOT EXISTS idx_action_items_overdue_open ON public.action_items (workspace_id, due_date) WHERE status IN ('pending','in_progress');
CREATE INDEX IF NOT EXISTS idx_funnel_items_contact_email ON public.funnel_items (contact_email);
CREATE INDEX IF NOT EXISTS idx_action_items_title_trgm ON public.action_items USING gin (title gin_trgm_ops);