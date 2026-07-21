CREATE OR REPLACE FUNCTION public.log_completed_session_atomic(
  p_command_id uuid,
  p_workspace_id uuid,
  p_title text,
  p_occurred_at timestamptz,
  p_actual_duration_minutes integer,
  p_primary_consultant_id uuid DEFAULT NULL,
  p_primary_mentor_id uuid DEFAULT NULL,
  p_session_type text DEFAULT 'general',
  p_source text DEFAULT 'off_platform',
  p_notes text DEFAULT NULL,
  p_decisions text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_attendance jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_is_staff boolean;
  v_is_consultor_assigned boolean;
  v_is_workspace_member boolean;
  v_is_mentor_of_workspace boolean;
  v_authorized boolean := false;
  v_existing_session_id uuid;
  v_session_id uuid;
  v_attendee jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_command_id IS NULL THEN
    RAISE EXCEPTION 'p_command_id required for idempotency' USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existing_session_id
  FROM public.sessions WHERE command_id = p_command_id;
  IF v_existing_session_id IS NOT NULL THEN
    RETURN jsonb_build_object('session_id', v_existing_session_id, 'idempotent', true);
  END IF;

  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id required' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_title),'') = '' THEN
    RAISE EXCEPTION 'title required' USING ERRCODE = '22023';
  END IF;
  IF p_occurred_at IS NULL OR p_occurred_at > now() THEN
    RAISE EXCEPTION 'occurred_at must be in the past' USING ERRCODE = '22023';
  END IF;
  IF p_actual_duration_minutes IS NULL
     OR p_actual_duration_minutes < 1
     OR p_actual_duration_minutes > 1440 THEN
    RAISE EXCEPTION 'actual_duration_minutes must be between 1 and 1440' USING ERRCODE = '22023';
  END IF;
  IF p_primary_consultant_id IS NULL AND p_primary_mentor_id IS NULL THEN
    RAISE EXCEPTION 'primary attribution required (consultant or mentor)' USING ERRCODE = '22023';
  END IF;
  IF p_source NOT IN ('off_platform','manual','mentor_booking') THEN
    RAISE EXCEPTION 'source % not allowed for completed-log command', p_source USING ERRCODE = '22023';
  END IF;

  v_is_staff := public.has_role(v_actor, 'admin'::app_role)
             OR public.has_role(v_actor, 'backoffice'::app_role);

  SELECT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = p_workspace_id AND assigned_consultor_id = v_actor
  ) INTO v_is_consultor_assigned;

  SELECT EXISTS (
    SELECT 1 FROM public.workspace_users
    WHERE workspace_id = p_workspace_id AND user_id = v_actor AND active = true
  ) INTO v_is_workspace_member;

  -- FIX: mentor_connections.status vocabulary is pending|accepted|declined.
  SELECT EXISTS (
    SELECT 1 FROM public.mentor_connections mc
    WHERE mc.mentor_id = v_actor
      AND mc.workspace_id = p_workspace_id
      AND mc.status = 'accepted'
  ) INTO v_is_mentor_of_workspace;

  v_authorized := v_is_staff
    OR v_is_workspace_member
    OR v_is_consultor_assigned
    OR (p_primary_mentor_id = v_actor AND v_is_mentor_of_workspace);

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'not authorized to log completed session for this workspace'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.sessions (
    workspace_id, title, scheduled_at, duration,
    notes, decisions, location,
    created_by, source, session_type, status,
    primary_consultant_id, outlook_sync_status,
    actual_duration_minutes, completed_at,
    command_id
  ) VALUES (
    p_workspace_id, p_title, p_occurred_at, p_actual_duration_minutes,
    p_notes, p_decisions, p_location,
    v_actor, p_source, coalesce(p_session_type,'general'), 'completed',
    p_primary_consultant_id, 'not_applicable',
    p_actual_duration_minutes, p_occurred_at,
    p_command_id
  )
  RETURNING id INTO v_session_id;

  IF jsonb_typeof(p_attendance) = 'array' THEN
    FOR v_attendee IN SELECT * FROM jsonb_array_elements(p_attendance)
    LOOP
      IF (v_attendee->>'user_id') IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.session_participants (
        session_id, user_id, role, attendance_status
      ) VALUES (
        v_session_id,
        (v_attendee->>'user_id')::uuid,
        coalesce(v_attendee->>'role','attendee'),
        coalesce(v_attendee->>'attendance_status','attended')
      )
      ON CONFLICT (session_id, user_id) DO UPDATE
        SET attendance_status = EXCLUDED.attendance_status,
            role = EXCLUDED.role;
    END LOOP;
  END IF;

  INSERT INTO public.tool_usage_events (
    user_id, workspace_id, tool, entity_type, entity_id, session_id, metadata
  ) VALUES (
    v_actor, p_workspace_id, 'sessions', 'session', v_session_id, v_session_id,
    jsonb_build_object(
      'event','session_completed',
      'source', p_source,
      'actual_duration_minutes', p_actual_duration_minutes,
      'via','log_completed_session_atomic'
    )
  );

  BEGIN
    INSERT INTO public.activity_log (
      workspace_id, user_id, action, entity_type, entity_id, metadata
    ) VALUES (
      p_workspace_id, v_actor, 'completed', 'session', v_session_id,
      jsonb_build_object('title', p_title, 'source', p_source)
    );
  EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
  END;

  RETURN jsonb_build_object('session_id', v_session_id, 'idempotent', false);
END;
$function$;