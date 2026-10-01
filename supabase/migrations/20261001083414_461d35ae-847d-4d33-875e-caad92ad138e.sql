-- RC9 Parte 1: P1.1, P1.2, P1.3D, P1.6, P1.7, P1.9, P1.11, P1.12 (por esta ordem)

-- P1.1
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_columns()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.account_status := 'pending';
    RETURN NEW;
  END IF;
  IF NEW.account_status IS DISTINCT FROM OLD.account_status
     OR NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Only administrators can change account_status or email' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_guard_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_guard_profile_privileged_columns
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_privileged_columns();

-- P1.2
DROP POLICY IF EXISTS "Users can view their workspace survey instances" ON public.survey_instances;
CREATE POLICY "Users can view their workspace survey instances"
  ON public.survey_instances FOR SELECT
  USING (
    public.is_staff()
    OR (
      public.has_workspace_access(workspace_id)
      AND EXISTS (
        SELECT 1 FROM public.workspace_users wu
         WHERE wu.workspace_id = survey_instances.workspace_id
           AND wu.user_id = auth.uid()
           AND wu.active = true
           AND wu.role IN ('founder'::public.app_role, 'team_member'::public.app_role)
      )
    )
  );
REVOKE EXECUTE ON FUNCTION public.submit_survey_responses(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;

-- P1.3 D
CREATE OR REPLACE FUNCTION public.tg_session_transcripts_clear_session_copy()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.confidentiality IS DISTINCT FROM 'workspace' THEN
    UPDATE public.sessions s SET raw_transcript = NULL
     WHERE s.id = NEW.session_id AND s.raw_transcript IS NOT NULL
       AND (s.raw_transcript = NEW.transcript_text
            OR (TG_OP = 'UPDATE' AND s.raw_transcript = OLD.transcript_text));
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.tg_session_transcripts_clear_session_copy() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_session_transcripts_clear_session_copy ON public.session_transcripts;
CREATE TRIGGER trg_session_transcripts_clear_session_copy
  AFTER INSERT OR UPDATE OF confidentiality, transcript_text ON public.session_transcripts
  FOR EACH ROW EXECUTE FUNCTION public.tg_session_transcripts_clear_session_copy();
UPDATE public.sessions s SET raw_transcript = NULL
  FROM public.session_transcripts st
 WHERE st.session_id = s.id AND st.confidentiality <> 'workspace'
   AND s.raw_transcript IS NOT DISTINCT FROM st.transcript_text;

-- P1.6
WITH agg AS (
  SELECT user_id, function_name, window_start, SUM(request_count) AS total, MAX(id::text)::uuid AS keep_id
  FROM public.ai_rate_limits WHERE workspace_id IS NULL
  GROUP BY 1,2,3 HAVING COUNT(*) > 1
)
UPDATE public.ai_rate_limits r SET request_count = agg.total FROM agg WHERE r.id = agg.keep_id;
DELETE FROM public.ai_rate_limits r USING public.ai_rate_limits k
 WHERE r.workspace_id IS NULL AND k.workspace_id IS NULL
   AND r.user_id = k.user_id AND r.function_name = k.function_name AND r.window_start = k.window_start
   AND r.id::text < k.id::text;
ALTER TABLE public.ai_rate_limits DROP CONSTRAINT ai_rate_limits_unique_window;
ALTER TABLE public.ai_rate_limits ADD CONSTRAINT ai_rate_limits_unique_window
  UNIQUE NULLS NOT DISTINCT (user_id, workspace_id, function_name, window_start);
CREATE OR REPLACE FUNCTION public.check_ai_rate_limit(_user_id uuid, _workspace_id uuid, _function_name text, _max_requests integer DEFAULT 20)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_window_start timestamptz := date_trunc('hour', now());
  v_current_count integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' AND _user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'check_ai_rate_limit: _user_id must match the caller' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.ai_rate_limits (user_id, workspace_id, function_name, window_start, request_count)
  VALUES (_user_id, _workspace_id, _function_name, v_window_start, 1)
  ON CONFLICT (user_id, workspace_id, function_name, window_start)
  DO UPDATE SET request_count = ai_rate_limits.request_count + 1, updated_at = now()
  RETURNING request_count INTO v_current_count;
  RETURN v_current_count <= _max_requests;
END; $fn$;
REVOKE EXECUTE ON FUNCTION public.check_ai_rate_limit(uuid,uuid,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(uuid,uuid,text,integer) TO authenticated, service_role;

-- P1.7
CREATE OR REPLACE FUNCTION public.sync_funnel_stage_to_contract()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.linked_contract_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN RETURN NEW; END IF;
  IF NEW.stage = 'sent_for_signature' THEN
    UPDATE public.startup_contracts
       SET status = 'pending_signature',
           signature_status = COALESCE(signature_status, 'sent_for_signature'),
           signature_requested_at = COALESCE(signature_requested_at, now())
     WHERE id = NEW.linked_contract_id AND signed_at IS NULL
       AND status NOT IN ('active','terminated','cancelled');
  ELSIF NEW.stage IN ('contracted','incubating') THEN
    UPDATE public.startup_contracts SET status = 'active'
     WHERE id = NEW.linked_contract_id
       AND status IN ('draft','pending_signature')
       AND (signed_at IS NOT NULL OR signature_status IN ('completed','signed'));
  END IF;
  RETURN NEW;
END;
$function$;

-- P1.9
DO $$
DECLARE r record; v_auth boolean; v_srv boolean;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef AND p.prorettype <> 'trigger'::regtype
       AND has_function_privilege('anon', p.oid, 'EXECUTE')
       AND p.proname !~ '^(is_|has_|can_|resolve_canonical|get_canonical|check_signup_allowed|accept_workspace_invitation|touch_public_booking_rate_limit|safe_profiles)'
  LOOP
    v_auth := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    v_srv  := has_function_privilege('service_role', r.oid, 'EXECUTE');
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    IF v_auth THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig); END IF;
    IF v_srv  THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig); END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.get_consultant_time_off(uuid, date, date) FROM anon;
REVOKE ALL ON FUNCTION public.consultant_time_off_blocks(uuid, timestamptz, timestamptz) FROM anon;

-- P1.11
DO $$
DECLARE s text;
BEGIN
  FOREACH s IN ARRAY ARRAY[
    'public.generate_weekly_checkins()',
    'public.commit_import_funnel_item_v2(uuid,uuid,uuid,timestamptz,text,jsonb,jsonb,jsonb,text,text[])',
    'public.admin_commit_crm_import_job(uuid)',
    'public.admin_rollback_crm_import_job(uuid)',
    'public.check_ecosystem_invariants()',
    'public.log_cron_job_run(text,text,integer,text,text,jsonb,text)',
    'public.check_automation_health()',
    'public.check_email_sync_health()',
    'public.reconcile_contract_founders(uuid)',
    'public.open_monthly_founder_pulse_cycles()',
    'public.claim_notification_attempts(text,integer,integer)',
    'public.mark_notification_delivered(uuid,text,jsonb)',
    'public.mark_notification_failed(uuid,text,text,boolean)',
    'public.commit_first_contact_booking_atomic(text,jsonb,jsonb,uuid,uuid,jsonb,jsonb)',
    'public.commit_crm_lead_import_batch_atomic(uuid,uuid[])',
    'public.claim_docusign_envelope(uuid,text)',
    'public.finalize_docusign_envelope(uuid,text,text,text,text,text)',
    'public.release_docusign_envelope_command(uuid,text,text)',
    'public.enqueue_pulse_notifications(uuid)',
    'public.open_and_notify_monthly_founder_pulse_cycles()',
    'public.apply_contract_signature_atomic(uuid,uuid,text,text,uuid,jsonb,text,text,text,text,text)',
    'public.claim_docusign_dispatch_lease(uuid,text,text,integer,text)',
    'public.mark_docusign_dispatch_in_flight(text,text)',
    'public.mark_docusign_dispatch_unknown(text,text,text)',
    'public.finalize_docusign_dispatch_lease(text,text,text)',
    'public.reconcile_docusign_dispatch_lease(text,text,text)',
    'public.anonymize_stale_founder_pulse_responses()',
    'public.claim_first_contact_outbox_batch(integer,integer)',
    'public.mark_first_contact_outbox_completed(uuid)',
    'public.mark_first_contact_outbox_failed(uuid,text,integer)',
    'public.serialize_program_tree(uuid)',
    'public.consume_cron_token(text,text)',
    'public.touch_public_booking_rate_limit(text,text)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', s);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', s);
  END LOOP;
  FOREACH s IN ARRAY ARRAY[
    'public.cleanup_old_rate_limits()',
    'public.issue_cron_token(text)',
    'public.cron_invoke_edge(text,jsonb)',
    'public.cron_invoke_rpc(text,text)'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', s);
  END LOOP;
END $$;

-- P1.12
CREATE OR REPLACE FUNCTION public.sync_assigned_consultor_to_members()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.assigned_consultor_id IS DISTINCT FROM NEW.assigned_consultor_id THEN
    IF OLD.assigned_consultor_id IS NOT NULL THEN
      UPDATE public.workspace_users SET active = false
       WHERE workspace_id = NEW.id AND user_id = OLD.assigned_consultor_id AND role = 'consultor';
    END IF;
  END IF;
  IF NEW.assigned_consultor_id IS NOT NULL
     AND (public.has_role(NEW.assigned_consultor_id, 'consultor'::public.app_role)
          OR public.has_role(NEW.assigned_consultor_id, 'admin'::public.app_role)) THEN
    INSERT INTO public.workspace_users (workspace_id, user_id, role, active)
    VALUES (NEW.id, NEW.assigned_consultor_id, 'consultor', true)
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET active = true, role = 'consultor';
  END IF;
  RETURN NEW;
END; $fn$;
DROP POLICY IF EXISTS "Founders can create pending workspaces" ON public.workspaces;
DROP POLICY IF EXISTS "Founders can add themselves to pending workspaces" ON public.workspace_users;