DO $$ DECLARE d text; v_md5 text; BEGIN d := pg_get_functiondef('public.staff_create_workspace_for_claim(uuid,text,uuid,text,text)'::regprocedure); v_md5 := md5(d); IF v_md5 NOT IN ('83be2021c97ad72735f4c995ca85f996','71795751c058163e79655d0ddd314646') THEN RAISE EXCEPTION 'rc12: definição de public.staff_create_workspace_for_claim divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar',v_md5; END IF; IF position('#variable_conflict' IN d)>0 THEN RETURN; END IF; IF position(E'AS $function$\nDECLARE' IN d)=0 THEN RAISE EXCEPTION 'RC12: formato inesperado em staff_create_workspace_for_claim'; END IF; EXECUTE replace(d,E'AS $function$\nDECLARE',E'AS $function$\n#variable_conflict use_column\nDECLARE'); END $$;
DO $$ DECLARE d text; v_md5 text; BEGIN d := pg_get_functiondef('public.staff_assign_or_create_workspace(uuid,text,uuid,text,uuid,text,text)'::regprocedure); v_md5:=md5(d); IF v_md5 NOT IN ('ba1edf0ea24b38b42d13335eef7c459e','094e81bb2790b96a30b9c7901d4542c2') THEN RAISE EXCEPTION 'rc12: definição de public.staff_assign_or_create_workspace divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar',v_md5; END IF; IF position('RC12 needs_onboarding' IN d)=0 THEN IF position($q$    SET needs_onboarding = false, status = 'active', updated_at = now()$q$ IN d)=0 OR position($q$    INSERT INTO public.workspaces (startup_id, program_id, stage, status, needs_onboarding)
    VALUES (v_startup_id, p_program_id, p_stage::public.startup_stage, 'active', false)$q$ IN d)=0 THEN RAISE EXCEPTION 'RC12: texto esperado não encontrado em staff_assign_or_create_workspace'; END IF; d:=replace(d,$q$    SET needs_onboarding = false, status = 'active', updated_at = now()$q$,$q$    SET needs_onboarding = CASE WHEN w.status = 'imported_unclaimed' THEN false ELSE w.needs_onboarding END, -- RC12 needs_onboarding
        status = 'active', updated_at = now()$q$); d:=replace(d,$q$    INSERT INTO public.workspaces (startup_id, program_id, stage, status, needs_onboarding)
    VALUES (v_startup_id, p_program_id, p_stage::public.startup_stage, 'active', false)$q$,$q$    INSERT INTO public.workspaces (startup_id, program_id, stage, status)
    VALUES (v_startup_id, p_program_id, p_stage::public.startup_stage, 'active')$q$); EXECUTE d; END IF; d:=pg_get_functiondef('public.approve_startup_claim(uuid,uuid)'::regprocedure); v_md5:=md5(d); IF v_md5 NOT IN ('7821e4ca7d0c72a76f93537590b0d723','4020f095a141ee52e670be1ece17c9a3') THEN RAISE EXCEPTION 'rc12: definição de public.approve_startup_claim divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar',v_md5; END IF; IF position('RC12 needs_onboarding' IN d)=0 THEN IF position($q$    SET status = 'active',
        needs_onboarding = false,$q$ IN d)=0 THEN RAISE EXCEPTION 'RC12: texto esperado não encontrado em approve_startup_claim'; END IF; d:=replace(d,$q$    SET status = 'active',
        needs_onboarding = false,$q$,$q$    SET status = 'active',
        needs_onboarding = CASE WHEN status = 'imported_unclaimed' THEN false ELSE needs_onboarding END, -- RC12 needs_onboarding$q$); EXECUTE d; END IF; END $$;
DO $guard$ DECLARE v_md5 text; BEGIN SELECT md5(pg_get_functiondef(p.oid)) INTO v_md5 FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname='ensure_founder_role' AND pg_get_function_identity_arguments(p.oid)=''; IF v_md5 NOT IN ('58c1253ee15933c4ec10df216eafdc9f','cd608dd247b828aed836960588e0e4be') THEN RAISE EXCEPTION 'rc12: definição de public.ensure_founder_role divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar',v_md5; END IF; END $guard$;
CREATE OR REPLACE FUNCTION public.ensure_founder_role() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  -- RC12: só contas aprovadas (nunca pendentes nem suspensas) se podem atribuir o papel founder
  IF NOT public.is_account_active() THEN
    RAISE EXCEPTION 'account_not_active' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (auth.uid(), 'founder'::public.app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END;
$function$;
DO $$ DECLARE d text; BEGIN d:=pg_get_functiondef('public.create_startup_application(text,text,uuid,text,text,text,text,text,text,boolean)'::regprocedure); IF md5(d) NOT IN ('f31934a36818ee878ba849890fe84505','269ae09b01da0cfe415b5274b361f66e') THEN RAISE EXCEPTION 'rc12: definição de public.create_startup_application divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar',md5(d); END IF; IF position('account_not_active' IN d)>0 THEN RETURN; END IF; IF position($q$  PERFORM public.ensure_founder_role();$q$ IN d)=0 THEN RAISE EXCEPTION 'RC12: texto esperado não encontrado em create_startup_application'; END IF; d:=replace(d,$q$  PERFORM public.ensure_founder_role();$q$,$q$  IF NOT public.is_account_active() THEN
    RAISE EXCEPTION 'account_not_active' USING ERRCODE = '42501';
  END IF;

  PERFORM public.ensure_founder_role();$q$); EXECUTE d; END $$;
DO $$ DECLARE d text; BEGIN d:=pg_get_functiondef('public.reconcile_contract_founders(uuid)'::regprocedure); IF md5(d) NOT IN ('72368c85b48f73abb994be26bdb2fae6','da44f7479bdc01a5a8dddda104eef22a') THEN RAISE EXCEPTION 'rc12: definição de public.reconcile_contract_founders divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar',md5(d); END IF; IF position('RC12 suspensa' IN d)>0 THEN RETURN; END IF; IF position($q$    -- Profile
    -- Perfil: cria aprovado$q$ IN d)=0 THEN RAISE EXCEPTION 'RC12: texto esperado não encontrado em reconcile_contract_founders'; END IF; d:=replace(d,$q$    -- Profile
    -- Perfil: cria aprovado$q$,$q$    -- RC12 suspensa: nunca dar papel nem adesão a uma conta suspensa
    IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_auth_id AND p.account_status = 'suspended'::account_status) THEN
      CONTINUE;
    END IF;

    -- Profile
    -- Perfil: cria aprovado$q$); EXECUTE d; END $$;
DO $$ DECLARE d text; BEGIN d:=pg_get_functiondef('public.claim_startup()'::regprocedure); IF md5(d) NOT IN ('f0d7cb5a9d3121afa1f1e99ae4a40eff','27c7052f47b3bb4afe4863d83c460052') THEN RAISE EXCEPTION 'rc12: definição de public.claim_startup divergente (md5 %), envie o resultado de pg_get_functiondef antes de aplicar',md5(d); END IF; IF position('RC12 claim' IN d)>0 THEN RETURN; END IF; IF position($q$    INSERT INTO workspace_users (workspace_id, user_id, role, active)
    VALUES (v_match.workspace_id, v_user_id, 'founder', true)
    ON CONFLICT DO NOTHING;

    -- D.4: trg_auto_activate_workspace_on_founder ativa o workspace no INSERT acima (sem onboarding)

    INSERT INTO startup_claim_requests
      (user_id, startup_id, workspace_id, status, match_method, user_email, resolved_at, resolved_by)
    VALUES
      (v_user_id, v_match.startup_id, v_match.workspace_id, 'auto_claimed',
       'email_match_imported', v_user_email, now(), v_user_id);
$q$ IN d)=0 OR position($q$  v_request_id UUID;
BEGIN$q$ IN d)=0 THEN RAISE EXCEPTION 'RC12: texto esperado não encontrado em claim_startup'; END IF; d:=replace(d,$q$  v_request_id UUID;
BEGIN$q$,$q$  v_request_id UUID;
  v_ws RECORD;
BEGIN$q$); d:=replace(d,$q$    INSERT INTO workspace_users (workspace_id, user_id, role, active)
    VALUES (v_match.workspace_id, v_user_id, 'founder', true)
    ON CONFLICT DO NOTHING;

    -- D.4: trg_auto_activate_workspace_on_founder ativa o workspace no INSERT acima (sem onboarding)

    INSERT INTO startup_claim_requests
      (user_id, startup_id, workspace_id, status, match_method, user_email, resolved_at, resolved_by)
    VALUES
      (v_user_id, v_match.startup_id, v_match.workspace_id, 'auto_claimed',
       'email_match_imported', v_user_email, now(), v_user_id);
$q$,$q$    -- RC12 claim: todos os workspaces importados da mesma startup (várias edições/programas); uma adesão
    -- desativada antes é reativada (ON CONFLICT DO NOTHING deixava o workspace por ativar e o founder num ciclo)
    FOR v_ws IN
      SELECT w.id AS ws_id FROM workspaces w
       WHERE w.startup_id = v_match.startup_id AND w.status = 'imported_unclaimed'
    LOOP
      INSERT INTO workspace_users (workspace_id, user_id, role, active)
      VALUES (v_ws.ws_id, v_user_id, 'founder', true)
      ON CONFLICT (workspace_id, user_id) DO UPDATE SET active = true, role = 'founder';

      INSERT INTO startup_claim_requests
        (user_id, startup_id, workspace_id, status, match_method, user_email, resolved_at, resolved_by)
      VALUES
        (v_user_id, v_match.startup_id, v_ws.ws_id, 'auto_claimed',
         'email_match_imported', v_user_email, now(), v_user_id);
    END LOOP;
$q$); EXECUTE d; END $$;