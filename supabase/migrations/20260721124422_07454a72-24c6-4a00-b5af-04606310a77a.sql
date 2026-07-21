
-- =============================================================================
-- Batch A — Session & Meeting Integrity (RC5 P0 rescue)
-- Forward-only. See docs/rc5/evidence-ledger.md for repro evidence.
-- =============================================================================

-- A2. Canonical session source vocabulary --------------------------------------
-- Enumerated by grepping every writer of sessions.source in src/** and
-- supabase/functions/**. Prior migration (20260721112523) omitted mentor_booking
-- and public_booking, breaking mentor acceptance.
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_source_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_source_check
  CHECK (source IS NULL OR source = ANY (ARRAY[
    'manual',
    'teams_import',
    'webhook',
    'off_platform',
    'mentor_booking',
    'public_booking',
    'voice',
    'completion_dialog',
    'transcript_import'
  ]));

COMMENT ON CONSTRAINT sessions_source_check ON public.sessions IS
  'RC5 Batch A2: canonical session origin vocabulary. Add new values here AND to docs/rc5/state-machines.md in the same PR.';

-- A1. Idempotency for session commands -----------------------------------------
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS command_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS sessions_command_id_uidx
  ON public.sessions(command_id)
  WHERE command_id IS NOT NULL;

-- A3. Linked session on mentor bookings ----------------------------------------
ALTER TABLE public.mentor_bookings
  ADD COLUMN IF NOT EXISTS linked_session_id uuid REFERENCES public.sessions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS mentor_bookings_linked_session_uidx
  ON public.mentor_bookings(linked_session_id)
  WHERE linked_session_id IS NOT NULL;

-- =============================================================================
-- A1. log_completed_session_atomic
--   One authorized, idempotent transaction that records a completed past
--   meeting. No Outlook sync. No 'session_scheduled' emission.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.log_completed_session_atomic(
  p_command_id uuid,
  p_workspace_id uuid,
  p_title text,
  p_occurred_at timestamptz,
  p_actual_duration_minutes int,
  p_primary_consultant_id uuid DEFAULT NULL,
  p_primary_mentor_id uuid DEFAULT NULL,
  p_session_type text DEFAULT 'general',
  p_source text DEFAULT 'off_platform',
  p_notes text DEFAULT NULL,
  p_decisions text DEFAULT NULL,
  p_location text DEFAULT NULL,
  p_attendance jsonb DEFAULT '[]'::jsonb  -- [{user_id, attendance_status, role}]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean;
  v_is_consultor boolean;
  v_is_workspace_member boolean;
  v_is_mentor_of_workspace boolean;
  v_authorized boolean := false;
  v_existing_session_id uuid;
  v_session_id uuid;
  v_attendee jsonb;
BEGIN
  -- ---- Authentication --------------------------------------------------------
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF p_command_id IS NULL THEN
    RAISE EXCEPTION 'p_command_id required for idempotency' USING ERRCODE = '22023';
  END IF;

  -- ---- Idempotency short-circuit ---------------------------------------------
  SELECT id INTO v_existing_session_id
  FROM public.sessions
  WHERE command_id = p_command_id;

  IF v_existing_session_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'session_id', v_existing_session_id,
      'idempotent', true
    );
  END IF;

  -- ---- Validation ------------------------------------------------------------
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id required' USING ERRCODE = '22023';
  END IF;
  IF p_occurred_at IS NULL OR p_occurred_at > now() THEN
    RAISE EXCEPTION 'occurred_at must be in the past' USING ERRCODE = '22023';
  END IF;
  IF p_actual_duration_minutes IS NULL
     OR p_actual_duration_minutes <= 0
     OR p_actual_duration_minutes > 1440 THEN
    RAISE EXCEPTION 'actual_duration_minutes must be between 1 and 1440' USING ERRCODE = '22023';
  END IF;
  IF p_primary_consultant_id IS NULL AND p_primary_mentor_id IS NULL THEN
    RAISE EXCEPTION 'primary attribution required (consultant or mentor)' USING ERRCODE = '22023';
  END IF;
  IF p_source NOT IN ('off_platform','manual','mentor_booking') THEN
    RAISE EXCEPTION 'source % not allowed for completed-log command', p_source USING ERRCODE = '22023';
  END IF;

  -- ---- Authorization ---------------------------------------------------------
  v_is_admin := public.has_role(v_actor, 'admin'::app_role)
             OR public.has_role(v_actor, 'staff'::app_role);
  v_is_consultor := public.has_role(v_actor, 'consultor'::app_role);

  SELECT EXISTS (
    SELECT 1 FROM public.workspace_users
    WHERE workspace_id = p_workspace_id AND user_id = v_actor AND status = 'active'
  ) INTO v_is_workspace_member;

  SELECT EXISTS (
    SELECT 1 FROM public.mentor_connections mc
    WHERE mc.mentor_id = v_actor
      AND mc.workspace_id = p_workspace_id
      AND mc.status = 'active'
  ) INTO v_is_mentor_of_workspace;

  v_authorized := v_is_admin
    OR v_is_workspace_member
    OR (v_is_consultor AND EXISTS (
          SELECT 1 FROM public.workspaces
          WHERE id = p_workspace_id AND assigned_consultor_id = v_actor
       ))
    OR (p_primary_mentor_id = v_actor AND v_is_mentor_of_workspace);

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'not authorized to log completed session for this workspace'
      USING ERRCODE = '42501';
  END IF;

  -- ---- Insert session --------------------------------------------------------
  INSERT INTO public.sessions (
    workspace_id, title, scheduled_at, duration,
    notes, decisions, location,
    created_by, source, session_type, status,
    primary_consultant_id, outlook_sync_status,
    actual_duration_minutes,
    command_id
  ) VALUES (
    p_workspace_id, p_title, p_occurred_at, p_actual_duration_minutes,
    p_notes, p_decisions, p_location,
    v_actor, p_source, coalesce(p_session_type, 'general'), 'completed',
    p_primary_consultant_id, 'not_applicable',
    p_actual_duration_minutes,
    p_command_id
  )
  RETURNING id INTO v_session_id;

  -- ---- Participant attendance upserts ----------------------------------------
  IF jsonb_typeof(p_attendance) = 'array' THEN
    FOR v_attendee IN SELECT * FROM jsonb_array_elements(p_attendance)
    LOOP
      IF (v_attendee->>'user_id') IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.session_participants (
        session_id, user_id, role, attendance_status
      ) VALUES (
        v_session_id,
        (v_attendee->>'user_id')::uuid,
        coalesce(v_attendee->>'role', 'attendee'),
        coalesce(v_attendee->>'attendance_status', 'attended')
      )
      ON CONFLICT (session_id, user_id) DO UPDATE
        SET attendance_status = EXCLUDED.attendance_status,
            role = EXCLUDED.role;
    END LOOP;
  END IF;

  -- ---- Canonical completion event --------------------------------------------
  BEGIN
    INSERT INTO public.tool_usage_events (
      user_id, workspace_id, tool_key, event_type, metadata
    ) VALUES (
      v_actor, p_workspace_id, 'sessions', 'session_completed',
      jsonb_build_object(
        'session_id', v_session_id,
        'source', p_source,
        'actual_duration_minutes', p_actual_duration_minutes,
        'via', 'log_completed_session_atomic'
      )
    );
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    INSERT INTO public.activity_log (
      workspace_id, user_id, action, entity_type, entity_id, metadata
    ) VALUES (
      p_workspace_id, v_actor, 'completed', 'session', v_session_id,
      jsonb_build_object('title', p_title, 'source', p_source)
    );
  EXCEPTION WHEN undefined_column OR undefined_table THEN NULL;
  END;

  RETURN jsonb_build_object(
    'session_id', v_session_id,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_completed_session_atomic(
  uuid, uuid, text, timestamptz, int, uuid, uuid, text, text, text, text, text, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_completed_session_atomic(
  uuid, uuid, text, timestamptz, int, uuid, uuid, text, text, text, text, text, jsonb
) TO authenticated, service_role;

COMMENT ON FUNCTION public.log_completed_session_atomic(
  uuid, uuid, text, timestamptz, int, uuid, uuid, text, text, text, text, text, jsonb
) IS
  'RC5 A1: atomic, authorized, idempotent recording of a past completed meeting. Never enqueues Outlook/Teams sync. Returns the same session_id on retry with the same p_command_id.';


-- =============================================================================
-- A3. mentor_transition_booking — store linked_session_id + acceptance idempotency
-- =============================================================================
CREATE OR REPLACE FUNCTION public.mentor_transition_booking(
  p_booking_id uuid,
  p_target_state text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_booking record;
  v_is_admin boolean;
  v_is_mentor boolean;
  v_is_founder boolean;
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_duration_min int;
  v_session_id uuid;
  v_overlap_count int;
  v_allowed boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF p_target_state NOT IN ('accepted','declined','cancelled','completed') THEN
    RAISE EXCEPTION 'invalid target state: %', p_target_state USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking
  FROM public.mentor_bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found' USING ERRCODE = 'P0002';
  END IF;

  -- A3 idempotency: accept twice returns the same linked session.
  IF p_target_state = 'accepted'
     AND v_booking.status = 'accepted'
     AND v_booking.linked_session_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'booking_id', v_booking.id,
      'status', 'accepted',
      'session_id', v_booking.linked_session_id,
      'actor', v_actor,
      'idempotent', true
    );
  END IF;

  v_is_admin  := public.has_role(v_actor, 'admin'::app_role);
  v_is_mentor := (v_booking.mentor_id = v_actor);
  v_is_founder := (v_booking.founder_id = v_actor);

  CASE p_target_state
    WHEN 'accepted' THEN
      v_allowed := (v_is_mentor OR v_is_admin) AND v_booking.status = 'pending';
    WHEN 'declined' THEN
      v_allowed := (v_is_mentor OR v_is_admin) AND v_booking.status = 'pending';
    WHEN 'cancelled' THEN
      v_allowed := (v_is_mentor OR v_is_founder OR v_is_admin)
                   AND v_booking.status IN ('pending','accepted');
    WHEN 'completed' THEN
      v_allowed := (v_is_mentor OR v_is_admin) AND v_booking.status = 'accepted';
  END CASE;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'transition % not allowed from %', p_target_state, v_booking.status
      USING ERRCODE = '42501';
  END IF;

  IF p_target_state = 'accepted' THEN
    SELECT count(*) INTO v_overlap_count
    FROM public.mentor_bookings mb
    WHERE mb.mentor_id = v_booking.mentor_id
      AND mb.id <> v_booking.id
      AND mb.status = 'accepted'
      AND mb.requested_date = v_booking.requested_date
      AND mb.requested_start_time < v_booking.requested_end_time
      AND mb.requested_end_time   > v_booking.requested_start_time;

    IF v_overlap_count > 0 THEN
      RAISE EXCEPTION 'overlap: mentor already has an accepted booking overlapping this slot'
        USING ERRCODE = '40001';
    END IF;

    v_start_ts := ((v_booking.requested_date::text || ' ' || v_booking.requested_start_time::text)
                    ::timestamp AT TIME ZONE 'Europe/Lisbon');
    v_end_ts   := ((v_booking.requested_date::text || ' ' || v_booking.requested_end_time::text)
                    ::timestamp AT TIME ZONE 'Europe/Lisbon');
    v_duration_min := GREATEST(15, (EXTRACT(EPOCH FROM (v_end_ts - v_start_ts))/60)::int);

    IF v_booking.workspace_id IS NOT NULL THEN
      INSERT INTO public.sessions (
        workspace_id, title, scheduled_at, duration,
        created_by, source, session_type, status
      )
      VALUES (
        v_booking.workspace_id,
        'Sessão de mentoria',
        v_start_ts,
        v_duration_min,
        v_booking.mentor_id,
        'mentor_booking',
        'mentoring',
        'scheduled'
      )
      RETURNING id INTO v_session_id;
    END IF;
  END IF;

  UPDATE public.mentor_bookings
     SET status = p_target_state,
         linked_session_id = COALESCE(v_session_id, linked_session_id),
         updated_at = now()
   WHERE id = v_booking.id;

  RETURN jsonb_build_object(
    'booking_id', v_booking.id,
    'status', p_target_state,
    'session_id', COALESCE(v_session_id, v_booking.linked_session_id),
    'actor', v_actor,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mentor_transition_booking(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mentor_transition_booking(uuid, text) TO authenticated, service_role;
