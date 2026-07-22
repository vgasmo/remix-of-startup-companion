-- Batch F2 — Mentor lifecycle + operational reporting
-- Forward-only, additive, idempotent. Held as draft.
--
-- Delivers a single canonical operational view for reporting that
-- attributes hours per participant role (no double-count), plus atomic
-- transitions for mentor bookings that also propagate to the linked
-- session row.

BEGIN;

-- 1. Canonical operational view ---------------------------------------------
-- One row per (workspace_id, session_id, participant_role, participant_user_id).
-- Downstream KPI queries GROUP BY the participant role and count minutes only
-- against the single canonical role — no more "consultant hours" and
-- "mentor hours" both including the same session.
CREATE OR REPLACE VIEW public.v_sessions_operational
WITH (security_invoker = true)
AS
WITH base AS (
  SELECT
    s.id                            AS session_id,
    s.workspace_id                  AS workspace_id,
    s.session_type                  AS session_type,
    s.source                        AS source,
    s.status                        AS status,
    s.occurred_at                   AS occurred_at,
    -- Prefer measured duration (Graph event end - start) when present;
    -- fall back to scheduled duration. NEVER derive from slot alone.
    COALESCE(
      s.actual_duration_minutes,
      EXTRACT(EPOCH FROM (s.ended_at - s.occurred_at)) / 60,
      s.duration_minutes,
      0
    )::int                          AS effective_minutes,
    s.primary_consultant_id,
    s.primary_mentor_id
  FROM public.sessions s
  WHERE s.status IN ('completed', 'logged', 'cancelled', 'no_show')
),
role_rows AS (
  -- Consultant attribution: primary consultant only (no double-count when
  -- consultant AND mentor both attend — mentor row uses `mentor` role).
  SELECT b.session_id, b.workspace_id, b.session_type, b.source, b.status,
         b.occurred_at, b.effective_minutes,
         'consultant'::text  AS participant_role,
         b.primary_consultant_id AS participant_user_id
  FROM base b
  WHERE b.primary_consultant_id IS NOT NULL
  UNION ALL
  SELECT b.session_id, b.workspace_id, b.session_type, b.source, b.status,
         b.occurred_at, b.effective_minutes,
         'mentor'::text     AS participant_role,
         b.primary_mentor_id AS participant_user_id
  FROM base b
  WHERE b.primary_mentor_id IS NOT NULL
  UNION ALL
  -- Founder attendance derived from session_participants (role = 'founder').
  SELECT b.session_id, b.workspace_id, b.session_type, b.source, b.status,
         b.occurred_at, b.effective_minutes,
         'founder'::text    AS participant_role,
         sp.user_id         AS participant_user_id
  FROM base b
  JOIN public.session_participants sp
    ON sp.session_id = b.session_id
   AND sp.role = 'founder'
)
SELECT DISTINCT ON (session_id, participant_role, participant_user_id)
       session_id, workspace_id, session_type, source, status,
       occurred_at, effective_minutes, participant_role, participant_user_id
FROM role_rows
ORDER BY session_id, participant_role, participant_user_id, occurred_at DESC;

GRANT SELECT ON public.v_sessions_operational TO authenticated;
GRANT SELECT ON public.v_sessions_operational TO service_role;

-- 2. Atomic mentor booking transition ---------------------------------------
-- Applies the booking status change AND propagates to the linked session
-- (cancellation on the booking cancels the session; no divergent state).
CREATE OR REPLACE FUNCTION public.transition_mentor_booking_atomic(
  p_booking_id uuid,
  p_next_status text,
  p_reason text DEFAULT NULL,
  p_command_id uuid DEFAULT NULL
)
RETURNS TABLE(booking_id uuid, session_id uuid, mode text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.mentor_bookings%ROWTYPE;
  v_actor   uuid := auth.uid();
  v_allowed text[] := ARRAY['pending','accepted','declined','cancelled','completed','no_show'];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'auth_required' USING ERRCODE = '42501';
  END IF;
  IF NOT (p_next_status = ANY(v_allowed)) THEN
    RAISE EXCEPTION 'invalid_status:%', p_next_status USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking FROM public.mentor_bookings
   WHERE id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'booking_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotent: same target status is a no-op, not an error.
  IF v_booking.status = p_next_status THEN
    RETURN QUERY SELECT v_booking.id, v_booking.session_id, 'idempotent_reuse'::text;
    RETURN;
  END IF;

  -- Terminal states cannot regress.
  IF v_booking.status IN ('completed','cancelled','declined','no_show')
     AND p_next_status <> v_booking.status THEN
    RAISE EXCEPTION 'terminal_state:%->%', v_booking.status, p_next_status USING ERRCODE = '42501';
  END IF;

  UPDATE public.mentor_bookings
     SET status = p_next_status,
         status_reason = p_reason,
         updated_at = now()
   WHERE id = p_booking_id;

  IF v_booking.session_id IS NOT NULL THEN
    IF p_next_status = 'cancelled' THEN
      UPDATE public.sessions SET status = 'cancelled', updated_at = now()
       WHERE id = v_booking.session_id AND status <> 'cancelled';
    ELSIF p_next_status = 'no_show' THEN
      UPDATE public.sessions SET status = 'no_show', updated_at = now()
       WHERE id = v_booking.session_id AND status <> 'no_show';
    END IF;
  END IF;

  RETURN QUERY SELECT v_booking.id, v_booking.session_id, 'transitioned'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.transition_mentor_booking_atomic(uuid, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.transition_mentor_booking_atomic(uuid, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_mentor_booking_atomic(uuid, text, text, uuid) TO service_role;

COMMIT;
