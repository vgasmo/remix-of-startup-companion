-- RC5 Batch A: 8 executable scenarios for log_completed_session_atomic
-- Runs inside a single transaction and ROLLBACKs at the end, so no persistent
-- mutations remain. Each scenario RAISEs on assertion failure => psql exits
-- non-zero and the Vitest wrapper fails.

\set ON_ERROR_STOP on

BEGIN;

-- Fresh fixtures (all uuids namespaced under 0000...) --------------------
DO $fx$
DECLARE
  v_startup  uuid := '00000000-0000-0000-0000-00000000a001';
  v_program  uuid := '00000000-0000-0000-0000-00000000a002';
  v_ws       uuid := '00000000-0000-0000-0000-00000000a003';
  v_staff    uuid := '00000000-0000-0000-0000-00000000a010';
  v_member   uuid := '00000000-0000-0000-0000-00000000a011';
  v_mentor   uuid := '00000000-0000-0000-0000-00000000a012';
  v_other    uuid := '00000000-0000-0000-0000-00000000a013';
BEGIN
  INSERT INTO auth.users(id) VALUES (v_staff),(v_member),(v_mentor),(v_other);
  INSERT INTO public.startups(id, name) VALUES (v_startup, 'RC5-A Startup');
  INSERT INTO public.programs(id, name) VALUES (v_program, 'RC5-A Program');
  INSERT INTO public.workspaces(id, startup_id, program_id)
    VALUES (v_ws, v_startup, v_program);
  INSERT INTO public.user_roles(user_id, role) VALUES (v_staff, 'admin');
  INSERT INTO public.workspace_users(workspace_id, user_id, role, active, status)
    VALUES (v_ws, v_member, 'founder', true, 'active');
END $fx$;

-- Scenario 1: staff happy-path insert -----------------------------------
DO $s1$
DECLARE r jsonb; v_sid uuid;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a010', true);
  r := public.log_completed_session_atomic(
    p_command_id := '00000000-0000-0000-0000-0000000000c1',
    p_workspace_id := '00000000-0000-0000-0000-00000000a003',
    p_title := 'Scenario1 staff insert',
    p_occurred_at := now() - interval '1 day',
    p_actual_duration_minutes := 60,
    p_primary_consultant_id := '00000000-0000-0000-0000-00000000a010'
  );
  IF (r->>'idempotent')::boolean THEN RAISE EXCEPTION 'S1 expected idempotent=false, got %', r; END IF;
  v_sid := (r->>'session_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.sessions WHERE id = v_sid AND status='completed' AND completed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'S1 session not persisted with completed status';
  END IF;
END $s1$;

-- Scenario 2: idempotent retry (same command_id) -----------------------
DO $s2$
DECLARE r jsonb; v_count int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a010', true);
  r := public.log_completed_session_atomic(
    p_command_id := '00000000-0000-0000-0000-0000000000c1',   -- same as S1
    p_workspace_id := '00000000-0000-0000-0000-00000000a003',
    p_title := 'Scenario2 duplicate',
    p_occurred_at := now() - interval '1 day',
    p_actual_duration_minutes := 60,
    p_primary_consultant_id := '00000000-0000-0000-0000-00000000a010'
  );
  IF NOT (r->>'idempotent')::boolean THEN RAISE EXCEPTION 'S2 expected idempotent=true, got %', r; END IF;
  SELECT count(*) INTO v_count FROM public.sessions WHERE command_id = '00000000-0000-0000-0000-0000000000c1';
  IF v_count <> 1 THEN RAISE EXCEPTION 'S2 duplicate row created: count=%', v_count; END IF;
END $s2$;

-- Scenario 3: unauthorized user rejected --------------------------------
DO $s3$
DECLARE r jsonb; v_err text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a013', true);
  BEGIN
    r := public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c3',
      p_workspace_id := '00000000-0000-0000-0000-00000000a003',
      p_title := 'Scenario3',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 30,
      p_primary_consultant_id := '00000000-0000-0000-0000-00000000a013'
    );
    RAISE EXCEPTION 'S3 expected 42501 but call succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $s3$;

-- Scenario 4: future occurred_at rejected -------------------------------
DO $s4$
BEGIN
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a010', true);
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c4',
      p_workspace_id := '00000000-0000-0000-0000-00000000a003',
      p_title := 'S4',
      p_occurred_at := now() + interval '1 hour',
      p_actual_duration_minutes := 30,
      p_primary_consultant_id := '00000000-0000-0000-0000-00000000a010'
    );
    RAISE EXCEPTION 'S4 expected 22023 but call succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $s4$;

-- Scenario 5: duration out of range -------------------------------------
DO $s5$
BEGIN
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a010', true);
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c5',
      p_workspace_id := '00000000-0000-0000-0000-00000000a003',
      p_title := 'S5',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 5000,
      p_primary_consultant_id := '00000000-0000-0000-0000-00000000a010'
    );
    RAISE EXCEPTION 'S5 expected 22023 but call succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $s5$;

-- Scenario 6: primary attribution required ------------------------------
DO $s6$
BEGIN
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a010', true);
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c6',
      p_workspace_id := '00000000-0000-0000-0000-00000000a003',
      p_title := 'S6',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 30
    );
    RAISE EXCEPTION 'S6 expected 22023 but call succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $s6$;

-- Scenario 7: invalid source rejected -----------------------------------
DO $s7$
BEGIN
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a010', true);
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c7',
      p_workspace_id := '00000000-0000-0000-0000-00000000a003',
      p_title := 'S7',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 30,
      p_primary_consultant_id := '00000000-0000-0000-0000-00000000a010',
      p_source := 'outlook_import'
    );
    RAISE EXCEPTION 'S7 expected 22023 but call succeeded';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
END $s7$;

-- Scenario 8: mentor path (denied without connection, allowed with) -----
DO $s8$
DECLARE r jsonb;
BEGIN
  -- 8a: mentor without active connection => denied
  PERFORM set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000a012', true);
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c8',
      p_workspace_id := '00000000-0000-0000-0000-00000000a003',
      p_title := 'S8a mentor no connection',
      p_occurred_at := now() - interval '3 hours',
      p_actual_duration_minutes := 45,
      p_primary_mentor_id := '00000000-0000-0000-0000-00000000a012',
      p_source := 'mentor_booking'
    );
    RAISE EXCEPTION 'S8a expected 42501 but call succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- Create active mentor_connection
  INSERT INTO public.mentor_connections(mentor_id, founder_id, workspace_id, status)
    VALUES ('00000000-0000-0000-0000-00000000a012',
            '00000000-0000-0000-0000-00000000a011',
            '00000000-0000-0000-0000-00000000a003',
            'active');

  -- 8b: same mentor now allowed
  r := public.log_completed_session_atomic(
    p_command_id := '00000000-0000-0000-0000-0000000000c8',
    p_workspace_id := '00000000-0000-0000-0000-00000000a003',
    p_title := 'S8b mentor',
    p_occurred_at := now() - interval '3 hours',
    p_actual_duration_minutes := 45,
    p_primary_mentor_id := '00000000-0000-0000-0000-00000000a012',
    p_source := 'mentor_booking'
  );
  IF (r->>'session_id') IS NULL THEN RAISE EXCEPTION 'S8b did not return session_id: %', r; END IF;
END $s8$;

-- All 8 scenarios asserted. Rollback so nothing persists.
ROLLBACK;

\echo '=== RC5 Batch A: all 8 scenarios passed ==='
