-- RC5 A2 — Read-only impact query for mentor bookings potentially blocked by
-- the sessions_source_check regression prior to migration 20260721124437.
--
-- Run manually against staging or production. This query is READ-ONLY. Any
-- repair MUST go through mentor_transition_booking (which is now idempotent)
-- with explicit operator approval.

-- 1) Accepted mentor bookings without a linked session (post-A3 column added).
SELECT
  mb.id                     AS booking_id,
  mb.mentor_id,
  mb.founder_id,
  mb.workspace_id,
  mb.requested_date,
  mb.requested_start_time,
  mb.requested_end_time,
  mb.status,
  mb.linked_session_id,
  mb.created_at,
  mb.updated_at
FROM public.mentor_bookings mb
WHERE mb.status = 'accepted'
  AND mb.linked_session_id IS NULL
ORDER BY mb.updated_at DESC
LIMIT 500;

-- 2) Bookings that likely failed acceptance because the CHECK rejected
--    source='mentor_booking' (still 'pending' but with an updated_at recent
--    to the regression window 2026-07-21 07:11 UTC → 2026-07-21 12:44 UTC).
SELECT
  mb.id                     AS booking_id,
  mb.mentor_id,
  mb.workspace_id,
  mb.status,
  mb.updated_at
FROM public.mentor_bookings mb
WHERE mb.status = 'pending'
  AND mb.updated_at >= '2026-07-21 07:11:00+00'
  AND mb.updated_at <  '2026-07-21 12:44:00+00'
ORDER BY mb.updated_at DESC
LIMIT 500;
