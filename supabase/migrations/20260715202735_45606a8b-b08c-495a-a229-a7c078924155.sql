
INSERT INTO public.system_settings(key, value, description, updated_at)
VALUES (
  'reconciler.write_mode',
  jsonb_build_object('enabled', false, 'reason', 'phase_0_freeze'),
  'Master kill-switch for reconciler-run commit path. Both this and RECONCILER_WRITE_MODE env must be enabled.',
  now()
)
ON CONFLICT (key) DO UPDATE
SET value = COALESCE(public.system_settings.value, '{}'::jsonb) || jsonb_build_object(
  'enabled', COALESCE((public.system_settings.value->>'enabled')::boolean, false)
),
    updated_at = now();

CREATE TABLE IF NOT EXISTS public.sessions_backfill_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  before_status text,
  before_completed_at timestamptz,
  before_actual_duration_minutes integer,
  planned_duration integer,
  scheduled_at timestamptz,
  workspace_id uuid,
  reason text NOT NULL DEFAULT 'unsafe_meeting_backfill_20260714',
  quarantined_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.sessions_backfill_quarantine TO authenticated;
GRANT ALL    ON public.sessions_backfill_quarantine TO service_role;
ALTER TABLE public.sessions_backfill_quarantine ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view backfill quarantine" ON public.sessions_backfill_quarantine;
CREATE POLICY "Admins can view backfill quarantine"
ON public.sessions_backfill_quarantine
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

WITH suspect AS (
  SELECT s.id, s.status, s.completed_at, s.actual_duration_minutes, s.duration, s.scheduled_at, s.workspace_id
  FROM public.sessions s
  WHERE s.status = 'completed'
    AND s.completed_at IS NOT NULL
    AND s.actual_duration_minutes IS NOT NULL
    AND s.duration IS NOT NULL
    AND s.actual_duration_minutes = s.duration
    AND NOT EXISTS (SELECT 1 FROM public.session_participants sp WHERE sp.session_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM public.session_transcripts st WHERE st.session_id = s.id)
    AND NOT EXISTS (SELECT 1 FROM public.session_feedback sf WHERE sf.session_id = s.id)
),
snap AS (
  INSERT INTO public.sessions_backfill_quarantine
    (session_id, before_status, before_completed_at, before_actual_duration_minutes, planned_duration, scheduled_at, workspace_id)
  SELECT id, status, completed_at, actual_duration_minutes, duration, scheduled_at, workspace_id
  FROM suspect
  RETURNING session_id
)
UPDATE public.sessions s
SET status = 'scheduled',
    completed_at = NULL,
    actual_duration_minutes = NULL,
    updated_at = now()
WHERE s.id IN (SELECT session_id FROM snap);

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
    count(*) FILTER (WHERE status='completed' AND actual_duration_minutes IS NULL),
    count(*) FILTER (WHERE primary_consultant_id IS NULL)
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

  SELECT count(*) INTO v_no_contact_30d
  FROM public.workspaces w
  WHERE (p_program_id IS NULL OR w.program_id = p_program_id)
    AND (p_service IS NULL OR w.service_classification = p_service)
    AND w.archived_at IS NULL
    AND w.status = 'active'
    AND NOT EXISTS (
      SELECT 1 FROM public.sessions sess
      WHERE sess.workspace_id = w.id
        AND sess.status='completed'
        AND sess.completed_at > now() - interval '30 days'
        AND (v_effective_consultant IS NULL OR sess.primary_consultant_id = v_effective_consultant)
    );

  v_completeness_pct := CASE
    WHEN coalesce(v_completed,0) = 0 THEN NULL
    ELSE round(100.0 * (1 - (coalesce(v_missing_duration,0)::numeric / NULLIF(v_completed,0)::numeric)), 1)
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
      'missing_duration', coalesce(v_missing_duration,0),
      'missing_consultant', coalesce(v_missing_consultant,0),
      'missing_participants', coalesce(v_missing_participants,0),
      'completeness_pct', v_completeness_pct
    )
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_impact_aggregates(date,date,uuid,uuid,uuid,text) TO authenticated;

DROP FUNCTION IF EXISTS public.reconcile_active_customer(jsonb, text, boolean);
