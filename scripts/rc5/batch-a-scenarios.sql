-- RC5 Batch A: 8 executable scenarios for log_completed_session_atomic.
-- Runs via the supabase insert tool (service_role) as a single DO block with
-- explicit cleanup at the end so no persistent test rows remain even on
-- partial failure. Any assertion failure RAISEs and the whole DO block aborts.
DO $rc5_batch_a$
DECLARE
  v_startup uuid := '00000000-0000-0000-0000-00000000a001';
  v_program uuid := '00000000-0000-0000-0000-00000000a002';
  v_ws      uuid := '00000000-0000-0000-0000-00000000a003';
  v_staff   uuid := '00000000-0000-0000-0000-00000000a010';
  v_member  uuid := '00000000-0000-0000-0000-00000000a011';
  v_mentor  uuid := '00000000-0000-0000-0000-00000000a012';
  v_other   uuid := '00000000-0000-0000-0000-00000000a013';
  r jsonb;
  v_sid uuid;
  v_count int;
BEGIN
  -- ------------- fixtures ---------------------------------------------
  INSERT INTO auth.users(id) VALUES (v_staff),(v_member),(v_mentor),(v_other);
  INSERT INTO public.startups(id, name) VALUES (v_startup, 'RC5-A Startup');
  INSERT INTO public.programs(id, name) VALUES (v_program, 'RC5-A Program');
  INSERT INTO public.workspaces(id, startup_id, program_id) VALUES (v_ws, v_startup, v_program);
  INSERT INTO public.user_roles(user_id, role) VALUES (v_staff, 'admin');
  INSERT INTO public.workspace_users(workspace_id, user_id, role, active, status)
    VALUES (v_ws, v_member, 'founder', true, 'active');

  -- Scenario 1: staff happy path ---------------------------------------
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

  -- Scenario 2: idempotent retry ---------------------------------------
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

  -- Scenario 3: unauthorized user rejected -----------------------------
  PERFORM set_config('request.jwt.claim.sub', v_other::text, true);
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c3',
      p_workspace_id := v_ws, p_title := 'S3',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 30,
      p_primary_consultant_id := v_other);
    RAISE EXCEPTION 'S3 expected 42501 but succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- Scenario 4: future occurred_at rejected ----------------------------
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c4',
      p_workspace_id := v_ws, p_title := 'S4',
      p_occurred_at := now() + interval '1 hour',
      p_actual_duration_minutes := 30,
      p_primary_consultant_id := v_staff);
    RAISE EXCEPTION 'S4 expected invalid_parameter_value but succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  -- Scenario 5: duration out of range ---------------------------------
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c5',
      p_workspace_id := v_ws, p_title := 'S5',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 5000,
      p_primary_consultant_id := v_staff);
    RAISE EXCEPTION 'S5 expected invalid_parameter_value but succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  -- Scenario 6: missing primary attribution ----------------------------
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c6',
      p_workspace_id := v_ws, p_title := 'S6',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 30);
    RAISE EXCEPTION 'S6 expected invalid_parameter_value but succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  -- Scenario 7: invalid source rejected -------------------------------
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c7',
      p_workspace_id := v_ws, p_title := 'S7',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 30,
      p_primary_consultant_id := v_staff,
      p_source := 'outlook_import');
    RAISE EXCEPTION 'S7 expected invalid_parameter_value but succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  -- Scenario 8: mentor path -------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_mentor::text, true);
  -- 8a mentor without connection => denied
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c8',
      p_workspace_id := v_ws, p_title := 'S8a',
      p_occurred_at := now() - interval '3 hours',
      p_actual_duration_minutes := 45,
      p_primary_mentor_id := v_mentor,
      p_source := 'mentor_booking');
    RAISE EXCEPTION 'S8a expected 42501 but succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- Grant active connection
  INSERT INTO public.mentor_connections(mentor_id, founder_id, workspace_id, status)
    VALUES (v_mentor, v_member, v_ws, 'active');
  -- 8b now allowed
  r := public.log_completed_session_atomic(
    p_command_id := '00000000-0000-0000-0000-0000000000c8',
    p_workspace_id := v_ws, p_title := 'S8b',
    p_occurred_at := now() - interval '3 hours',
    p_actual_duration_minutes := 45,
    p_primary_mentor_id := v_mentor,
    p_source := 'mentor_booking');
  IF (r->>'session_id') IS NULL THEN RAISE EXCEPTION 'S8b missing session_id'; END IF;

  -- ------------- cleanup ---------------------------------------------
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
  DELETE FROM public.user_roles WHERE user_id IN (v_staff,v_member,v_mentor,v_other);
  DELETE FROM auth.users WHERE id IN (v_staff,v_member,v_mentor,v_other);

  RAISE NOTICE 'RC5 Batch A: all 8 scenarios passed';

EXCEPTION WHEN OTHERS THEN
  -- best-effort cleanup on failure, then re-raise
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
  DELETE FROM public.user_roles WHERE user_id IN (v_staff,v_member,v_mentor,v_other);
  DELETE FROM auth.users WHERE id IN (v_staff,v_member,v_mentor,v_other);
  RAISE;
END
$rc5_batch_a$;
