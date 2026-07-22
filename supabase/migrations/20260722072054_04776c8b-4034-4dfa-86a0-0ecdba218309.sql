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
  SELECT c.id, c.workspace_id, c.period_month, c.status
    INTO v_cycle
  FROM public.founder_pulse_cycles c
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
       AND p.account_status = 'approved'::public.account_status
  LOOP
    v_cmd := 'pulse:' || v_cycle.id::text || ':' || v_founder.user_id::text || ':in_app';
    v_event_key := 'founder_pulse:' || v_cycle.id::text;

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

    BEGIN
      INSERT INTO public.notification_attempts
        (notification_id, event_key, channel, state, attempt_no, client_command_id, metadata, max_attempts)
      VALUES
        (v_notification_id, v_event_key, 'in_app', 'queued', 0, v_cmd,
         jsonb_build_object('cycle_id', v_cycle.id, 'workspace_id', v_cycle.workspace_id, 'user_id', v_founder.user_id),
         5);
      v_inserted := v_inserted + 1;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  RETURN v_inserted;
END;
$$;