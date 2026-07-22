CREATE OR REPLACE FUNCTION public.rc5_run_batch_d()
RETURNS TABLE(scenario text, got boolean, expected boolean, ok boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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

  v_program_id   uuid;
  v_startup_id   uuid;
  v_workspace_id uuid;
BEGIN
  -- Subtransaction so we can always roll back the fixtures.
  BEGIN
    INSERT INTO auth.users(id) VALUES
      (admin_id),(consultor_id),(founder_ok_id),(founder_pend_id),
      (founder_susp_id),(founder_off_id),(stranger_id),
      (mentor_nda_id),(mentor_nonda_id);

    INSERT INTO public.profiles(id,email,account_status) VALUES
      (admin_id,'admin@rc5-d.test','approved'),
      (consultor_id,'cons@rc5-d.test','approved'),
      (founder_ok_id,'ok@rc5-d.test','approved'),
      (founder_pend_id,'pend@rc5-d.test','pending'),
      (founder_susp_id,'susp@rc5-d.test','suspended'),
      (founder_off_id,'off@rc5-d.test','approved'),
      (stranger_id,'stg@rc5-d.test','approved'),
      (mentor_nda_id,'mnda@rc5-d.test','approved'),
      (mentor_nonda_id,'mnn@rc5-d.test','approved');

    INSERT INTO public.user_roles(user_id,role) VALUES
      (admin_id,'admin'),
      (consultor_id,'consultor'),
      (mentor_nda_id,'mentor_externo'),
      (mentor_nonda_id,'mentor_externo');

    INSERT INTO public.mentor_nda_acceptances(user_id,nda_version)
      VALUES (mentor_nda_id,'PT-NDA-2026-01');

    INSERT INTO public.programs(name) VALUES ('rc5-batch-d') RETURNING id INTO v_program_id;
    INSERT INTO public.startups(name) VALUES ('rc5-batch-d') RETURNING id INTO v_startup_id;
    INSERT INTO public.workspaces(startup_id,program_id,status)
      VALUES (v_startup_id,v_program_id,'active') RETURNING id INTO v_workspace_id;

    INSERT INTO public.workspace_users(workspace_id,user_id,role,active) VALUES
      (v_workspace_id,founder_ok_id,'founder',true),
      (v_workspace_id,founder_pend_id,'founder',true),
      (v_workspace_id,founder_susp_id,'founder',true),
      (v_workspace_id,founder_off_id,'founder',false),
      (v_workspace_id,mentor_nda_id,'mentor_externo',true),
      (v_workspace_id,mentor_nonda_id,'mentor_externo',true);

    -- Collect results into a temp table.
    CREATE TEMP TABLE _rc5d_results(scenario text, got boolean, expected boolean) ON COMMIT DROP;

    INSERT INTO _rc5d_results VALUES
      ('admin → true',                   public.has_workspace_access(admin_id, v_workspace_id),        true),
      ('consultor → true (global)',      public.has_workspace_access(consultor_id, v_workspace_id),    true),
      ('founder approved+active → true', public.has_workspace_access(founder_ok_id, v_workspace_id),   true),
      ('founder pending → false',        public.has_workspace_access(founder_pend_id, v_workspace_id), false),
      ('founder suspended → false',      public.has_workspace_access(founder_susp_id, v_workspace_id), false),
      ('founder inactive membership → false',
                                         public.has_workspace_access(founder_off_id, v_workspace_id),  false),
      ('non-member approved → false',    public.has_workspace_access(stranger_id, v_workspace_id),     false),
      ('mentor_externo no NDA → false',  public.has_workspace_access(mentor_nonda_id, v_workspace_id), false),
      ('mentor_externo with NDA → true', public.has_workspace_access(mentor_nda_id, v_workspace_id),   true);

    -- Blocked workspace behaviour (bypass CHECK constraint just for this scenario).
    ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS workspaces_status_check;
    UPDATE public.workspaces SET status='blocked' WHERE id=v_workspace_id;

    INSERT INTO _rc5d_results VALUES
      ('blocked ws: founder → false',   public.has_workspace_access(founder_ok_id, v_workspace_id), false),
      ('blocked ws: admin → true',      public.has_workspace_access(admin_id, v_workspace_id),      true),
      ('blocked ws: consultor → true',  public.has_workspace_access(consultor_id, v_workspace_id),  true);

    -- Capture results then force rollback of fixtures via a sentinel exception.
    RETURN QUERY
      SELECT r.scenario, r.got, r.expected, (r.got IS NOT DISTINCT FROM r.expected)
      FROM _rc5d_results r;
    RAISE EXCEPTION 'RC5_BATCH_D_ROLLBACK';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'RC5_BATCH_D_ROLLBACK' THEN
        RETURN;  -- rows already returned via RETURN QUERY inside the sub-block
      END IF;
      RAISE;
  END;
END
$fn$;

REVOKE ALL ON FUNCTION public.rc5_run_batch_d() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rc5_run_batch_d() TO service_role;

COMMENT ON FUNCTION public.rc5_run_batch_d()
  IS 'RC5 Batch D role-matrix harness. Rolls back its own fixtures; service_role-only.';
