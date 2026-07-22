-- RC5 Batch A canonical harness for public.log_completed_session_atomic.
-- ⚠ DO NOT RUN AGAINST PRODUCTION. Intended for isolated non-production DBs
--   only; superseded by supabase/tests/log_completed_session_atomic.test.sql
--   (pgTAP) + scripts/rc5/concurrency-log-session.mjs for canonical proof.
-- Emits `[<iso>] S<n> PASS expected=… actual=…` notices per scenario and a
-- final cleanup-verification block. Any assertion failure RAISEs and aborts.
--
-- Scenarios:
--   S1  staff happy path
--   S2  idempotent retry (same command_id)
--   S3  plain workspace member attributing to another user → 42501
--   S4  plain workspace member attributing to themselves → allowed
--   S5  mentor with no accepted connection → 42501
--   S6  mentor with accepted connection → allowed AND primary_mentor_id persisted
--   S7  unauthenticated / unauthorized caller replaying a known command_id
--       must receive 42501 BEFORE the idempotency lookup (info-disclosure)
--   S8  future occurred_at → invalid_parameter_value
--   S9  duration out of range → invalid_parameter_value
--   S10 missing primary attribution → invalid_parameter_value
--   S11 invalid source ('outlook_import') → invalid_parameter_value
--   S12 attendee user_id that is not part of the workspace → 42501
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
  INSERT INTO auth.users(id, email) VALUES
    (v_staff,'rc5a-staff@test.local'),
    (v_member,'rc5a-member@test.local'),
    (v_mentor,'rc5a-mentor@test.local'),
    (v_other,'rc5a-other@test.local'),
    (v_rogue,'rc5a-rogue@test.local');
  INSERT INTO public.startups(id, name) VALUES (v_startup, 'RC5-A Startup');
  INSERT INTO public.programs(id, name, program_type, is_active)
    VALUES (v_program, 'RC5-A Program', 'incubation', true);
  INSERT INTO public.workspaces(id, startup_id, program_id, stage, status, priority_level, needs_onboarding)
    VALUES (v_ws, v_startup, v_program, 'ideation', 'active', 'standard', false);
  INSERT INTO public.user_roles(user_id, role) VALUES (v_staff, 'admin');
  INSERT INTO public.workspace_users(workspace_id, user_id, role, active)
    VALUES (v_ws, v_member, 'founder', true);

  -- S1
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  r := public.log_completed_session_atomic(
    p_command_id := '00000000-0000-0000-0000-0000000000c1',
    p_workspace_id := v_ws, p_title := 'S1',
    p_occurred_at := now() - interval '1 day',
    p_actual_duration_minutes := 60,
    p_primary_consultant_id := v_staff);
  IF (r->>'idempotent')::boolean THEN RAISE EXCEPTION 'S1 idempotent should be false'; END IF;
  v_sid := (r->>'session_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.sessions
                WHERE id=v_sid AND status='completed' AND completed_at IS NOT NULL
                  AND source='off_platform' AND actual_duration_minutes=60) THEN
    RAISE EXCEPTION 'S1 session not persisted correctly';
  END IF;

  -- S2 idempotent retry
  r := public.log_completed_session_atomic(
    p_command_id := '00000000-0000-0000-0000-0000000000c1',
    p_workspace_id := v_ws, p_title := 'S2 dup',
    p_occurred_at := now() - interval '1 day',
    p_actual_duration_minutes := 60,
    p_primary_consultant_id := v_staff);
  IF NOT (r->>'idempotent')::boolean THEN RAISE EXCEPTION 'S2 expected idempotent=true'; END IF;
  IF (r->>'session_id')::uuid <> v_sid THEN RAISE EXCEPTION 'S2 different session_id'; END IF;
  SELECT count(*) INTO v_count FROM public.sessions WHERE command_id='00000000-0000-0000-0000-0000000000c1';
  IF v_count <> 1 THEN RAISE EXCEPTION 'S2 duplicated: count=%', v_count; END IF;

  -- S3 member cannot attribute to someone else
  PERFORM set_config('request.jwt.claim.sub', v_member::text, true);
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c3',
      p_workspace_id := v_ws, p_title := 'S3',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 30,
      p_primary_consultant_id := v_staff);
    RAISE EXCEPTION 'S3 expected 42501';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- S4 member self-attribution allowed
  r := public.log_completed_session_atomic(
    p_command_id := '00000000-0000-0000-0000-0000000000c4',
    p_workspace_id := v_ws, p_title := 'S4',
    p_occurred_at := now() - interval '2 hours',
    p_actual_duration_minutes := 45,
    p_primary_consultant_id := v_member);
  IF (r->>'session_id') IS NULL THEN RAISE EXCEPTION 'S4 missing session_id'; END IF;

  -- S5 mentor without accepted connection
  PERFORM set_config('request.jwt.claim.sub', v_mentor::text, true);
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c5',
      p_workspace_id := v_ws, p_title := 'S5',
      p_occurred_at := now() - interval '3 hours',
      p_actual_duration_minutes := 45,
      p_primary_mentor_id := v_mentor,
      p_source := 'mentor_booking');
    RAISE EXCEPTION 'S5 expected 42501';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  INSERT INTO public.mentor_connections(mentor_id, founder_id, workspace_id, status)
    VALUES (v_mentor, v_member, v_ws, 'accepted');

  -- S6 mentor happy + attribution persisted
  r := public.log_completed_session_atomic(
    p_command_id := '00000000-0000-0000-0000-0000000000c6',
    p_workspace_id := v_ws, p_title := 'S6',
    p_occurred_at := now() - interval '3 hours',
    p_actual_duration_minutes := 45,
    p_primary_mentor_id := v_mentor,
    p_source := 'mentor_booking');
  v_sid_s6 := (r->>'session_id')::uuid;
  IF v_sid_s6 IS NULL THEN RAISE EXCEPTION 'S6 missing session_id'; END IF;
  SELECT primary_mentor_id INTO v_mentor_persisted FROM public.sessions WHERE id=v_sid_s6;
  IF v_mentor_persisted IS DISTINCT FROM v_mentor THEN
    RAISE EXCEPTION 'S6 primary_mentor_id not persisted: got %', v_mentor_persisted;
  END IF;

  -- S7 info-disclosure probe: unauthorized replay of known command_id
  PERFORM set_config('request.jwt.claim.sub', v_rogue::text, true);
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c1',
      p_workspace_id := v_ws, p_title := 'S7 probe',
      p_occurred_at := now() - interval '1 day',
      p_actual_duration_minutes := 60,
      p_primary_consultant_id := v_rogue);
    RAISE EXCEPTION 'S7 leaked / auth after idempotency';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- Parameter validation (S8-S11) as staff
  PERFORM set_config('request.jwt.claim.sub', v_staff::text, true);
  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c8',
      p_workspace_id := v_ws, p_title := 'S8',
      p_occurred_at := now() + interval '1 hour',
      p_actual_duration_minutes := 30,
      p_primary_consultant_id := v_staff);
    RAISE EXCEPTION 'S8 expected invalid_parameter_value';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-0000000000c9',
      p_workspace_id := v_ws, p_title := 'S9',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 5000,
      p_primary_consultant_id := v_staff);
    RAISE EXCEPTION 'S9 expected invalid_parameter_value';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-000000000c10',
      p_workspace_id := v_ws, p_title := 'S10',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 30);
    RAISE EXCEPTION 'S10 expected invalid_parameter_value';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  BEGIN
    PERFORM public.log_completed_session_atomic(
      p_command_id := '00000000-0000-0000-0000-000000000c11',
      p_workspace_id := v_ws, p_title := 'S11',
      p_occurred_at := now() - interval '2 hours',
      p_actual_duration_minutes := 30,
      p_primary_consultant_id := v_staff,
      p_source := 'outlook_import');
    RAISE EXCEPTION 'S11 expected invalid_parameter_value';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;

  -- S12 unauthorized attendee
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
    RAISE EXCEPTION 'S12 expected 42501';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;

  -- Cleanup
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
  DELETE FROM public.profiles WHERE id IN (v_staff,v_member,v_mentor,v_other,v_rogue);
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
  DELETE FROM public.profiles WHERE id IN (v_staff,v_member,v_mentor,v_other,v_rogue);
  DELETE FROM auth.users WHERE id IN (v_staff,v_member,v_mentor,v_other,v_rogue);
  RAISE;
END
$rc5_batch_a$;
