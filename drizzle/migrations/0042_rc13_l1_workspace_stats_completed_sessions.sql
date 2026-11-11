-- RC13 Lote 1 · 9 · get_workspace_stats: last session counts only 'completed', next session only 'scheduled'.
-- Idempotent. Aborts if the live definition diverges from the one read on 11 Nov 2026 (md5 f23f9063...).
DO $guard$
DECLARE v_md5 text; v_def text;
BEGIN
  SELECT md5(pg_get_functiondef(p.oid)), pg_get_functiondef(p.oid) INTO v_md5, v_def FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'get_workspace_stats'
     AND pg_get_function_identity_arguments(p.oid) = 'workspace_ids uuid[]';
  IF v_md5 IS DISTINCT FROM 'f23f90635ebaaef94170fcaf22d22729'
     AND position('s.status = ''completed''' in coalesce(v_def, '')) = 0 THEN
    RAISE EXCEPTION 'rc13: definição de public.get_workspace_stats divergente (md5 %)', v_md5;
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.get_workspace_stats(workspace_ids uuid[])
 RETURNS TABLE(workspace_id uuid, pending_actions_count integer, overdue_actions_count integer, has_current_month_kpi boolean, last_kpi_month date, next_meeting_date timestamp with time zone, last_session_id uuid, last_session_title text, last_session_scheduled_at timestamp with time zone, last_session_notes text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_month DATE := date_trunc('month', now())::date;
  today DATE := CURRENT_DATE;
  filtered_workspace_ids uuid[];
BEGIN
  -- SECURITY: Filter to only workspaces the user has access to
  SELECT ARRAY_AGG(w.id) INTO filtered_workspace_ids
  FROM unnest(workspace_ids) AS w(id)
  WHERE public.has_workspace_access(auth.uid(), w.id);
  
  -- If no accessible workspaces, return empty
  IF filtered_workspace_ids IS NULL OR array_length(filtered_workspace_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH action_counts AS (
    SELECT 
      ai.workspace_id,
      COUNT(*) FILTER (WHERE ai.status IN ('pending', 'in_progress')) AS pending_count,
      COUNT(*) FILTER (WHERE ai.status IN ('pending', 'in_progress') AND ai.due_date < today) AS overdue_count
    FROM action_items ai
    WHERE ai.workspace_id = ANY(filtered_workspace_ids)
      AND (ai.milestone_id IS NULL OR EXISTS (
        SELECT 1 FROM public.milestones m WHERE m.id = ai.milestone_id AND m.archived_at IS NULL
      ))
    GROUP BY ai.workspace_id
  ),
  kpi_data AS (
    SELECT DISTINCT ON (kv.workspace_id)
      kv.workspace_id,
      EXISTS (
        SELECT 1 FROM kpi_values kv2 
        WHERE kv2.workspace_id = kv.workspace_id 
        AND kv2.period_month = current_month
      ) AS has_current,
      kv.period_month AS last_month
    FROM kpi_values kv
    WHERE kv.workspace_id = ANY(filtered_workspace_ids)
    ORDER BY kv.workspace_id, kv.period_month DESC
  ),
  next_sessions AS (
    SELECT DISTINCT ON (s.workspace_id)
      s.workspace_id,
      s.scheduled_at
    FROM sessions s
    WHERE s.workspace_id = ANY(filtered_workspace_ids)
      AND s.status = 'scheduled'
      AND s.scheduled_at >= now()
    ORDER BY s.workspace_id, s.scheduled_at ASC
  ),
  last_sessions AS (
    SELECT DISTINCT ON (s.workspace_id)
      s.workspace_id,
      s.id,
      s.title,
      s.scheduled_at,
      s.notes
    FROM sessions s
    WHERE s.workspace_id = ANY(filtered_workspace_ids)
      AND s.status = 'completed'
      AND s.scheduled_at < now()
    ORDER BY s.workspace_id, s.scheduled_at DESC
  )
  SELECT 
    w.id AS workspace_id,
    COALESCE(ac.pending_count, 0)::INTEGER AS pending_actions_count,
    COALESCE(ac.overdue_count, 0)::INTEGER AS overdue_actions_count,
    COALESCE(kd.has_current, false) AS has_current_month_kpi,
    kd.last_month AS last_kpi_month,
    ns.scheduled_at AS next_meeting_date,
    ls.id AS last_session_id,
    ls.title AS last_session_title,
    ls.scheduled_at AS last_session_scheduled_at,
    ls.notes AS last_session_notes
  FROM unnest(filtered_workspace_ids) AS w(id)
  LEFT JOIN action_counts ac ON ac.workspace_id = w.id
  LEFT JOIN kpi_data kd ON kd.workspace_id = w.id
  LEFT JOIN next_sessions ns ON ns.workspace_id = w.id
  LEFT JOIN last_sessions ls ON ls.workspace_id = w.id;
END;
$function$;