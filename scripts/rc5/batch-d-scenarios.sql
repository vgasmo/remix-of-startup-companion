-- RC5 Batch D — Role-matrix scenarios for public.has_workspace_access(_user_id, _workspace_id)
-- Run inside a single transaction with ROLLBACK. Requires postgres/service_role.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect(_label text, _got boolean, _expected boolean)
RETURNS int LANGUAGE plpgsql AS $$
BEGIN
  IF _got IS DISTINCT FROM _expected THEN
    RAISE NOTICE '[FAIL] % — got=% expected=%', _label, _got, _expected;
    RETURN 1;
  END IF;
  RAISE NOTICE '[ OK ] %', _label;
  RETURN 0;
END $$;

DO $$
DECLARE
  admin_id        uuid := gen_random_uuid();
  consultor_id    uuid := gen_random_uuid();
  founder_ok_id   uuid := gen_random_uuid();
  founder_pend_id uuid := gen_random_uuid();
  founder_susp_id uuid := gen_random_uuid();
  founder_off_id  uuid := gen_random_uuid();
  stranger_id     uuid := gen_random_uuid();
  mentor_nda_id   uuid := gen_random_uuid();
  mentor_nonda_id uuid := gen_random_uuid();

  program_id     uuid;
  startup_id     uuid;
  workspace_id   uuid;
  failures       int  := 0;
BEGIN
  INSERT INTO auth.users(id) VALUES
    (admin_id),(consultor_id),(founder_ok_id),(founder_pend_id),
    (founder_susp_id),(founder_off_id),(stranger_id),
    (mentor_nda_id),(mentor_nonda_id);

  INSERT INTO public.profiles(id,email,account_status) VALUES
    (admin_id,'admin@t','approved'),
    (consultor_id,'cons@t','approved'),
    (founder_ok_id,'ok@t','approved'),
    (founder_pend_id,'pend@t','pending'),
    (founder_susp_id,'susp@t','suspended'),
    (founder_off_id,'off@t','approved'),
    (stranger_id,'stg@t','approved'),
    (mentor_nda_id,'mnda@t','approved'),
    (mentor_nonda_id,'mnn@t','approved');

  INSERT INTO public.user_roles(user_id,role) VALUES
    (admin_id,'admin'),
    (consultor_id,'consultor'),
    (mentor_nda_id,'mentor_externo'),
    (mentor_nonda_id,'mentor_externo');

  INSERT INTO public.mentor_nda_acceptances(user_id,nda_version)
    VALUES (mentor_nda_id,'PT-NDA-2026-01');

  INSERT INTO public.programs(name) VALUES ('rc5-batch-d') RETURNING id INTO program_id;
  INSERT INTO public.startups(name) VALUES ('rc5-batch-d') RETURNING id INTO startup_id;
  INSERT INTO public.workspaces(startup_id,program_id,status)
    VALUES (startup_id,program_id,'active') RETURNING id INTO workspace_id;

  INSERT INTO public.workspace_users(workspace_id,user_id,role,active) VALUES
    (workspace_id,founder_ok_id,'founder',true),
    (workspace_id,founder_pend_id,'founder',true),
    (workspace_id,founder_susp_id,'founder',true),
    (workspace_id,founder_off_id,'founder',false),
    (workspace_id,mentor_nda_id,'mentor_externo',true),
    (workspace_id,mentor_nonda_id,'mentor_externo',true);

  failures := failures + pg_temp.expect('admin → true',
    public.has_workspace_access(admin_id, workspace_id), true);
  failures := failures + pg_temp.expect('consultor → true (global)',
    public.has_workspace_access(consultor_id, workspace_id), true);
  failures := failures + pg_temp.expect('founder approved+active → true',
    public.has_workspace_access(founder_ok_id, workspace_id), true);
  failures := failures + pg_temp.expect('founder pending → false',
    public.has_workspace_access(founder_pend_id, workspace_id), false);
  failures := failures + pg_temp.expect('founder suspended → false',
    public.has_workspace_access(founder_susp_id, workspace_id), false);
  failures := failures + pg_temp.expect('founder inactive membership → false',
    public.has_workspace_access(founder_off_id, workspace_id), false);
  failures := failures + pg_temp.expect('non-member approved → false',
    public.has_workspace_access(stranger_id, workspace_id), false);
  failures := failures + pg_temp.expect('mentor_externo no NDA → false',
    public.has_workspace_access(mentor_nonda_id, workspace_id), false);
  failures := failures + pg_temp.expect('mentor_externo with NDA → true',
    public.has_workspace_access(mentor_nda_id, workspace_id), true);

  ALTER TABLE public.workspaces DROP CONSTRAINT workspaces_status_check;
  UPDATE public.workspaces SET status='blocked' WHERE id=workspace_id;

  failures := failures + pg_temp.expect('blocked ws: founder → false',
    public.has_workspace_access(founder_ok_id, workspace_id), false);
  failures := failures + pg_temp.expect('blocked ws: admin → true',
    public.has_workspace_access(admin_id, workspace_id), true);
  failures := failures + pg_temp.expect('blocked ws: consultor → true',
    public.has_workspace_access(consultor_id, workspace_id), true);

  IF failures > 0 THEN
    RAISE EXCEPTION 'RC5 Batch D — % scenario(s) failed', failures;
  END IF;
  RAISE NOTICE '🎉 RC5 Batch D — all scenarios passed';
END $$;

ROLLBACK;
