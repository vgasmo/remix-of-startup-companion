-- RC5 Batch A canonical harness for public.log_completed_session_atomic.
-- Runs as a single DO block via service role. Every scenario is self-checking;
-- any assertion RAISEs and aborts the DO block. Guaranteed cleanup at the end
-- and in the EXCEPTION handler so no stray rows remain even on partial failure.
--
-- Scenarios (12):
--   S1  staff happy path
--   S2  idempotent retry (same command_id, no duplicate insert)
--   S3  workspace member (non-primary) BLOCKED — regression for over-broad auth
--   S4  workspace member declared as primary_consultant_id → allowed
--   S5  mentor without accepted connection → 42501
--   S6  mentor with accepted connection + declared primary_mentor_id → allowed
--       AND sessions.primary_mentor_id is persisted (mentor attribution)
--   S7  info-disclosure probe — unauthorized caller reusing an existing
--       command_id must get 42501, NOT the idempotent session_id
--   S8  future occurred_at rejected (invalid_parameter_value)
--   S9  duration out of range rejected
--   S10 missing primary attribution rejected
--   S11 invalid source rejected
--   S12 unauthorized attendee UUID → 42501 (attendee validation)
DO $rc5_batch_a$
DECLARE
  v_startup uuid := '00000000-0000-0000-0000-00000000a001';
  v_program uuid := '00000000-0000-0000-0000-00000000a002';
  v_ws      uuid := '00000000-0000-0000-0000-00000000a003';
  v_staff   uuid := '00000000-0000-0000-0000-00000000a010';
  v_member  uuid := '00000000-0000-0000-0000-00000000a011';
  v_mentor  uuid := '00000000-0000-0000-0000-00000000a012';
  v_other   uuid := '00000000-0000-0000-0000-00000000a013';
  v_rogue   uuid := '00000000-0000-0000-0000-00000000a014';
  r jsonb;
  v_sid uuid;
  v_sid_s6 uuid;
  v_count int;
  v_mentor_persisted uuid;
BEGIN
  -- ---------------- fixtures ------------------------------------------
  INSERT INTO auth.users(id) VALUES (v_staff),(v_member),(v_mentor),(v_other),(v_rogue);
  INSERT INTO public.startups(id, name) VALUES (v_startup, 'RC5-A Startup');
  INSERT INTO public.programs(id, name, program_type, is_active)
    VALUES (v_program, 'RC5-A Program', 'incubation', true);
  INSERT INTO public.workspaces(id, startup_id, program_id, stage, status, priority_level, needs_onboarding)
    VALUES (v_ws, v_startup, v_program, 'ideation', 'active', 'normal', false);
  INSERT INTO public.user_roles(user_id, role) VALUES (v_staff, 'admin');
  INSERT INTO public.workspace_users(workspace_id, user_id, role, active)
    VALUES (v_ws, v_member, 'founder', true);

  -- S1 staff happy path ------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  r := public.log_completed_session_atomic(
    p_command_id := '00000000-0000-0000-0000-0000000000c1',
    p_workspace_id := v_ws, p_title := 'S1',
    p_occurred_at := now() - interval '1 day',
    p_actual_duration_minutes := 60,
    p_primary_consultant_id := v_staff);
  IF (r->>'idempotent')::boolean THEN RAISE EXCEPTION 'S1 idempotent should be false, got %', r; END IF;
  v_sid := (r->>'session_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.sessions
                WHERE id=v_sid AND status='completed' AND completed_at IS NOT NULL
                  AND source='off_platform' AND actual_duration_minutes=60) THEN
    RAISE EXCEPTION 'S1 session not persisted correctly';
  END IF;

  -- S2 idempotent retry -----------------------------------------------
  r := public.log_completed_session_atomic(
    p_command_id := '00000000-0000-0000-0000-0000000000c1',
    p_workspace_id := v_ws, p_title := 'S2 dup',
    p_occurred_at := now() - interval '1 day',
    p_actual_duration_minutes := 60,
    p_primary_consultant_id := v_staff);
  IF NOT (r->>'idempotent')::boolean THEN RAISE EXCEPTION 'S2 expected idempotent=true'; END IF;
  IF (r->>'session_id')::uuid <> v_sid THEN RAISE EXCEPTION 'S2 returned different session_id'; END IF;
  SELECT count(*) INTO v_count FROM public.sessions WHERE command_id='00000000-0000-0000-0000-0000000000c1';
  IF v_count <> 1 THEN RAISE EXCEPTION 'S2 duplicated row: count=%', v_count; END IF;

  -- S3 workspace member (non-primary) BLOCKED -------------------------
  -- Regression: a plain active workspace member must NOT be able to log an
  -- arbitrary completed session attributed to another consultant/mentor.
  PERFORM set_config('request.jwt.claim.sub', v_member::text, true);
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c3',
      p_workspace_id := v_ws, p_title := 'S3 broad-auth probe',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 30,
      p_primary_consultant_id := v_staff);
    RAISE EXCEPTION 'S3 expected 42501 (member cannot attribute to staff) but succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- S4 workspace member declared as primary consultant → allowed ------
  r := public.log_completed_session_atomic(
    p_command_id := '00000000-0000-0000-0000-0000000000c4',
    p_workspace_id := v_ws, p_title := 'S4 self-primary',
    p_occurred_at := now() - interval '2 hours',
    p_actual_duration_minutes := 45,
    p_primary_consultant_id := v_member);
  IF (r->>'session_id') IS NULL THEN RAISE EXCEPTION 'S4 missing session_id'; END IF;

  -- S5 mentor without accepted connection → 42501 ---------------------
  PERFORM set_config('request.jwt.claim.sub', v_mentor::text, true);
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c5',
      p_workspace_id := v_ws, p_title := 'S5',
      p_occurred_at := now() - interval '3 hours',
      p_actual_duration_minutes := 45,
      p_primary_mentor_id := v_mentor,
      p_source := 'mentor_booking');
    RAISE EXCEPTION 'S5 expected 42501 but succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- S6 mentor with accepted connection + attribution persisted --------
  INSERT INTO public.mentor_connections(mentor_id, founder_id, workspace_id, status)
    VALUES (v_mentor, v_member, v_ws, 'accepted');
  r := public.log_completed_session_atomic(
    p_command_id := '00000000-0000-0000-0000-0000000000c6',
    p_workspace_id := v_ws, p_title := 'S6 mentor happy',
    p_occurred_at := now() - interval '3 hours',
    p_actual_duration_minutes := 45,
    p_primary_mentor_id := v_mentor,
    p_source := 'mentor_booking');
  v_sid_s6 := (r->>'session_id')::uuid;
  IF v_sid_s6 IS NULL THEN RAISE EXCEPTION 'S6 missing session_id'; END IF;
  SELECT primary_mentor_id INTO v_mentor_persisted FROM public.sessions WHERE id=v_sid_s6;
  IF v_mentor_persisted IS DISTINCT FROM v_mentor THEN
    RAISE EXCEPTION 'S6 primary_mentor_id not persisted: expected % got %', v_mentor, v_mentor_persisted;
  END IF;

  -- S7 info-disclosure probe ------------------------------------------
  -- v_rogue is not staff, not a member, not a consultor, not a mentor.
  -- Reusing S1's command_id must be rejected with 42501, NOT return the
  -- idempotent session_id (which would leak the existence of that session).
  PERFORM set_config('request.jwt.claim.sub', v_rogue::text, true);
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c1',
      p_workspace_id := v_ws, p_title := 'S7 probe',
      p_occurred_at := now() - interval '1 day',
      p_actual_duration_minutes := 60,
      p_primary_consultant_id := v_rogue);
    RAISE EXCEPTION 'S7 expected 42501 (auth before idempotency) but succeeded / leaked';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- S8 future occurred_at rejected ------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c8',
      p_workspace_id := v_ws, p_title := 'S8',
      p_occurred_at := now() + interval '1 hour',
      p_actual_duration_minutes := 30,
      p_primary_consultant_id := v_staff);
    RAISE EXCEPTION 'S8 expected invalid_parameter_value but succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  -- S9 duration out of range ------------------------------------------
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c9',
      p_workspace_id := v_ws, p_title := 'S9',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 5000,
      p_primary_consultant_id := v_staff);
    RAISE EXCEPTION 'S9 expected invalid_parameter_value but succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  -- S10 missing primary attribution -----------------------------------
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-000000000c10',
      p_workspace_id := v_ws, p_title := 'S10',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 30);
    RAISE EXCEPTION 'S10 expected invalid_parameter_value but succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  -- S11 invalid source ------------------------------------------------
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-000000000c11',
      p_workspace_id := v_ws, p_title := 'S11',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 30,
      p_primary_consultant_id := v_staff,
      p_source := 'outlook_import');
    RAISE EXCEPTION 'S11 expected invalid_parameter_value but succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  -- S12 unauthorized attendee UUID ------------------------------------
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-000000000c12',
      p_workspace_id := v_ws, p_title := 'S12',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 30,
      p_primary_consultant_id := v_staff,
      p_attendance := jsonb_build_array(
        jsonb_build_object('user_id', v_rogue::text, 'attendance_status', 'attended')
      ));
    RAISE EXCEPTION 'S12 expected 42501 (unauthorized attendee) but succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- ---------------- cleanup ------------------------------------------
  DELETE FROM public.session_participants
    WHERE session_id IN (SELECT id FROM public.sessions WHERE workspace_id=v_ws);
  DELETE FROM public.tool_usage_events WHERE workspace_id=v_ws;
  DELETE FROM public.activity_log WHERE workspace_id=v_ws;
  DELETE FROM public.sessions WHERE workspace_id=v_ws;
  DELETE FROM public.mentor_connections WHERE workspace_id=v_ws;
  DELETE FROM public.workspace_users WHERE workspace_id=v_ws;
  DELETE FROM public.workspaces WHERE id=v_ws;
  DELETE FROM public.startups WHERE id=v_startup;
  DELETE FROM public.programs WHERE id=v_program;
  DELETE FROM public.user_roles WHERE user_id IN (v_staff,v_member,v_mentor,v_other,v_rogue);
  DELETE FROM auth.users WHERE id IN (v_staff,v_member,v_mentor,v_other,v_rogue);

  RAISE NOTICE 'RC5 Batch A: all 12 scenarios passed';

EXCEPTION WHEN OTHERS THEN
  DELETE FROM public.session_participants
    WHERE session_id IN (SELECT id FROM public.sessions WHERE workspace_id=v_ws);
  DELETE FROM public.tool_usage_events WHERE workspace_id=v_ws;
  DELETE FROM public.activity_log WHERE workspace_id=v_ws;
  DELETE FROM public.sessions WHERE workspace_id=v_ws;
  DELETE FROM public.mentor_connections WHERE workspace_id=v_ws;
  DELETE FROM public.workspace_users WHERE workspace_id=v_ws;
  DELETE FROM public.workspaces WHERE id=v_ws;
  DELETE FROM public.startups WHERE id=v_startup;
  DELETE FROM public.programs WHERE id=v_program;
  DELETE FROM public.user_roles WHERE user_id IN (v_staff,v_member,v_mentor,v_other,v_rogue);
  DELETE FROM auth.users WHERE id IN (v_staff,v_member,v_mentor,v_other,v_rogue);
  RAISE;
END
$rc5_batch_a$;
