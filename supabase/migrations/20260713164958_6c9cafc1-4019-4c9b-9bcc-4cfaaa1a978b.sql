
-- Partial composite index: fast EXISTS check for overdue open actions per workspace
CREATE INDEX IF NOT EXISTS idx_action_items_workspace_due_open
  ON public.action_items (workspace_id, due_date)
  WHERE status IN ('pending','in_progress','awaiting_validation');

-- Drop old signature (adding parameters changes it)
DROP FUNCTION IF EXISTS public.search_workspaces_paged(text[], uuid, text, uuid, public.startup_stage, public.health_score, public.workspace_priority, text, int, int);

CREATE OR REPLACE FUNCTION public.search_workspaces_paged(
  _statuses text[] DEFAULT ARRAY['active'],
  _assigned_to uuid DEFAULT NULL,
  _search text DEFAULT NULL,
  _program_id uuid DEFAULT NULL,
  _stage public.startup_stage DEFAULT NULL,
  _health public.health_score DEFAULT NULL,
  _priority public.workspace_priority DEFAULT NULL,
  _sort_by text DEFAULT 'priority',
  _limit int DEFAULT 15,
  _offset int DEFAULT 0,
  _missing_kpi_this_month boolean DEFAULT false,
  _overdue_actions boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  startup_id uuid,
  program_id uuid,
  stage public.startup_stage,
  status text,
  health_score public.health_score,
  health_score_override public.health_score,
  priority_level public.workspace_priority,
  current_week int,
  updated_at timestamptz,
  created_at timestamptz,
  startup_name text,
  startup_logo_url text,
  startup_description text,
  program_name text,
  program_type text,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH assigned AS (
    SELECT w.id AS workspace_id
      FROM public.workspaces w
     WHERE _assigned_to IS NOT NULL
       AND (
         w.assigned_consultor_id = _assigned_to
         OR EXISTS (
           SELECT 1 FROM public.workspace_users wu
            WHERE wu.workspace_id = w.id AND wu.user_id = _assigned_to
              AND wu.role = 'consultor' AND wu.active = true
         )
       )
  ),
  base AS (
    SELECT w.id, w.startup_id, w.program_id, w.stage, w.status,
           w.health_score, w.health_score_override, w.priority_level,
           w.current_week, w.updated_at, w.created_at,
           s.name AS startup_name, s.logo_url AS startup_logo_url, s.description AS startup_description,
           p.name AS program_name, p.program_type
      FROM public.workspaces w
      LEFT JOIN public.startups s ON s.id = w.startup_id
      LEFT JOIN public.programs p ON p.id = w.program_id
     WHERE w.status = ANY(_statuses)
       AND (_assigned_to IS NULL OR w.id IN (SELECT workspace_id FROM assigned))
       AND (_search IS NULL OR _search = '' OR s.name ILIKE '%' || _search || '%')
       AND (_program_id IS NULL OR w.program_id = _program_id)
       AND (_stage IS NULL OR w.stage = _stage)
       AND (_health IS NULL OR w.health_score = _health OR w.health_score_override = _health)
       AND (_priority IS NULL OR w.priority_level = _priority)
       AND (
         NOT _missing_kpi_this_month
         OR NOT EXISTS (
           SELECT 1 FROM public.kpi_values kv
            WHERE kv.workspace_id = w.id
              AND date_trunc('month', kv.period_month) = date_trunc('month', CURRENT_DATE)
         )
       )
       AND (
         NOT _overdue_actions
         OR EXISTS (
           SELECT 1 FROM public.action_items ai
            WHERE ai.workspace_id = w.id
              AND ai.status IN ('pending','in_progress','awaiting_validation')
              AND ai.due_date IS NOT NULL
              AND ai.due_date < CURRENT_DATE
         )
       )
  ),
  counted AS (SELECT COUNT(*) AS n FROM base)
  SELECT b.id, b.startup_id, b.program_id, b.stage, b.status,
         b.health_score, b.health_score_override, b.priority_level,
         b.current_week, b.updated_at, b.created_at,
         b.startup_name, b.startup_logo_url, b.startup_description,
         b.program_name, b.program_type,
         (SELECT n FROM counted) AS total_count
    FROM base b
   ORDER BY
     CASE WHEN _sort_by = 'name' THEN b.startup_name END ASC,
     CASE WHEN _sort_by = 'priority' THEN
       CASE b.priority_level WHEN 'star' THEN 0 WHEN 'high' THEN 1 WHEN 'standard' THEN 2 WHEN 'maintenance' THEN 3 ELSE 9 END
     END ASC,
     CASE WHEN _sort_by = 'urgency' THEN
       CASE COALESCE(b.health_score_override::text, b.health_score::text, 'stable')
         WHEN 'critical' THEN 0 WHEN 'at_risk' THEN 1 WHEN 'stable' THEN 2 WHEN 'healthy' THEN 3 WHEN 'thriving' THEN 4 ELSE 9 END
     END ASC,
     CASE WHEN _sort_by IN ('updated','priority','name','urgency') THEN NULL ELSE b.updated_at END DESC,
     b.updated_at DESC
   LIMIT _limit OFFSET _offset;
$$;

GRANT EXECUTE ON FUNCTION public.search_workspaces_paged(text[], uuid, text, uuid, public.startup_stage, public.health_score, public.workspace_priority, text, int, int, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_workspaces_paged(text[], uuid, text, uuid, public.startup_stage, public.health_score, public.workspace_priority, text, int, int, boolean, boolean) TO service_role;
