DO $migration$
DECLARE
  stats_target regprocedure := 'public.get_workspace_stats(uuid[])'::regprocedure;
  search_target regprocedure := 'public.search_workspaces_paged(text[],uuid,text,uuid,public.startup_stage,public.health_score,public.workspace_priority,text,integer,integer,boolean,boolean)'::regprocedure;
  definition text;
BEGIN
  SELECT pg_get_functiondef(stats_target) INTO definition;
  IF position('WHERE ai.workspace_id = ANY(filtered_workspace_ids)' in definition) = 0 THEN RAISE EXCEPTION 'Unexpected workspace stats definition'; END IF;
  definition := replace(definition, 'WHERE ai.workspace_id = ANY(filtered_workspace_ids)', 'WHERE ai.workspace_id = ANY(filtered_workspace_ids)
      AND (ai.milestone_id IS NULL OR EXISTS (
        SELECT 1 FROM public.milestones m WHERE m.id = ai.milestone_id AND m.archived_at IS NULL
      ))');
  EXECUTE definition;
  SELECT pg_get_functiondef(search_target) INTO definition;
  IF position('WHERE ai.workspace_id = w.id' in definition) = 0 THEN RAISE EXCEPTION 'Unexpected workspace search definition'; END IF;
  definition := replace(definition, 'WHERE ai.workspace_id = w.id', 'WHERE ai.workspace_id = w.id
              AND (ai.milestone_id IS NULL OR EXISTS (
                SELECT 1 FROM public.milestones m WHERE m.id = ai.milestone_id AND m.archived_at IS NULL
              ))');
  EXECUTE definition;
END;
$migration$;
COMMENT ON FUNCTION public.get_workspace_stats(uuid[]) IS 'Operational action counts exclude archived milestones; data preserved, permission filtering unchanged.';