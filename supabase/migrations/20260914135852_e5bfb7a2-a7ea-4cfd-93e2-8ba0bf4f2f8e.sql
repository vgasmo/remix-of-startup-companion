CREATE TABLE IF NOT EXISTS public.consultant_time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  consultant_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  all_day boolean NOT NULL DEFAULT false,
  reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consultant_time_off_range_valid CHECK (ends_at > starts_at)
);

CREATE INDEX IF NOT EXISTS idx_consultant_time_off_consultant_range
  ON public.consultant_time_off (consultant_id, starts_at, ends_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.consultant_time_off TO authenticated;
GRANT ALL ON public.consultant_time_off TO service_role;

ALTER TABLE public.consultant_time_off ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own time off manage"
  ON public.consultant_time_off FOR ALL
  TO authenticated
  USING (consultant_id = auth.uid())
  WITH CHECK (consultant_id = auth.uid());

CREATE POLICY "Staff manage all time off"
  ON public.consultant_time_off FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'backoffice'));

CREATE TRIGGER trg_consultant_time_off_updated_at
  BEFORE UPDATE ON public.consultant_time_off
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Read-only, PII-free window used by booking pickers (no reason exposed).
CREATE OR REPLACE FUNCTION public.get_consultant_time_off(p_consultant_id uuid, p_from date, p_to date)
RETURNS TABLE(starts_at timestamptz, ends_at timestamptz, all_day boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.starts_at, t.ends_at, t.all_day
    FROM public.consultant_time_off t
   WHERE t.consultant_id = p_consultant_id
     AND t.ends_at >= p_from::timestamptz
     AND t.starts_at < (p_to::timestamptz + interval '1 day');
$$;

REVOKE ALL ON FUNCTION public.get_consultant_time_off(uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_consultant_time_off(uuid, date, date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consultant_time_off_blocks(p_consultant_id uuid, p_start timestamptz, p_end timestamptz)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.consultant_time_off t
     WHERE t.consultant_id = p_consultant_id
       AND t.starts_at < p_end
       AND t.ends_at > p_start
  );
$$;

REVOKE ALL ON FUNCTION public.consultant_time_off_blocks(uuid, timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consultant_time_off_blocks(uuid, timestamptz, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_mentor_booking_idempotent(p_mentor_id uuid, p_workspace_id uuid, p_requested_date date, p_requested_start_time time without time zone, p_requested_end_time time without time zone, p_message text, p_idempotency_key text)
 RETURNS mentor_bookings
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.mentor_bookings;
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_is_staff boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RAISE EXCEPTION 'idempotency_key required (>=8 chars)' USING ERRCODE = '22023';
  END IF;

  -- Fast path: return existing row for this key
  SELECT * INTO v_row
    FROM public.mentor_bookings
   WHERE founder_id = v_uid AND idempotency_key = p_idempotency_key
   LIMIT 1;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  -- Slot dedupe: if an active (pending/accepted) booking exists for the same
  -- (mentor, founder, date, start), return it instead of creating a duplicate.
  SELECT * INTO v_row
    FROM public.mentor_bookings
   WHERE mentor_id = p_mentor_id
     AND founder_id = v_uid
     AND requested_date = p_requested_date
     AND requested_start_time = p_requested_start_time
     AND status IN ('pending', 'accepted')
   LIMIT 1;
  IF FOUND THEN
    RETURN v_row;
  END IF;

  -- 24h minimum notice for founders (Europe/Lisbon wall clock).
  -- Staff (admin/consultor/backoffice) may book with shorter notice.
  v_start_ts := (p_requested_date::text || ' ' || p_requested_start_time::text)::timestamp
                AT TIME ZONE 'Europe/Lisbon';
  v_end_ts := (p_requested_date::text || ' ' || p_requested_end_time::text)::timestamp
                AT TIME ZONE 'Europe/Lisbon';
  v_is_staff := public.has_role(v_uid, 'admin')
             OR public.has_role(v_uid, 'consultor')
             OR public.has_role(v_uid, 'backoffice');
  IF NOT v_is_staff AND v_start_ts < now() + interval '24 hours' THEN
    RAISE EXCEPTION 'bookings require at least 24 hours notice' USING ERRCODE = '22023';
  END IF;

  -- Blocked periods declared by the mentor/consultant are hard-closed for everyone.
  IF public.consultant_time_off_blocks(p_mentor_id, v_start_ts, v_end_ts) THEN
    RAISE EXCEPTION 'consultant is unavailable in this period' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.mentor_bookings (
    mentor_id, founder_id, workspace_id,
    requested_date, requested_start_time, requested_end_time,
    message, status, idempotency_key
  ) VALUES (
    p_mentor_id, v_uid, p_workspace_id,
    p_requested_date, p_requested_start_time, p_requested_end_time,
    p_message, 'pending', p_idempotency_key
  )
  RETURNING * INTO v_row;

  RETURN v_row;
EXCEPTION WHEN unique_violation THEN
  SELECT * INTO v_row
    FROM public.mentor_bookings
   WHERE founder_id = v_uid AND idempotency_key = p_idempotency_key
   LIMIT 1;
  IF FOUND THEN RETURN v_row; END IF;

  SELECT * INTO v_row
    FROM public.mentor_bookings
   WHERE mentor_id = p_mentor_id
     AND founder_id = v_uid
     AND requested_date = p_requested_date
     AND requested_start_time = p_requested_start_time
     AND status IN ('pending', 'accepted')
   ORDER BY created_at DESC
   LIMIT 1;
  RETURN v_row;
END;
$function$;