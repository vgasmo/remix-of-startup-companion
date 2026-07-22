# Batch F1 — Public First-Contact Booking (FAILING REPRO)

Source: `supabase/functions/public-booking-*`, `public_booking_links`,
`public_booking_rate_limits`, `first_contact_outbox`, MS Graph calendar
create.

## Defects

1. Wall-clock conversion does not explicitly pin Europe/Lisbon across
   DST boundaries; ISO strings drift ±1h at transitions.
2. Idempotency check is application-side; concurrent submissions race
   past it.
3. After an `idempotent_reuse` response, Graph event and confirmation
   email are still fired again on the retry path.
4. Metadata merge on `funnel_items` uses read-modify-write, not
   `jsonb_deep_merge` in a single UPDATE.
5. Outbox intent is written **after** the external side effect
   (Graph/Resend) — a crash mid-flight leaks a real calendar event
   with no outbox row.
6. Retry worker is a stub; delivery state is not authoritative.
7. Rate limiting is not fail-closed on DB error.

## Required outcome

- Unique constraint on `(link_id, submitter_email_normalized,
  booking_slot_utc)` at DB level.
- Outbox-first: insert `first_contact_outbox` intent row before any
  external call; worker consumes it.
- DST tests: submit at 02:30 Lisbon on both spring-forward and
  fall-back days; assert stored UTC + rendered PT/EN copy match.
- Concurrency test: 10 parallel identical submissions → 1 CRM record,
  1 calendar event, 1 notification, 1 email.

## Next action

Draft `docs/rc5/drafts/2026-07-22_batch-f1_outbox_unique.sql` +
`supabase/tests/public_booking_dst.test.sql`.
