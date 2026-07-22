-- Batch E: pulse messaging outbox
-- 1) Idempotency: ensure a single active attempt per client_command_id
DROP INDEX IF EXISTS public.notification_attempts_cmd_idx;
CREATE UNIQUE INDEX IF NOT EXISTS notification_attempts_cmd_uidx
  ON public.notification_attempts (client_command_id)
  WHERE client_command_id IS NOT NULL;

-- 2) Enqueue pulse notifications for a given cycle
CREATE OR REPLACE FUNCTION public.enqueue_pulse_notifications(p_cycle_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cycle RECORD;
  v_founder RECORD;
  v_cmd text;
  v_event_key text;
  v_notification_id uuid;
  v_inserted integer := 0;
BEGIN
  SELECT c.id, c.workspace_id, c.period_month, c.status, w.name AS workspace_name
    INTO v_cycle
  FROM public.founder_pulse_cycles c
  JOIN public.workspaces w ON w.id = c.workspace_id
  WHERE c.id = p_cycle_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'cycle not found: %', p_cycle_id USING ERRCODE = 'P0002';
  END IF;

  IF v_cycle.status <> 'open' THEN
    RETURN 0;
  END IF;

  FOR v_founder IN
    SELECT wu.user_id
      FROM public.workspace_users wu
      JOIN public.profiles p ON p.id = wu.user_id
     WHERE wu.workspace_id = v_cycle.workspace_id
       AND wu.active = true
       AND wu.role = 'founder'
       AND COALESCE(p.account_status::text, 'pending') = 'active'
  LOOP
    v_cmd := 'pulse:' || v_cycle.id::text || ':' || v_founder.user_id::text || ':in_app';
    v_event_key := 'founder_pulse:' || v_cycle.id::text;

    -- Upsert notification row (dedup by user_id+event_key partial unique)
    INSERT INTO public.notifications (user_id, type, title, message, link, event_key, entity_type, entity_id, metadata)
    VALUES (
      v_founder.user_id,
      'founder_pulse',
      'Pulse mensal disponível',
      'Partilha rapidamente o teu estado deste mês.',
      '/dashboard?pulse=' || v_cycle.id::text,
      v_event_key,
      'founder_pulse_cycle',
      v_cycle.id,
      jsonb_build_object('workspace_id', v_cycle.workspace_id, 'period_month', v_cycle.period_month)
    )
    ON CONFLICT (user_id, event_key) WHERE event_key IS NOT NULL DO UPDATE
      SET metadata = EXCLUDED.metadata
    RETURNING id INTO v_notification_id;

    -- Enqueue outbox attempt (unique on client_command_id → idempotent)
    BEGIN
      INSERT INTO public.notification_attempts
        (notification_id, event_key, channel, state, client_command_id, metadata, max_attempts)
      VALUES
        (v_notification_id, v_event_key, 'in_app', 'queued', v_cmd,
         jsonb_build_object('cycle_id', v_cycle.id, 'workspace_id', v_cycle.workspace_id, 'user_id', v_founder.user_id),
         5);
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      -- already enqueued; treat as idempotent no-op
      NULL;
    END;
  END LOOP;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_pulse_notifications(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_pulse_notifications(uuid) TO service_role;

-- 3) Combined cron entrypoint: open cycles + enqueue notifications for every open cycle in current month
CREATE OR REPLACE FUNCTION public.open_and_notify_monthly_founder_pulse_cycles()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month date := date_trunc('month', now())::date;
  v_opened integer := 0;
  v_enqueued integer := 0;
  v_cycle RECORD;
  v_delta integer;
BEGIN
  v_opened := public.open_monthly_founder_pulse_cycles();

  FOR v_cycle IN
    SELECT id
      FROM public.founder_pulse_cycles
     WHERE period_month = v_month
       AND status = 'open'
  LOOP
    v_delta := public.enqueue_pulse_notifications(v_cycle.id);
    v_enqueued := v_enqueued + COALESCE(v_delta, 0);
  END LOOP;

  RETURN jsonb_build_object('opened', v_opened, 'enqueued', v_enqueued, 'period_month', v_month);
END;
$$;

REVOKE ALL ON FUNCTION public.open_and_notify_monthly_founder_pulse_cycles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.open_and_notify_monthly_founder_pulse_cycles() TO service_role;