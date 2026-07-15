
CREATE OR REPLACE FUNCTION public.get_mentor_impact(
  p_mentor_id uuid,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_from timestamptz;
  v_to timestamptz;
  v_sessions_attended int := 0;
  v_startups_supported int := 0;
  v_hours_logged numeric := 0;
  v_open_followups int := 0;
  v_avg_rating numeric;
  v_rating_count int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF v_caller <> p_mentor_id AND NOT public.has_role(v_caller, 'admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: cannot read another mentor''s impact' USING ERRCODE = '42501';
  END IF;

  v_from := COALESCE(p_from::timestamptz, '1970-01-01'::timestamptz);
  v_to := COALESCE((p_to + 1)::timestamptz, 'infinity'::timestamptz);

  SELECT COUNT(DISTINCT s.id)
    INTO v_sessions_attended
  FROM public.sessions s
  JOIN public.workspace_users wu
    ON wu.workspace_id = s.workspace_id
   AND wu.user_id = p_mentor_id
   AND wu.active = true
  WHERE s.scheduled_at >= v_from
    AND s.scheduled_at < v_to
    AND (
      s.scheduled_at < now()
      OR s.ai_summary IS NOT NULL
      OR (s.notes IS NOT NULL AND length(s.notes) > 0)
    );

  SELECT COUNT(DISTINCT wu.workspace_id)
    INTO v_startups_supported
  FROM public.workspace_users wu
  WHERE wu.user_id = p_mentor_id
    AND wu.active = true;

  SELECT COALESCE(SUM(te.hours), 0)
    INTO v_hours_logged
  FROM public.time_entries te
  WHERE te.user_id = p_mentor_id
    AND te.category = 'mentoring'
    AND (p_from IS NULL OR te.date >= p_from)
    AND (p_to IS NULL OR te.date <= p_to);

  -- FIX (N0): action_status enum has no 'todo'/'blocked' — use real values.
  SELECT COUNT(*)
    INTO v_open_followups
  FROM public.action_items ai
  WHERE ai.owner_user_id = p_mentor_id
    AND ai.status IN ('pending'::action_status, 'in_progress'::action_status);

  SELECT AVG(sf.rating)::numeric(10,2), COUNT(sf.rating)
    INTO v_avg_rating, v_rating_count
  FROM public.session_feedback sf
  JOIN public.sessions s ON s.id = sf.session_id
  JOIN public.workspace_users wu
    ON wu.workspace_id = s.workspace_id
   AND wu.user_id = p_mentor_id
   AND wu.active = true
  WHERE sf.rating IS NOT NULL
    AND s.scheduled_at >= v_from
    AND s.scheduled_at < v_to;

  RETURN jsonb_build_object(
    'mentor_id', p_mentor_id,
    'from', p_from,
    'to', p_to,
    'sessions_attended', v_sessions_attended,
    'startups_supported', v_startups_supported,
    'hours_logged', v_hours_logged,
    'open_followups', v_open_followups,
    'avg_rating', v_avg_rating,
    'rating_count', v_rating_count
  );
END;
$$;
