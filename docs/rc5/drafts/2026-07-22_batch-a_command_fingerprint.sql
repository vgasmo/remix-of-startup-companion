-- RC5 Batch A — command fingerprint binding for log_completed_session_atomic.
-- Forward-only. Binds command identity to (actor, workspace, canonical payload
-- hash) so that a same-command replay with mismatched actor/workspace/payload
-- is rejected with 42501 BEFORE any information about the existing row is
-- disclosed. Idempotent replay by the same actor with the same payload
-- continues to return the existing session_id.

-- 1. Column + unique index. Column is nullable so existing rows survive.
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS command_fingerprint text;

CREATE UNIQUE INDEX IF NOT EXISTS ux_sessions_command_identity
  ON public.sessions(command_id)
  WHERE command_id IS NOT NULL;

-- 2. Canonical fingerprint helper: pure function of the caller-visible payload.
--    Uses digest() from pgcrypto (already installed on Supabase).
CREATE OR REPLACE FUNCTION public.rc5_session_command_fingerprint(
  p_actor uuid,
  p_workspace_id uuid,
  p_title text,
  p_occurred_at timestamptz,
  p_actual_duration_minutes integer,
  p_primary_consultant_id uuid,
  p_primary_mentor_id uuid,
  p_session_type text,
  p_source text,
  p_attendance jsonb
) RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT encode(
    digest(
      coalesce(p_actor::text,'') || '|' ||
      coalesce(p_workspace_id::text,'') || '|' ||
      coalesce(btrim(p_title),'') || '|' ||
      coalesce(to_char(p_occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS'),'') || '|' ||
      coalesce(p_actual_duration_minutes::text,'') || '|' ||
      coalesce(p_primary_consultant_id::text,'') || '|' ||
      coalesce(p_primary_mentor_id::text,'') || '|' ||
      coalesce(p_session_type,'general') || '|' ||
      coalesce(p_source,'off_platform') || '|' ||
      coalesce((
        SELECT string_agg(
          coalesce(x->>'user_id','') || ':' ||
          coalesce(x->>'role','attendee') || ':' ||
          coalesce(x->>'attendance_status','attended'),
          ','
          ORDER BY coalesce(x->>'user_id','')
        )
        FROM jsonb_array_elements(coalesce(p_attendance,'[]'::jsonb)) x
      ),''),
      'sha256'
    ),
    'hex'
  );
$$;

-- 3. Update RPC to compute the fingerprint, reject mismatches BEFORE
--    revealing the replay result, and persist the fingerprint on insert.
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
  p_attendance jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_staff boolean;
  v_is_consultor boolean;
  v_is_declared_primary boolean;
  v_existing_id uuid;
  v_existing_actor uuid;
  v_existing_ws uuid;
  v_existing_fp text;
  v_session_id uuid;
  v_attendee jsonb;
  v_uid uuid;
  v_ok boolean;
  v_fp text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_command_id IS NULL THEN
    RAISE EXCEPTION 'p_command_id required' USING ERRCODE = '22023';
  END IF;
  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id required' USING ERRCODE = '22023';
  END IF;

  v_is_staff := public.has_role(v_actor, 'admin'::app_role)
             OR public.has_role(v_actor, 'backoffice'::app_role);

  SELECT EXISTS (
    SELECT 1 FROM public.workspaces
    WHERE id = p_workspace_id AND assigned_consultor_id = v_actor
  ) INTO v_is_consultor;

  v_is_declared_primary :=
    (p_primary_consultant_id = v_actor
     AND EXISTS (SELECT 1 FROM public.workspace_users
                 WHERE workspace_id = p_workspace_id AND user_id = v_actor AND active))
    OR (
      p_primary_mentor_id = v_actor
      AND EXISTS (
        SELECT 1 FROM public.mentor_connections
        WHERE mentor_id = v_actor
          AND workspace_id = p_workspace_id
          AND status = 'accepted'
      )
    );

  IF NOT (v_is_staff OR v_is_consultor OR v_is_declared_primary) THEN
    RAISE EXCEPTION 'not authorized to log completed session for this workspace'
      USING ERRCODE = '42501';
  END IF;

  v_fp := public.rc5_session_command_fingerprint(
    v_actor, p_workspace_id, p_title, p_occurred_at,
    p_actual_duration_minutes, p_primary_consultant_id, p_primary_mentor_id,
    p_session_type, p_source, p_attendance);

  -- Idempotency lookup AFTER authorization; enforce fingerprint identity.
  SELECT id, created_by, workspace_id, command_fingerprint
    INTO v_existing_id, v_existing_actor, v_existing_ws, v_existing_fp
    FROM public.sessions
    WHERE command_id = p_command_id
    FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    -- Legacy rows may have NULL fingerprint (pre-migration). Treat NULL as
    -- "unknown" and require actor+workspace to match; refuse otherwise.
    IF v_existing_actor IS DISTINCT FROM v_actor
       OR v_existing_ws IS DISTINCT FROM p_workspace_id
       OR (v_existing_fp IS NOT NULL AND v_existing_fp <> v_fp) THEN
      RAISE EXCEPTION 'command identity mismatch'
        USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('session_id', v_existing_id, 'idempotent', true);
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

  IF jsonb_typeof(p_attendance) = 'array' THEN
    FOR v_attendee IN SELECT * FROM jsonb_array_elements(p_attendance) LOOP
      v_uid := nullif(v_attendee->>'user_id','')::uuid;
      IF v_uid IS NULL THEN CONTINUE; END IF;
      SELECT
        public.has_role(v_uid,'admin'::app_role)
        OR public.has_role(v_uid,'backoffice'::app_role)
        OR EXISTS (SELECT 1 FROM public.workspace_users
                   WHERE workspace_id = p_workspace_id AND user_id = v_uid AND active)
        OR EXISTS (SELECT 1 FROM public.mentor_connections
                   WHERE workspace_id = p_workspace_id AND mentor_id = v_uid AND status = 'accepted')
        OR EXISTS (SELECT 1 FROM public.workspaces
                   WHERE id = p_workspace_id AND assigned_consultor_id = v_uid)
      INTO v_ok;
      IF NOT v_ok THEN
        RAISE EXCEPTION 'attendee % not authorized for workspace', v_uid
          USING ERRCODE = '42501';
      END IF;
    END LOOP;
  END IF;

  BEGIN
    INSERT INTO public.sessions (
      workspace_id, title, scheduled_at, duration,
      notes, decisions, location,
      created_by, source, session_type, status,
      primary_consultant_id, primary_mentor_id, outlook_sync_status,
      actual_duration_minutes, completed_at, command_id, command_fingerprint
    ) VALUES (
      p_workspace_id, p_title, p_occurred_at, p_actual_duration_minutes,
      p_notes, p_decisions, p_location,
      v_actor, p_source, coalesce(p_session_type,'general'), 'completed',
      p_primary_consultant_id, p_primary_mentor_id, 'not_applicable',
      p_actual_duration_minutes, p_occurred_at, p_command_id, v_fp
    ) RETURNING id INTO v_session_id;
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent inserter won the race. Re-read and re-validate identity.
    SELECT id, created_by, workspace_id, command_fingerprint
      INTO v_existing_id, v_existing_actor, v_existing_ws, v_existing_fp
      FROM public.sessions WHERE command_id = p_command_id;
    IF v_existing_actor IS DISTINCT FROM v_actor
       OR v_existing_ws IS DISTINCT FROM p_workspace_id
       OR (v_existing_fp IS NOT NULL AND v_existing_fp <> v_fp) THEN
      RAISE EXCEPTION 'command identity mismatch'
        USING ERRCODE = '42501';
    END IF;
    RETURN jsonb_build_object('session_id', v_existing_id, 'idempotent', true);
  END;

  IF jsonb_typeof(p_attendance) = 'array' THEN
    FOR v_attendee IN SELECT * FROM jsonb_array_elements(p_attendance) LOOP
      v_uid := nullif(v_attendee->>'user_id','')::uuid;
      IF v_uid IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.session_participants (
        session_id, user_id, role, attendance_status
      ) VALUES (
        v_session_id, v_uid,
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
$$;
