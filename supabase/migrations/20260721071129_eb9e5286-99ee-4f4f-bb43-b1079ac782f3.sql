-- D1: Atomic mentor booking transition RPC ------------------------------
CREATE OR REPLACE FUNCTION public.mentor_transition_booking(
  p_booking_id uuid,
  p_target_state text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_booking record;
  v_is_admin boolean;
  v_is_mentor boolean;
  v_is_founder boolean;
  v_start_ts timestamptz;
  v_end_ts timestamptz;
  v_duration_min int;
  v_session_id uuid;
  v_overlap_count int;
  v_allowed boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF p_target_state NOT IN ('accepted','declined','cancelled','completed') THEN
    RAISE EXCEPTION 'invalid target state: %', p_target_state USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking
  FROM public.mentor_bookings
  WHERE id = p_booking_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking not found' USING ERRCODE = 'P0002';
  END IF;

  v_is_admin  := public.has_role(v_actor, 'admin'::app_role);
  v_is_mentor := (v_booking.mentor_id = v_actor);
  v_is_founder := (v_booking.founder_id = v_actor);

  -- Actor + transition matrix
  CASE p_target_state
    WHEN 'accepted' THEN
      v_allowed := (v_is_mentor OR v_is_admin) AND v_booking.status = 'pending';
    WHEN 'declined' THEN
      v_allowed := (v_is_mentor OR v_is_admin) AND v_booking.status = 'pending';
    WHEN 'cancelled' THEN
      v_allowed := (v_is_mentor OR v_is_founder OR v_is_admin)
                   AND v_booking.status IN ('pending','accepted');
    WHEN 'completed' THEN
      v_allowed := (v_is_mentor OR v_is_admin) AND v_booking.status = 'accepted';
  END CASE;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'transition % not allowed from %', p_target_state, v_booking.status
      USING ERRCODE = '42501';
  END IF;

  -- Accept: overlap check + session creation, all in-txn
  IF p_target_state = 'accepted' THEN
    SELECT count(*) INTO v_overlap_count
    FROM public.mentor_bookings mb
    WHERE mb.mentor_id = v_booking.mentor_id
      AND mb.id <> v_booking.id
      AND mb.status = 'accepted'
      AND mb.requested_date = v_booking.requested_date
      AND mb.requested_start_time < v_booking.requested_end_time
      AND mb.requested_end_time   > v_booking.requested_start_time;

    IF v_overlap_count > 0 THEN
      RAISE EXCEPTION 'overlap: mentor already has an accepted booking overlapping this slot'
        USING ERRCODE = '40001';
    END IF;

    v_start_ts := ((v_booking.requested_date::text || ' ' || v_booking.requested_start_time::text)
                    ::timestamp AT TIME ZONE 'Europe/Lisbon');
    v_end_ts   := ((v_booking.requested_date::text || ' ' || v_booking.requested_end_time::text)
                    ::timestamp AT TIME ZONE 'Europe/Lisbon');
    v_duration_min := GREATEST(15, (EXTRACT(EPOCH FROM (v_end_ts - v_start_ts))/60)::int);

    IF v_booking.workspace_id IS NOT NULL THEN
      INSERT INTO public.sessions (
        workspace_id, title, scheduled_at, duration,
        created_by, source, session_type, status
      )
      VALUES (
        v_booking.workspace_id,
        'Sessão de mentoria',
        v_start_ts,
        v_duration_min,
        v_booking.mentor_id,
        'mentor_booking',
        'mentoring',
        'scheduled'
      )
      RETURNING id INTO v_session_id;
    END IF;
  END IF;

  UPDATE public.mentor_bookings
     SET status = p_target_state,
         updated_at = now()
   WHERE id = v_booking.id;

  RETURN jsonb_build_object(
    'booking_id', v_booking.id,
    'status', p_target_state,
    'session_id', v_session_id,
    'actor', v_actor
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mentor_transition_booking(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.mentor_transition_booking(uuid, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.mentor_transition_booking(uuid, text) IS
  'D1: atomic mentor booking state transition. Validates actor + transition, overlap-checks on accept, and creates the linked session in the same txn. Client-side status writes on mentor_bookings are deprecated.';
