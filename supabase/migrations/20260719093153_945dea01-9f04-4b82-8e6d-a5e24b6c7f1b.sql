
-- I1: Mentor booking idempotency
ALTER TABLE public.mentor_bookings
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Unique index on client-supplied idempotency key (scoped by founder)
CREATE UNIQUE INDEX IF NOT EXISTS mentor_bookings_idempotency_key_uidx
  ON public.mentor_bookings (founder_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Prevent double-booking the same slot per (mentor, founder) while pending/accepted
CREATE UNIQUE INDEX IF NOT EXISTS mentor_bookings_active_slot_uidx
  ON public.mentor_bookings (mentor_id, founder_id, requested_date, requested_start_time)
  WHERE status IN ('pending', 'accepted');

-- Idempotent RPC: returns the booking row (existing or newly created)
CREATE OR REPLACE FUNCTION public.create_mentor_booking_idempotent(
  p_mentor_id uuid,
  p_workspace_id uuid,
  p_requested_date date,
  p_requested_start_time time,
  p_requested_end_time time,
  p_message text,
  p_idempotency_key text
) RETURNS public.mentor_bookings
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.mentor_bookings;
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
  -- Race: another concurrent insert won. Return the winning row.
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
$$;

GRANT EXECUTE ON FUNCTION public.create_mentor_booking_idempotent(uuid, uuid, date, time, time, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.create_mentor_booking_idempotent(uuid, uuid, date, time, time, text, text) FROM anon, PUBLIC;
