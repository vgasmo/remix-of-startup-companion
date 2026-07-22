-- RC5 Batch D — Role-matrix scenarios for public.has_workspace_access(_user_id, _workspace_id)
-- Run inside a single transaction with ROLLBACK at the end. Requires service_role / postgres.
-- Verifies parity with the single-arg overload:
--   * Admins → always true
--   * Consultors → always true (any workspace)
--   * Founder (approved + active membership) → true
--   * Founder (suspended profile) → false
--   * Founder (pending profile) → false
--   * Founder (inactive membership) → false
--   * Non-member (approved) → false
--   * Mentor externo without NDA → false
--   * Mentor externo with NDA + active membership → true
--   * Blocked workspace vs. non-staff → false; admin bypass still true

BEGIN;

DO $$
DECLARE
  admin_id       uuid := gen_random_uuid();
  consultor_id   uuid := gen_random_uuid();
  founder_ok_id  uuid := gen_random_uuid();
  founder_pend_id uuid := gen_random_uuid();
  founder_susp_id uuid := gen_random_uuid();
  founder_off_id  uuid := gen_random_uuid();
  stranger_id    uuid := gen_random_uuid();
  mentor_nda_id  uuid := gen_random_uuid();
  mentor_nonda_id uuid := gen_random_uuid();

  program_id     uuid;
  startup_id     uuid;
  workspace_id   uuid;

  failures int := 0;

  PROCEDURE expect(_label text, _got boolean, _expected boolean) AS $body$
  BEGIN
    IF _got IS DISTINCT FROM _expected THEN
      RAISE NOTICE '❌ % — got=% expected=%', _label, _got, _expected;
      failures := failures + 1;
    ELSE
      RAISE NOTICE '✅ %', _label;
    END IF;
  END;
  $body$ LANGUAGE plpgsql;
BEGIN
  -- Fixtures ------------------------------------------------------------
  INSERT INTO auth.users(id) VALUES
    (admin_id), (consultor_id), (founder_ok_id), (founder_pend_id),
    (founder_susp_id), (founder_off_id), (stranger_id),
    (mentor_nda_id), (mentor_nonda_id);

  INSERT INTO public.profiles(id, email, account_status) VALUES
    (admin_id,        'admin@t',  'approved'),
    (consultor_id,    'cons@t',   'approved'),
    (founder_ok_id,   'ok@t',     'approved'),
    (founder_pend_id, 'pend@t',   'pending'),
    (founder_susp_id, 'susp@t',   'suspended'),
    (founder_off_id,  'off@t',    'approved'),
    (stranger_id,     'stg@t',    'approved'),
    (mentor_nda_id,   'mnda@t',   'approved'),
    (mentor_nonda_id, 'mnn@t',    'approved');

  INSERT INTO public.user_roles(user_id, role) VALUES
    (admin_id, 'admin'),
    (consultor_id, 'consultor'),
    (mentor_nda_id, 'mentor_externo'),
    (mentor_nonda_id, 'mentor_externo');

  INSERT INTO public.mentor_nda_acceptances(user_id, nda_version)
    VALUES (mentor_nda_id, 'PT-NDA-2026-01');

  INSERT INTO public.programs(name) VALUES ('rc5-batch-d') RETURNING id INTO program_id;
  INSERT INTO public.startups(name) VALUES ('rc5-batch-d') RETURNING id INTO startup_id;
  INSERT INTO public.workspaces(startup_id, program_id, status)
    VALUES (startup_id, program_id, 'active')
    RETURNING id INTO workspace_id;

  INSERT INTO public.workspace_users(workspace_id, user_id, role, active) VALUES
    (workspace_id, founder_ok_id,   'founder',        true),
    (workspace_id, founder_pend_id, 'founder',        true),
    (workspace_id, founder_susp_id, 'founder',        true),
    (workspace_id, founder_off_id,  'founder',        false),
    (workspace_id, mentor_nda_id,   'mentor_externo', true),
    (workspace_id, mentor_nonda_id, 'mentor_externo', true);

  -- Assertions ----------------------------------------------------------
  CALL expect('admin → true',
    public.has_workspace_access(admin_id, workspace_id), true);
  CALL expect('consultor → true (global)',
    public.has_workspace_access(consultor_id, workspace_id), true);
  CALL expect('founder approved + active membership → true',
    public.has_workspace_access(founder_ok_id, workspace_id), true);
  CALL expect('founder pending → false',
    public.has_workspace_access(founder_pend_id, workspace_id), false);
  CALL expect('founder suspended → false',
    public.has_workspace_access(founder_susp_id, workspace_id), false);
  CALL expect('founder inactive membership → false',
    public.has_workspace_access(founder_off_id, workspace_id), false);
  CALL expect('non-member approved → false',
    public.has_workspace_access(stranger_id, workspace_id), false);
  CALL expect('mentor_externo without NDA → false',
    public.has_workspace_access(mentor_nonda_id, workspace_id), false);
  CALL expect('mentor_externo with NDA + membership → true',
    public.has_workspace_access(mentor_nda_id, workspace_id), true);

  -- Blocked workspace behaviour (status set via direct update; skip constraint by disabling).
  ALTER TABLE public.workspaces DROP CONSTRAINT workspaces_status_check;
  UPDATE public.workspaces SET status='blocked' WHERE id=workspace_id;

  CALL expect('blocked workspace: founder → false',
    public.has_workspace_access(founder_ok_id, workspace_id), false);
  CALL expect('blocked workspace: admin → true (bypass)',
    public.has_workspace_access(admin_id, workspace_id), true);
  CALL expect('blocked workspace: consultor → true (bypass)',
    public.has_workspace_access(consultor_id, workspace_id), true);

  IF failures > 0 THEN
    RAISE EXCEPTION 'RC5 Batch D — % scenario(s) failed', failures;
  END IF;
  RAISE NOTICE '🎉 RC5 Batch D — all scenarios passed';
END $$;

ROLLBACK;
