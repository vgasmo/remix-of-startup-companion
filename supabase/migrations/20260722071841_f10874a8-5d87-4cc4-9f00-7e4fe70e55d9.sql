-- Fix enum mismatch: account_status has values pending/approved/suspended
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
        (notification_id, event_key, channel, state, client_command_id, metadata, max_attempts)
      VALUES
        (v_notification_id, v_event_key, 'in_app', 'queued', v_cmd,
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

-- Fix harness to use correct enum values
CREATE OR REPLACE FUNCTION public.rc5_run_batch_e()
RETURNS TABLE(scenario text, got text, expected text, ok boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_program_id   uuid;
  v_startup_id   uuid;
  v_workspace_id uuid;
  v_cycle_id     uuid;

  founder_a uuid := gen_random_uuid();
  founder_b uuid := gen_random_uuid();
  founder_pend uuid := gen_random_uuid();

  v_enqueued int;
  v_enqueued2 int;
  v_attempt_a uuid;
  v_attempt_b uuid;
  v_state text;
  v_attempt_no int;
  v_lease_owner text;
  v_delivered_at timestamptz;
  v_now timestamptz;
  v_row public.notification_attempts%ROWTYPE;
BEGIN
  BEGIN
    INSERT INTO auth.users(id, email) VALUES
      (founder_a,    'e_a@rc5-e.test'),
      (founder_b,    'e_b@rc5-e.test'),
      (founder_pend, 'e_p@rc5-e.test');
    INSERT INTO public.profiles(id, email, full_name, account_status)
    VALUES
      (founder_a,    'e_a@rc5-e.test', 'Founder A', 'approved'),
      (founder_b,    'e_b@rc5-e.test', 'Founder B', 'approved'),
      (founder_pend, 'e_p@rc5-e.test', 'Founder P', 'pending')
    ON CONFLICT (id) DO UPDATE SET account_status = EXCLUDED.account_status;

    INSERT INTO public.incubation_types(name, code, program_type)
    VALUES ('RC5-E prog', 'rc5e', 'incubation')
    RETURNING id INTO v_program_id;

    INSERT INTO public.startups(name, stage) VALUES ('RC5-E Startup', 'ideation')
    RETURNING id INTO v_startup_id;

    INSERT INTO public.workspaces(name, startup_id, incubation_type_id, status, created_by)
    VALUES ('RC5-E WS', v_startup_id, v_program_id, 'active', founder_a)
    RETURNING id INTO v_workspace_id;

    INSERT INTO public.workspace_users(workspace_id, user_id, role, active) VALUES
      (v_workspace_id, founder_a,    'founder', true),
      (v_workspace_id, founder_b,    'founder', true),
      (v_workspace_id, founder_pend, 'founder', true);

    INSERT INTO public.founder_pulse_cycles(workspace_id, period_month, status)
    VALUES (v_workspace_id, date_trunc('month', now())::date, 'open')
    RETURNING id INTO v_cycle_id;

    v_enqueued := public.enqueue_pulse_notifications(v_cycle_id);
    scenario := 'E1_enqueue_active_founders'; got := v_enqueued::text; expected := '2';
    ok := got = expected; RETURN NEXT;

    SELECT COUNT(*)::text INTO got
    FROM public.notification_attempts
    WHERE metadata->>'user_id' = founder_pend::text
      AND client_command_id LIKE 'pulse:' || v_cycle_id::text || ':%';
    scenario := 'E2_pending_founder_skipped'; expected := '0'; ok := got = expected; RETURN NEXT;

    v_enqueued2 := public.enqueue_pulse_notifications(v_cycle_id);
    scenario := 'E3_idempotent_reenqueue'; got := v_enqueued2::text; expected := '0'; ok := got = expected; RETURN NEXT;

    SELECT id INTO v_attempt_a FROM public.notification_attempts
      WHERE metadata->>'user_id' = founder_a::text
        AND client_command_id LIKE 'pulse:' || v_cycle_id::text || ':%';
    SELECT id INTO v_attempt_b FROM public.notification_attempts
      WHERE metadata->>'user_id' = founder_b::text
        AND client_command_id LIKE 'pulse:' || v_cycle_id::text || ':%';

    PERFORM public.claim_notification_attempts('rc5-e-worker', 120, 25);
    SELECT state, attempt_no, lease_owner INTO v_state, v_attempt_no, v_lease_owner
    FROM public.notification_attempts WHERE id = v_attempt_a;
    scenario := 'E4_claim_leases_row';
    got := v_state || '|' || v_attempt_no::text || '|' || v_lease_owner;
    expected := 'leased|1|rc5-e-worker';
    ok := got = expected; RETURN NEXT;

    PERFORM public.mark_notification_delivered(v_attempt_a, 'provider-msg-1', jsonb_build_object('ok', true));
    SELECT state, delivered_at INTO v_state, v_delivered_at
    FROM public.notification_attempts WHERE id = v_attempt_a;
    scenario := 'E5_mark_delivered';
    got := v_state || '|' || (v_delivered_at IS NOT NULL)::text;
    expected := 'delivered|true';
    ok := got = expected; RETURN NEXT;

    v_now := now();
    PERFORM public.mark_notification_failed(v_attempt_b, 'transient', 'boom', true);
    SELECT * INTO v_row FROM public.notification_attempts WHERE id = v_attempt_b;
    scenario := 'E6_mark_failed_retryable';
    got := v_row.state || '|' || (v_row.next_attempt_at > v_now)::text || '|' || (v_row.lease_owner IS NULL)::text;
    expected := 'failed_retryable|true|true';
    ok := got = expected; RETURN NEXT;

    UPDATE public.notification_attempts
       SET state = 'leased',
           lease_owner = 'ghost',
           lease_expires_at = now() - interval '5 minutes',
           next_attempt_at = now() - interval '1 second'
     WHERE id = v_attempt_b;
    PERFORM public.claim_notification_attempts('rc5-e-worker-2', 60, 25);
    SELECT state, lease_owner INTO v_state, v_lease_owner
      FROM public.notification_attempts WHERE id = v_attempt_b;
    scenario := 'E7_expired_lease_reclaimed';
    got := v_state || '|' || v_lease_owner;
    expected := 'leased|rc5-e-worker-2';
    ok := got = expected; RETURN NEXT;

    UPDATE public.notification_attempts
       SET attempt_no = max_attempts, state = 'leased'
     WHERE id = v_attempt_b;
    PERFORM public.mark_notification_failed(v_attempt_b, 'boom', 'exhausted', true);
    SELECT state, failed_at INTO v_state, v_delivered_at
      FROM public.notification_attempts WHERE id = v_attempt_b;
    scenario := 'E8_terminal_after_max_attempts';
    got := v_state || '|' || (v_delivered_at IS NOT NULL)::text;
    expected := 'failed_terminal|true';
    ok := got = expected; RETURN NEXT;

    RAISE EXCEPTION 'RC5_BATCH_E_ROLLBACK_SENTINEL';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'RC5_BATCH_E_ROLLBACK_SENTINEL' THEN
      RETURN;
    ELSE
      RAISE;
    END IF;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.rc5_run_batch_e() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rc5_run_batch_e() TO service_role;