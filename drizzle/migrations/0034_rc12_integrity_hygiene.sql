-- RC12 (sql_db) · DBP-10, DBP-11, DBP-12 — higiene de integridade (idempotente).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['investors','funding_rounds','cap_table_entries','workflow_rules','saved_filters','stage_gate_criteria','health_model_templates','contract_notices','crm_import_conflicts','crm_lead_import_batches','contract_field_ownership']
  LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=t AND column_name='updated_at')
       AND to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
      EXECUTE format('CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
    END IF;
  END LOOP;
END $$;
DO $$
BEGIN
  IF to_regclass('public.mentor_connections') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'mentor_connections_workspace_id_fkey' AND conrelid = 'public.mentor_connections'::regclass) THEN
      ALTER TABLE public.mentor_connections ADD CONSTRAINT mentor_connections_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE NOT VALID;
    END IF;
    CREATE INDEX IF NOT EXISTS idx_mentor_connections_workspace_id ON public.mentor_connections (workspace_id) WHERE workspace_id IS NOT NULL;
  END IF;
  IF to_regclass('public.sessions') IS NOT NULL AND to_regclass('public.session_templates') IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sessions_session_template_id_fkey' AND conrelid = 'public.sessions'::regclass) THEN
      ALTER TABLE public.sessions ADD CONSTRAINT sessions_session_template_id_fkey FOREIGN KEY (session_template_id) REFERENCES public.session_templates(id) ON DELETE SET NULL NOT VALID;
    END IF;
    CREATE INDEX IF NOT EXISTS idx_sessions_session_template_id ON public.sessions (session_template_id) WHERE session_template_id IS NOT NULL;
  END IF;
END $$;
-- Cloud: do not introduce new application FKs to auth.users; use the existing profile identity instead.
DO $$
BEGIN
  IF to_regclass('public.survey_writebacks') IS NOT NULL AND EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'survey_writebacks_applied_by_fkey' AND conrelid = 'public.survey_writebacks'::regclass AND confdeltype = 'a') THEN
    ALTER TABLE public.survey_writebacks DROP CONSTRAINT survey_writebacks_applied_by_fkey;
    ALTER TABLE public.survey_writebacks ADD CONSTRAINT survey_writebacks_applied_by_fkey FOREIGN KEY (applied_by) REFERENCES public.profiles(id) ON DELETE SET NULL NOT VALID;
  END IF;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_created_role' AND NOT tgisinternal)
     AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'auth.users'::regclass AND tgname = 'on_auth_user_created_assign_role' AND NOT tgisinternal) THEN
    DROP TRIGGER on_auth_user_created_assign_role ON auth.users;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'rc12: sem permissao para alterar triggers em auth.users; on_auth_user_created_assign_role mantido';
END $$;