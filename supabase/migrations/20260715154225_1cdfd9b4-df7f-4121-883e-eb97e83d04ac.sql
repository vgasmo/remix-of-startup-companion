
-- =========================================================
-- Phase 2 — Meeting & Impact Truth
-- =========================================================

-- 1) Extend sessions with authoritative status + duration
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','completed','cancelled','no_show')),
  ADD COLUMN IF NOT EXISTS actual_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_template_id uuid,
  ADD COLUMN IF NOT EXISTS primary_consultant_id uuid;

CREATE INDEX IF NOT EXISTS idx_sessions_status ON public.sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_completed_at ON public.sessions(completed_at);
CREATE INDEX IF NOT EXISTS idx_sessions_primary_consultant ON public.sessions(primary_consultant_id);

-- 2) session_participants
CREATE TABLE IF NOT EXISTS public.session_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role text,
  attendance_status text NOT NULL DEFAULT 'invited'
    CHECK (attendance_status IN ('invited','attended','absent','excused','unknown')),
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_participants TO authenticated;
GRANT ALL ON public.session_participants TO service_role;

ALTER TABLE public.session_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "session_participants read"
  ON public.session_participants FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'consultor')
    OR EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_participants.session_id
        AND public.has_workspace_access(s.workspace_id)
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "session_participants staff write"
  ON public.session_participants FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'consultor'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'consultor'));

CREATE INDEX IF NOT EXISTS idx_session_participants_session ON public.session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_user ON public.session_participants(user_id);

-- 3) tool_usage_events
CREATE TABLE IF NOT EXISTS public.tool_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool text NOT NULL,
  entity_type text,
  entity_id uuid,
  workspace_id uuid,
  user_id uuid NOT NULL,
  session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT, INSERT ON public.tool_usage_events TO authenticated;
GRANT ALL ON public.tool_usage_events TO service_role;

ALTER TABLE public.tool_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tool_usage_events insert self"
  ON public.tool_usage_events FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "tool_usage_events read"
  ON public.tool_usage_events FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'consultor')
    OR user_id = auth.uid()
    OR (workspace_id IS NOT NULL AND public.has_workspace_access(workspace_id))
  );

CREATE INDEX IF NOT EXISTS idx_tool_usage_workspace ON public.tool_usage_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tool_usage_user ON public.tool_usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_tool_usage_tool ON public.tool_usage_events(tool);
CREATE INDEX IF NOT EXISTS idx_tool_usage_occurred ON public.tool_usage_events(occurred_at);

-- 4) time_entries → optional session link (for de-dup)
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_session ON public.time_entries(session_id);

-- 5) get_impact_aggregates
CREATE OR REPLACE FUNCTION public.get_impact_aggregates(
  p_date_from date,
  p_date_to date,
  p_consultant_id uuid DEFAULT NULL,
  p_startup_id uuid DEFAULT NULL,
  p_programme_id uuid DEFAULT NULL,
  p_service text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_staff boolean;
  v_result jsonb;
  v_completed integer;
  v_scheduled integer;
  v_cancelled integer;
  v_no_show integer;
  v_meeting_hours numeric;
  v_manual_hours numeric;
  v_startups_supported integer;
  v_avg_duration numeric;
  v_missing_duration integer;
  v_missing_consultant integer;
  v_missing_participants integer;
  v_no_contact_30d integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  v_is_staff := public.has_role(v_uid,'admin') OR public.has_role(v_uid,'consultor');
  IF NOT v_is_staff THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH s AS (
    SELECT sess.*
    FROM public.sessions sess
    LEFT JOIN public.workspaces w ON w.id = sess.workspace_id
    WHERE sess.scheduled_at::date BETWEEN p_date_from AND p_date_to
      AND (p_consultant_id IS NULL OR sess.primary_consultant_id = p_consultant_id)
      AND (p_startup_id IS NULL OR w.startup_id = p_startup_id)
      AND (p_programme_id IS NULL OR w.programme_id = p_programme_id)
      AND (p_service IS NULL OR w.service_classification = p_service)
  )
  SELECT
    count(*) FILTER (WHERE status='completed'),
    count(*) FILTER (WHERE status='scheduled'),
    count(*) FILTER (WHERE status='cancelled'),
    count(*) FILTER (WHERE status='no_show'),
    coalesce(sum(actual_duration_minutes) FILTER (WHERE status='completed'),0)/60.0,
    avg(actual_duration_minutes) FILTER (WHERE status='completed' AND actual_duration_minutes IS NOT NULL),
    count(*) FILTER (WHERE status='completed' AND actual_duration_minutes IS NULL),
    count(*) FILTER (WHERE primary_consultant_id IS NULL)
  INTO v_completed, v_scheduled, v_cancelled, v_no_show,
       v_meeting_hours, v_avg_duration, v_missing_duration, v_missing_consultant
  FROM s;

  SELECT count(DISTINCT sess.workspace_id)
    INTO v_startups_supported
  FROM public.sessions sess
  LEFT JOIN public.workspaces w ON w.id = sess.workspace_id
  WHERE sess.scheduled_at::date BETWEEN p_date_from AND p_date_to
    AND sess.status='completed'
    AND (p_consultant_id IS NULL OR sess.primary_consultant_id = p_consultant_id)
    AND (p_startup_id IS NULL OR w.startup_id = p_startup_id)
    AND (p_programme_id IS NULL OR w.programme_id = p_programme_id)
    AND (p_service IS NULL OR w.service_classification = p_service);

  SELECT coalesce(sum(hours),0) INTO v_manual_hours
  FROM public.time_entries te
  LEFT JOIN public.workspaces w ON w.id = te.workspace_id
  WHERE te.date BETWEEN p_date_from AND p_date_to
    AND te.session_id IS NULL
    AND (p_consultant_id IS NULL OR te.user_id = p_consultant_id)
    AND (p_startup_id IS NULL OR w.startup_id = p_startup_id)
    AND (p_programme_id IS NULL OR w.programme_id = p_programme_id)
    AND (p_service IS NULL OR w.service_classification = p_service);

  SELECT count(*) INTO v_missing_participants
  FROM public.sessions sess
  WHERE sess.scheduled_at::date BETWEEN p_date_from AND p_date_to
    AND sess.status='completed'
    AND NOT EXISTS (SELECT 1 FROM public.session_participants sp WHERE sp.session_id = sess.id);

  SELECT count(*) INTO v_no_contact_30d
  FROM public.workspaces w
  WHERE (p_programme_id IS NULL OR w.programme_id = p_programme_id)
    AND (p_service IS NULL OR w.service_classification = p_service)
    AND NOT EXISTS (
      SELECT 1 FROM public.sessions sess
      WHERE sess.workspace_id = w.id
        AND sess.status='completed'
        AND sess.completed_at > now() - interval '30 days'
    );

  v_result := jsonb_build_object(
    'period', jsonb_build_object('from', p_date_from, 'to', p_date_to),
    'meetings_completed', coalesce(v_completed,0),
    'meetings_scheduled', coalesce(v_scheduled,0),
    'meetings_cancelled', coalesce(v_cancelled,0),
    'meetings_no_show', coalesce(v_no_show,0),
    'meeting_hours', round(coalesce(v_meeting_hours,0)::numeric, 2),
    'manual_hours', round(coalesce(v_manual_hours,0)::numeric, 2),
    'startups_supported', coalesce(v_startups_supported,0),
    'avg_duration_minutes', round(coalesce(v_avg_duration,0)::numeric, 1),
    'no_contact_30d', coalesce(v_no_contact_30d,0),
    'data_completeness', jsonb_build_object(
      'sessions_missing_duration', coalesce(v_missing_duration,0),
      'sessions_missing_consultant', coalesce(v_missing_consultant,0),
      'sessions_missing_participants', coalesce(v_missing_participants,0)
    )
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_impact_aggregates(date,date,uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_impact_aggregates(date,date,uuid,uuid,uuid,text) TO authenticated;

-- 6) get_tool_adoption
CREATE OR REPLACE FUNCTION public.get_tool_adoption(
  p_date_from date,
  p_date_to date,
  p_workspace_id uuid DEFAULT NULL,
  p_user_id uuid DEFAULT NULL,
  p_tool text DEFAULT NULL
) RETURNS TABLE (
  tool text,
  entity_type text,
  workspace_id uuid,
  event_count bigint,
  distinct_users bigint,
  last_used_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  IF NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'consultor')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    e.tool,
    e.entity_type,
    e.workspace_id,
    count(*)::bigint AS event_count,
    count(DISTINCT e.user_id)::bigint AS distinct_users,
    max(e.occurred_at) AS last_used_at
  FROM public.tool_usage_events e
  WHERE e.occurred_at::date BETWEEN p_date_from AND p_date_to
    AND (p_workspace_id IS NULL OR e.workspace_id = p_workspace_id)
    AND (p_user_id IS NULL OR e.user_id = p_user_id)
    AND (p_tool IS NULL OR e.tool = p_tool)
  GROUP BY e.tool, e.entity_type, e.workspace_id
  ORDER BY event_count DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_tool_adoption(date,date,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_tool_adoption(date,date,uuid,uuid,text) TO authenticated;

-- 7) Conservative backfill: mark sessions in the past with status='scheduled'
--    as 'completed' ONLY where legacy `duration` is set and completed_at unknown.
--    Attendance is NOT inferred; participants stay empty until explicit evidence exists.
UPDATE public.sessions
SET status = 'completed',
    completed_at = scheduled_at + make_interval(mins => coalesce(duration, 0)),
    actual_duration_minutes = duration
WHERE status = 'scheduled'
  AND scheduled_at < now() - interval '1 day'
  AND duration IS NOT NULL
  AND duration > 0
  AND completed_at IS NULL;
