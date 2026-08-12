-- 1) Atomic public booking rate-limit counter (service-role only)
CREATE OR REPLACE FUNCTION public.touch_public_booking_rate_limit(
  p_email text,
  p_ip_hash text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bucket timestamptz := date_trunc('hour', now());
  v_hour integer;
  v_day integer;
BEGIN
  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'email_required';
  END IF;

  INSERT INTO public.public_booking_rate_limits
    (email_normalized, ip_hash, bucket_start, attempts, last_attempt_at)
  VALUES (lower(btrim(p_email)), p_ip_hash, v_bucket, 1, now())
  ON CONFLICT (email_normalized, bucket_start)
  DO UPDATE SET
    attempts = public.public_booking_rate_limits.attempts + 1,
    last_attempt_at = now(),
    ip_hash = COALESCE(EXCLUDED.ip_hash, public.public_booking_rate_limits.ip_hash)
  RETURNING attempts INTO v_hour;

  SELECT COALESCE(SUM(attempts), 0) INTO v_day
    FROM public.public_booking_rate_limits
   WHERE email_normalized = lower(btrim(p_email))
     AND bucket_start >= now() - interval '24 hours';

  RETURN jsonb_build_object('hour_attempts', v_hour, 'day_attempts', v_day);
END; $$;

REVOKE ALL ON FUNCTION public.touch_public_booking_rate_limit(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.touch_public_booking_rate_limit(text, text) TO service_role;

-- 2) Staff-only contract event notifier (bypasses per-row read limits safely)
CREATE OR REPLACE FUNCTION public.notify_contract_event(
  p_contract_id uuid,
  p_event_type text,
  p_staff_title text,
  p_staff_message text,
  p_founder_title text,
  p_founder_message text,
  p_founder_link text DEFAULT '/workspace',
  p_staff_link text DEFAULT '/admin?tab=backoffice&subtab=contracts'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace uuid;
  v_count integer := 0;
BEGIN
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF p_event_type IS NULL OR btrim(p_event_type) = '' THEN
    RAISE EXCEPTION 'event_type_required';
  END IF;

  SELECT workspace_id INTO v_workspace
    FROM public.startup_contracts WHERE id = p_contract_id;

  INSERT INTO public.notifications
    (user_id, type, title, message, entity_type, entity_id, link, read)
  SELECT DISTINCT ur.user_id, p_event_type, p_staff_title, p_staff_message,
         'contract', p_contract_id, p_staff_link, false
    FROM public.user_roles ur
   WHERE ur.role IN ('admin', 'consultor', 'backoffice');
  v_count := v_count + COALESCE((SELECT count(*)::int FROM public.user_roles WHERE role IN ('admin','consultor','backoffice')), 0);

  IF v_workspace IS NOT NULL THEN
    INSERT INTO public.notifications
      (user_id, type, title, message, entity_type, entity_id, link, read)
    SELECT DISTINCT wu.user_id, p_event_type, p_founder_title, p_founder_message,
           'contract', p_contract_id, p_founder_link, false
      FROM public.workspace_users wu
     WHERE wu.workspace_id = v_workspace
       AND wu.active = true
       AND wu.role = 'founder';
  END IF;

  RETURN v_count;
END; $$;

REVOKE ALL ON FUNCTION public.notify_contract_event(uuid, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notify_contract_event(uuid, text, text, text, text, text, text, text) TO authenticated, service_role;