-- Batch D — Monthly Founder Pulse OFF-first guardrails
BEGIN;

CREATE OR REPLACE FUNCTION public.is_feature_flag_enabled(p_key TEXT)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT enabled FROM public.feature_flags WHERE key = p_key AND scope = 'global' LIMIT 1), false);
$$;
REVOKE ALL ON FUNCTION public.is_feature_flag_enabled(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_feature_flag_enabled(TEXT) TO service_role, authenticated;

INSERT INTO public.feature_flags (key, enabled, scope, description)
SELECT 'founder_monthly_pulse', false, 'global', 'Monthly Founder Pulse — kill switch. OFF by default.'
WHERE NOT EXISTS (SELECT 1 FROM public.feature_flags WHERE key = 'founder_monthly_pulse' AND scope = 'global');

CREATE OR REPLACE FUNCTION public.open_and_notify_monthly_founder_pulse_cycles()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_opened INT := 0; v_enqueued_total INT := 0; v_delta INT; v_cycle RECORD;
BEGIN
  IF NOT public.is_feature_flag_enabled('founder_monthly_pulse') THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'flag_off', 'opened', 0, 'enqueued', 0);
  END IF;
  v_opened := public.open_monthly_founder_pulse_cycles();
  FOR v_cycle IN SELECT id FROM public.founder_pulse_cycles WHERE status = 'open' AND period_month = date_trunc('month', now())::date LOOP
    v_delta := public.enqueue_pulse_notifications(v_cycle.id);
    v_enqueued_total := v_enqueued_total + COALESCE(v_delta, 0);
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'opened', v_opened, 'enqueued', v_enqueued_total, 'period_month', to_char(date_trunc('month', now())::date, 'YYYY-MM-DD'));
END; $$;
REVOKE ALL ON FUNCTION public.open_and_notify_monthly_founder_pulse_cycles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_and_notify_monthly_founder_pulse_cycles() TO service_role;

CREATE OR REPLACE FUNCTION public.open_monthly_founder_pulse_cycles()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inserted INTEGER := 0;
BEGIN
  IF NOT public.is_feature_flag_enabled('founder_monthly_pulse') THEN RETURN 0; END IF;
  INSERT INTO public.founder_pulse_cycles (workspace_id, period_month, status)
  SELECT w.id, date_trunc('month', now())::date, 'open' FROM public.workspaces w WHERE w.status = 'active'
  ON CONFLICT (workspace_id, period_month) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END; $$;

CREATE OR REPLACE FUNCTION public.enqueue_pulse_notifications(p_cycle_id UUID)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cycle RECORD; v_founder RECORD; v_cmd TEXT; v_event_key TEXT; v_notification_id UUID; v_inserted INTEGER := 0;
BEGIN
  IF NOT public.is_feature_flag_enabled('founder_monthly_pulse') THEN RETURN 0; END IF;
  SELECT c.id, c.workspace_id, c.period_month, c.status INTO v_cycle FROM public.founder_pulse_cycles c WHERE c.id = p_cycle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'cycle not found: %', p_cycle_id USING ERRCODE = 'P0002'; END IF;
  IF v_cycle.status <> 'open' THEN RETURN 0; END IF;
  FOR v_founder IN
    SELECT wu.user_id FROM public.workspace_users wu
    JOIN public.profiles p ON p.id = wu.user_id
    WHERE wu.workspace_id = v_cycle.workspace_id AND wu.active = true AND wu.role = 'founder'
      AND p.account_status = 'approved'::public.account_status
      AND public.is_account_active(wu.user_id) = true
  LOOP
    v_cmd := 'pulse:' || v_cycle.id::text || ':' || v_founder.user_id::text || ':in_app';
    v_event_key := 'founder_pulse:' || v_cycle.id::text;
    INSERT INTO public.notifications (user_id, type, title, message, link, event_key, entity_type, entity_id, metadata)
    VALUES (v_founder.user_id, 'founder_pulse', 'Pulse mensal disponível', 'Partilha rapidamente o teu estado deste mês.',
      '/dashboard?pulse=' || v_cycle.id::text, v_event_key, 'founder_pulse_cycle', v_cycle.id,
      jsonb_build_object('workspace_id', v_cycle.workspace_id, 'period_month', v_cycle.period_month))
    ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO UPDATE SET metadata = EXCLUDED.metadata
    RETURNING id INTO v_notification_id;
    BEGIN
      INSERT INTO public.notification_attempts (notification_id, event_key, channel, state, client_command_id, metadata, max_attempts)
      VALUES (v_notification_id, v_event_key, 'in_app', 'queued', v_cmd,
        jsonb_build_object('cycle_id', v_cycle.id, 'workspace_id', v_cycle.workspace_id, 'user_id', v_founder.user_id), 5);
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN NULL; END;
  END LOOP;
  RETURN v_inserted;
END; $$;
REVOKE ALL ON FUNCTION public.enqueue_pulse_notifications(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_pulse_notifications(UUID) TO service_role;

ALTER TABLE public.notification_attempts
  ADD COLUMN IF NOT EXISTS pulse_cycle_id UUID GENERATED ALWAYS AS ((metadata->>'cycle_id')::uuid) STORED,
  ADD COLUMN IF NOT EXISTS pulse_workspace_id UUID GENERATED ALWAYS AS ((metadata->>'workspace_id')::uuid) STORED,
  ADD COLUMN IF NOT EXISTS pulse_respondent_id UUID GENERATED ALWAYS AS ((metadata->>'user_id')::uuid) STORED;

CREATE UNIQUE INDEX IF NOT EXISTS notification_attempts_pulse_dedup_uidx
  ON public.notification_attempts (pulse_cycle_id, pulse_workspace_id, pulse_respondent_id, channel)
  WHERE event_key LIKE 'founder_pulse:%';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_attempts_state_chk' AND conrelid = 'public.notification_attempts'::regclass) THEN
    ALTER TABLE public.notification_attempts ADD CONSTRAINT notification_attempts_state_chk
      CHECK (state IN ('queued','leased','delivered','failed_retryable','failed_terminal')) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.anonymize_stale_founder_pulse_responses()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_affected INTEGER := 0;
BEGIN
  UPDATE public.founder_pulse_responses
     SET respondent_id = NULL, free_text = NULL,
         metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('anonymized_at', now())
   WHERE submitted_at < now() - interval '18 months' AND respondent_id IS NOT NULL;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END; $$;
REVOKE ALL ON FUNCTION public.anonymize_stale_founder_pulse_responses() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_stale_founder_pulse_responses() TO service_role;

COMMIT;