DO $migration$
DECLARE
  target regprocedure := 'public.search_workspaces_paged(text[],uuid,text,uuid,public.startup_stage,public.health_score,public.workspace_priority,text,integer,integer,boolean,boolean)'::regprocedure;
  definition text;
  old_assignment text := 'w.assigned_consultor_id = _assigned_to
         OR EXISTS (
           SELECT 1 FROM public.workspace_users wu
            WHERE wu.workspace_id = w.id AND wu.user_id = _assigned_to
              AND wu.role = ''consultor'' AND wu.active = true
         )';
BEGIN
  SELECT pg_get_functiondef(target) INTO definition;
  IF position(old_assignment in definition) = 0 OR position('ai.status IN (''pending'',''in_progress'',''awaiting_validation'')' in definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected search_workspaces_paged definition; no changes applied';
  END IF;
  definition := replace(definition, old_assignment, 'w.assigned_consultor_id = _assigned_to');
  definition := replace(definition, 'ai.status IN (''pending'',''in_progress'',''awaiting_validation'')', 'ai.status IN (''pending'',''in_progress'')');
  EXECUTE definition;
END;
$migration$;
COMMENT ON FUNCTION public.search_workspaces_paged(text[],uuid,text,uuid,public.startup_stage,public.health_score,public.workspace_priority,text,integer,integer,boolean,boolean) IS 'Assigned-only lists use primary consultant assignment; overdue means pending/in_progress before today, separate from awaiting_validation. Existing invoker security and grants preserved.';