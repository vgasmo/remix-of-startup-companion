
DROP FUNCTION IF EXISTS public.check_automation_health();
DROP FUNCTION IF EXISTS public.check_email_sync_health();
DROP FUNCTION IF EXISTS public.approve_user_account(uuid);

-- 1) staff_transfer_workspace_program
CREATE OR REPLACE FUNCTION public.staff_transfer_workspace_program(
  p_workspace_id uuid, p_target_program_id uuid, p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_staff boolean;
  v_ws public.workspaces%ROWTYPE;
  v_target public.programs%ROWTYPE;
  v_source public.programs%ROWTYPE;
  v_sessions_count int := 0;
  v_actions_count int := 0;
  v_kpis_count int := 0;
  v_milestones_archived int := 0;
  v_milestones_kept int := 0;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE='42501'; END IF;
  SELECT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'consultor')) INTO v_is_staff;
  IF NOT v_is_staff THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;

  SELECT * INTO v_ws FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF v_ws IS NULL THEN RAISE EXCEPTION 'workspace_not_found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_target FROM public.programs WHERE id = p_target_program_id;
  IF v_target IS NULL THEN RAISE EXCEPTION 'target_program_not_found' USING ERRCODE='P0002'; END IF;
  IF v_target.is_active = false THEN RAISE EXCEPTION 'target_program_inactive' USING ERRCODE='P0001'; END IF;
  SELECT * INTO v_source FROM public.programs WHERE id = v_ws.program_id;

  IF v_ws.program_id = p_target_program_id THEN
    RETURN jsonb_build_object('action','noop','reason','already_in_target_program',
      'workspace_id',p_workspace_id,'program_id',p_target_program_id);
  END IF;

  SELECT COUNT(*) INTO v_sessions_count FROM public.sessions WHERE workspace_id = p_workspace_id;
  SELECT COUNT(*) INTO v_actions_count FROM public.action_items WHERE workspace_id = p_workspace_id;
  SELECT COUNT(*) INTO v_kpis_count FROM public.workspace_kpis WHERE workspace_id = p_workspace_id;

  SELECT COUNT(*) INTO v_milestones_archived
    FROM public.milestones m JOIN public.program_gates g ON g.id = m.source_gate_id
   WHERE m.workspace_id = p_workspace_id AND g.program_id = v_ws.program_id;
  SELECT COUNT(*) INTO v_milestones_kept
    FROM public.milestones m LEFT JOIN public.program_gates g ON g.id = m.source_gate_id
   WHERE m.workspace_id = p_workspace_id AND (g.program_id IS NULL OR g.program_id <> v_ws.program_id);

  v_result := jsonb_build_object(
    'workspace_id',p_workspace_id,
    'from_program',jsonb_build_object('id',v_ws.program_id,'name',v_source.name,'type',v_source.program_type),
    'to_program',jsonb_build_object('id',p_target_program_id,'name',v_target.name,'type',v_target.program_type),
    'impact',jsonb_build_object(
      'sessions_preserved',v_sessions_count,'actions_preserved',v_actions_count,
      'kpis_preserved',v_kpis_count,'milestones_kept',v_milestones_kept,
      'milestones_archived',v_milestones_archived),
    'stage_reset',true,
    'current_week_reset',(v_target.program_type='acceleration'));
  IF p_dry_run THEN RETURN v_result || jsonb_build_object('action','preview'); END IF;

  UPDATE public.workspaces SET program_id = p_target_program_id, stage_id = NULL,
    current_week = CASE WHEN v_target.program_type='acceleration' THEN 1 ELSE NULL END,
    updated_at = now()
   WHERE id = p_workspace_id;

  UPDATE public.milestones m SET archived_at = now()
    FROM public.program_gates g
   WHERE m.source_gate_id = g.id AND m.workspace_id = p_workspace_id
     AND g.program_id = v_ws.program_id AND m.archived_at IS NULL;

  INSERT INTO public.activity_log(workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (p_workspace_id, v_uid, 'workspace.program_transferred', 'workspace', p_workspace_id, v_result);
  RETURN v_result || jsonb_build_object('action','committed');
END; $$;

-- 2) staff_diagnose_program_mismatches
CREATE OR REPLACE FUNCTION public.staff_diagnose_program_mismatches()
RETURNS TABLE (workspace_id uuid, startup_id uuid, startup_name text,
  current_program_id uuid, current_program_name text,
  contract_program_id uuid, contract_program_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'consultor')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE='42501';
  END IF;
  RETURN;
END; $$;

-- 3) Backfill session_transcripts confidentiality
UPDATE public.session_transcripts SET confidentiality='workspace'
 WHERE confidentiality='staff_only';

-- 4) Backoffice notifications INSERT
DROP POLICY IF EXISTS "Backoffice can insert notifications" ON public.notifications;
CREATE POLICY "Backoffice can insert notifications"
  ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'backoffice'));

-- 5) Drop duplicate CRM stage_change trigger
DROP TRIGGER IF EXISTS trg_funnel_items_log_stage_change ON public.funnel_items;

-- 6) Fix check_automation_health
CREATE FUNCTION public.check_automation_health() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row record;
  v_thresholds jsonb := jsonb_build_object('automation-engine',90,'sweep-session-transcripts',45);
  v_max_lag int; v_dedupe text;
BEGIN
  FOR v_row IN
    SELECT job_name,
           MAX(started_at) FILTER (WHERE status='ok') AS last_ok,
           MAX(started_at) FILTER (WHERE status='error') AS last_error,
           COUNT(*) FILTER (WHERE status='error' AND started_at > now() - interval '24 hours') AS errors_24h
      FROM public.cron_job_runs
     WHERE started_at > now() - interval '48 hours'
     GROUP BY job_name
  LOOP
    v_max_lag := COALESCE((v_thresholds->>v_row.job_name)::int, 120);
    IF v_row.last_ok IS NULL OR v_row.last_ok < now() - make_interval(mins => v_max_lag) THEN
      v_dedupe := 'cron_stale:'||v_row.job_name||':'||to_char(now(),'YYYY-MM-DD-HH24');
      INSERT INTO public.system_alerts(kind,severity,dedupe_key,payload)
      VALUES('cron_stale','warning',v_dedupe,
        jsonb_build_object('job',v_row.job_name,'last_ok',v_row.last_ok,'last_error',v_row.last_error))
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
    IF v_row.errors_24h >= 3 THEN
      v_dedupe := 'cron_errors:'||v_row.job_name||':'||to_char(now(),'YYYY-MM-DD');
      INSERT INTO public.system_alerts(kind,severity,dedupe_key,payload)
      VALUES('cron_errors','critical',v_dedupe,
        jsonb_build_object('job',v_row.job_name,'errors_24h',v_row.errors_24h))
      ON CONFLICT (dedupe_key) DO NOTHING;
    END IF;
  END LOOP;
END; $$;

-- 7) Fix check_email_sync_health severity mapping
CREATE FUNCTION public.check_email_sync_health() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_stale int; v_flapping int;
BEGIN
  SELECT COUNT(*) INTO v_stale FROM public.email_sync_status
   WHERE last_success_at IS NOT NULL AND last_success_at < now() - interval '2 hours';
  IF v_stale > 0 THEN
    INSERT INTO public.system_alerts(kind,severity,dedupe_key,payload)
    VALUES('email_sync_stale','critical','email_sync_stale:'||to_char(now(),'YYYY-MM-DD-HH24'),
      jsonb_build_object('stale_count',v_stale))
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  SELECT COUNT(*) INTO v_flapping FROM public.email_sync_runs
   WHERE started_at > now() - interval '1 hour' AND status='error';
  IF v_flapping >= 3 THEN
    INSERT INTO public.system_alerts(kind,severity,dedupe_key,payload)
    VALUES('email_sync_flapping','warning','email_sync_flap:'||to_char(now(),'YYYY-MM-DD-HH24'),
      jsonb_build_object('errors_last_hour',v_flapping))
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
END; $$;

-- 8) approve_user_account -> boolean
CREATE FUNCTION public.approve_user_account(p_user_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role='admin') THEN
    RAISE EXCEPTION 'Only admins can approve user accounts';
  END IF;
  UPDATE public.profiles SET account_status='approved', updated_at=now() WHERE id = p_user_id;
  INSERT INTO public.activity_log(user_id,entity_type,entity_id,action,metadata)
  VALUES(auth.uid(),'profile',p_user_id,'account_approved',jsonb_build_object('approved_user_id',p_user_id));
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.approve_user_account(uuid) TO authenticated;
