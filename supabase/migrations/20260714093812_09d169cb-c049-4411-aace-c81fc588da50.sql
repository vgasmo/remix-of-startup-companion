-- Block mentor double-bookings at the source. Two founders (or the same
-- founder in two tabs) could previously race a booking for the same mentor at
-- overlapping times because the client-side clash check only saw the current
-- user's own bookings via useMyBookings(). This trigger enforces the rule
-- server-side, regardless of RLS visibility.
--
-- Semantics:
--   - Overlap = same mentor, same requested_date, [start, end) intervals intersect.
--   - Blocks new pending/accepted bookings that clash with an existing
--     pending/accepted booking.
--   - Never blocks status updates that only move OUT of pending/accepted
--     (declined/cancelled) or that don't shift the time window.
--   - Additive: no data mutation.

CREATE OR REPLACE FUNCTION public.prevent_mentor_booking_overlap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  conflict_row RECORD;
BEGIN
  -- Only guard bookings that would actually reserve the mentor.
  IF NEW.status NOT IN ('pending', 'accepted') THEN
    RETURN NEW;
  END IF;

  -- On UPDATE with unchanged time window & status, nothing to check.
  IF TG_OP = 'UPDATE'
     AND OLD.mentor_id = NEW.mentor_id
     AND OLD.requested_date = NEW.requested_date
     AND OLD.requested_start_time = NEW.requested_start_time
     AND OLD.requested_end_time = NEW.requested_end_time
     AND OLD.status IN ('pending', 'accepted') THEN
    RETURN NEW;
  END IF;

  SELECT id, founder_id, requested_start_time, requested_end_time, status
    INTO conflict_row
  FROM public.mentor_bookings
  WHERE mentor_id = NEW.mentor_id
    AND requested_date = NEW.requested_date
    AND status IN ('pending', 'accepted')
    AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    -- Half-open interval overlap: [aStart, aEnd) intersects [bStart, bEnd)
    AND requested_start_time < NEW.requested_end_time
    AND requested_end_time  > NEW.requested_start_time
  LIMIT 1;

  IF conflict_row.id IS NOT NULL THEN
    RAISE EXCEPTION
      'mentor_double_booking: mentor already has a % booking on % from % to %',
      conflict_row.status, NEW.requested_date,
      conflict_row.requested_start_time, conflict_row.requested_end_time
      USING ERRCODE = '23505';  -- unique_violation, easy for the client to catch
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_mentor_booking_overlap ON public.mentor_bookings;
CREATE TRIGGER trg_prevent_mentor_booking_overlap
  BEFORE INSERT OR UPDATE ON public.mentor_bookings
  FOR EACH ROW EXECUTE FUNCTION public.prevent_mentor_booking_overlap();