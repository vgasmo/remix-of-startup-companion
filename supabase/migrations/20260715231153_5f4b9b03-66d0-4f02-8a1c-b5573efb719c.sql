-- Release-hardening Phase 6: truthful impact aggregates
DROP FUNCTION IF EXISTS public.get_impact_aggregates(date, date, uuid, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.get_impact_aggregates(
  p_date_from date,
  p_date_to date,
  p_consultant_id uuid DEFAULT NULL,
  p_startup_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL,
  p_service text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_is_admin boolean;
  v_is_consultor boolean;
  v_effective_consultant uuid;
  v_completed integer; v_scheduled integer; v_cancelled integer; v_no_show integer;
  v_meeting_hours numeric; v_manual_hours numeric;
  v_startups_supported integer;
  v_avg_duration numeric;
  v_missing_duration integer; v_missing_consultant integer; v_missing_participants integer;
  v_complete_sessions integer;
  v_no_contact_30d integer;
  v_completeness_pct numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  v_is_admin := public.has_role(v_uid,'admin');
  v_is_consultor := public.has_role(v_uid,'consultor');
  IF NOT (v_is_admin OR v_is_consultor) THEN RAISE EXCEPTION 'forbidden'; END IF;

  IF v_is_admin THEN
    v_effective_consultant := p_consultant_id;
  ELSE
    v_effective_consultant := v_uid;
  END IF;

  WITH s AS (
    SELECT sess.*
    FROM public.sessions sess
    LEFT JOIN public.workspaces w ON w.id = sess.workspace_id
    WHERE sess.scheduled_at::date BETWEEN p_date_from AND p_date_to
      AND (v_effective_consultant IS NULL OR sess.primary_consultant_id = v_effective_consultant)
      AND (p_startup_id IS NULL OR w.startup_id = p_startup_id)
      AND (p_program_id IS NULL OR w.program_id = p_program_id)
      AND (p_service IS NULL OR w.service_classification = p_service)
  )
  SELECT
    count(*) FILTER (WHERE status='completed'),
    count(*) FILTER (WHERE status='scheduled'),
    count(*) FILTER (WHERE status='cancelled'),
    count(*) FILTER (WHERE status='no_show'),
    coalesce(sum(actual_duration_minutes) FILTER (WHERE status='completed'),0)/60.0,
    avg(actual_duration_minutes) FILTER (WHERE status='completed' AND actual_duration_minutes IS NOT NULL),
    count(*) FILTER (WHERE status='completed' AND (actual_duration_minutes IS NULL OR actual_duration_minutes <= 0)),
    count(*) FILTER (WHERE status='completed' AND primary_consultant_id IS NULL)
  INTO v_completed, v_scheduled, v_cancelled, v_no_show,
       v_meeting_hours, v_avg_duration, v_missing_duration, v_missing_consultant
  FROM s;

  SELECT count(DISTINCT sess.workspace_id) INTO v_startups_supported
  FROM public.sessions sess
  LEFT JOIN public.workspaces w ON w.id = sess.workspace_id
  WHERE sess.scheduled_at::date BETWEEN p_date_from AND p_date_to
    AND sess.status='completed'
    AND (v_effective_consultant IS NULL OR sess.primary_consultant_id = v_effective_consultant)
    AND (p_startup_id IS NULL OR w.startup_id = p_startup_id)
    AND (p_program_id IS NULL OR w.program_id = p_program_id)
    AND (p_service IS NULL OR w.service_classification = p_service);

  SELECT coalesce(sum(hours),0) INTO v_manual_hours
  FROM public.time_entries te
  LEFT JOIN public.workspaces w ON w.id = te.workspace_id
  WHERE te.date BETWEEN p_date_from AND p_date_to
    AND te.session_id IS NULL
    AND (v_effective_consultant IS NULL OR te.user_id = v_effective_consultant)
    AND (p_startup_id IS NULL OR w.startup_id = p_startup_id)
    AND (p_program_id IS NULL OR w.program_id = p_program_id)
    AND (p_service IS NULL OR w.service_classification = p_service);

  SELECT count(*) INTO v_missing_participants
  FROM public.sessions sess
  LEFT JOIN public.workspaces w ON w.id = sess.workspace_id
  WHERE sess.scheduled_at::date BETWEEN p_date_from AND p_date_to
    AND sess.status='completed'
    AND (v_effective_consultant IS NULL OR sess.primary_consultant_id = v_effective_consultant)
    AND (p_startup_id IS NULL OR w.startup_id = p_startup_id)
    AND (p_program_id IS NULL OR w.program_id = p_program_id)
    AND (p_service IS NULL OR w.service_classification = p_service)
    AND NOT EXISTS (SELECT 1 FROM public.session_participants sp WHERE sp.session_id = sess.id);

  -- Documented completeness: duration>0 AND consultant NOT NULL AND >=1 participant.
  SELECT count(*) INTO v_complete_sessions
  FROM public.sessions sess
  LEFT JOIN public.workspaces w ON w.id = sess.workspace_id
  WHERE sess.scheduled_at::date BETWEEN p_date_from AND p_date_to
    AND sess.status='completed'
    AND sess.actual_duration_minutes IS NOT NULL
    AND sess.actual_duration_minutes > 0
    AND sess.primary_consultant_id IS NOT NULL
    AND (v_effective_consultant IS NULL OR sess.primary_consultant_id = v_effective_consultant)
    AND (p_startup_id IS NULL OR w.startup_id = p_startup_id)
    AND (p_program_id IS NULL OR w.program_id = p_program_id)
    AND (p_service IS NULL OR w.service_classification = p_service)
    AND EXISTS (SELECT 1 FROM public.session_participants sp WHERE sp.session_id = sess.id);

  -- No-contact 30d: workspaces the caller can actually see.
  -- Admins: filter by optional p_consultant_id.
  -- Consultants: strictly workspace_assignments for the caller.
  SELECT count(*) INTO v_no_contact_30d
  FROM public.workspaces w
  WHERE (p_program_id IS NULL OR w.program_id = p_program_id)
    AND (p_service IS NULL OR w.service_classification = p_service)
    AND w.archived_at IS NULL
    AND w.status = 'active'
    AND (
      v_is_admin OR EXISTS (
        SELECT 1 FROM public.workspace_assignments wa
        WHERE wa.workspace_id = w.id AND wa.assigned_user_id = v_uid
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.sessions sess
      WHERE sess.workspace_id = w.id
        AND sess.status='completed'
        AND sess.completed_at > now() - interval '30 days'
        AND (v_effective_consultant IS NULL OR sess.primary_consultant_id = v_effective_consultant)
    );

  v_completeness_pct := CASE
    WHEN coalesce(v_completed,0) = 0 THEN NULL
    ELSE round(100.0 * (coalesce(v_complete_sessions,0)::numeric / NULLIF(v_completed,0)::numeric), 1)
  END;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('from', p_date_from, 'to', p_date_to),
    'meetings', jsonb_build_object(
      'completed', coalesce(v_completed,0),
      'scheduled', coalesce(v_scheduled,0),
      'cancelled', coalesce(v_cancelled,0),
      'no_show',   coalesce(v_no_show,0)
    ),
    'hours', jsonb_build_object(
      'meeting', round(coalesce(v_meeting_hours,0)::numeric, 2),
      'manual',  round(coalesce(v_manual_hours,0)::numeric, 2)
    ),
    'startups', jsonb_build_object('supported', coalesce(v_startups_supported,0)),
    'avg_duration', round(coalesce(v_avg_duration,0)::numeric, 1),
    'no_contact_30d', coalesce(v_no_contact_30d,0),
    'data_completeness', jsonb_build_object(
      'complete_sessions', coalesce(v_complete_sessions,0),
      'missing_duration', coalesce(v_missing_duration,0),
      'missing_consultant', coalesce(v_missing_consultant,0),
      'missing_participants', coalesce(v_missing_participants,0),
      'completeness_pct', v_completeness_pct
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_impact_aggregates(date,date,uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_impact_aggregates(date,date,uuid,uuid,uuid,text) TO authenticated;

-- Supporting indexes for scale (idempotent).
CREATE INDEX IF NOT EXISTS idx_sessions_status_scheduled_at
  ON public.sessions (status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_sessions_primary_consultant
  ON public.sessions (primary_consultant_id) WHERE primary_consultant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_session_participants_session
  ON public.session_participants (session_id);
CREATE INDEX IF NOT EXISTS idx_workspace_assignments_user
  ON public.workspace_assignments (assigned_user_id, workspace_id);