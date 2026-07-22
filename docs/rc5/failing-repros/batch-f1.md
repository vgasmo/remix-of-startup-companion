# Batch F1 — Public First-Contact Booking (source landed 2026-07-22)

Original repro: see git history — 7 defects across DST, idempotency, outbox
ordering, metadata merge, rate-limit fail-open, retry worker stub.

## Source landed this batch

1. `docs/rc5/drafts/2026-07-22_batch-f1_outbox_unique.sql` — forward-only,
   idempotent, additive migration draft (held):
   - Rewrites `commit_first_contact_booking_atomic` to pin the wall-clock via
     `AT TIME ZONE 'Europe/Lisbon'` (DST-correct), enrich metadata with
     `booking_slot_utc` / `submitter_email_normalized` / `link_id`, and use
     `public.jsonb_deep_merge` when reusing an early-stage lead (was `||`,
     shallow — clobbered `routing_decision.trace`).
   - Catches `unique_violation` inside the fresh-insert branch and reuses the
     conflicting row (race-safe with the existing `uniq_funnel_items_idempotency_key`).
   - Adds `uniq_funnel_items_link_email_slot_utc` composite unique index so a
     client that cycles the idempotency key cannot double-book the same
     (link, email, slot_utc).
   - Adds `claim_first_contact_outbox_batch(batch_size, lease_seconds)` using
     `FOR UPDATE SKIP LOCKED` — parallel workers do not double-dispatch —
     plus `mark_first_contact_outbox_completed` and
     `mark_first_contact_outbox_failed(id, err, backoff)` for authoritative
     lifecycle transitions.

2. `supabase/tests/public_booking_dst.test.sql` — 9 pgTAP assertions:
   - DST spring-forward wall-clock resolves deterministically.
   - Summer-vs-winter 10:00 Lisbon differ by exactly 1 h in UTC.
   - Fresh commit yields `mode='created'`; repeated `idempotency_key` yields
     `mode='idempotent_reuse'`; different idempotency key with same
     (link, email, slot) also dedupes; exactly one `funnel_items` row persists.
   - `claim_first_contact_outbox_batch` leases the 2 pending rows and returns
     zero on the second concurrent claimant (SKIP LOCKED).
   - `mark_first_contact_outbox_completed` transitions state + sets
     `completed_at`.

3. `supabase/functions/public-book-first-contact/index.ts`:
   - **Fail-closed rate limit** when `strict_calendar_validation` is on:
     returns 503 instead of silently allowing the call through when the
     `public_booking_rate_limits` read errors.
   - **Short-circuit on `idempotent_reuse`**: reads the stored funnel item
     and returns it immediately — no second Graph event, no second consultant
     notification, no second consultant email, no second founder
     notification. Response carries `idempotent: true` and the previously
     stored `teams_url` / `calendar_event_id`.
   - **Outbox-first**: two authoritative outbox rows (`graph_event`,
     `consultant_email`) are inserted with `status='in_progress'` **before**
     the external calls. Success paths call
     `mark_first_contact_outbox_completed`; failures call
     `mark_first_contact_outbox_failed` with a 300 s backoff; unconfigured
     providers flip the row to `status='skipped'` with a terminal reason.
     A crash mid-flight now leaves a claimable outbox row instead of an
     invisible Graph event.
   - The tail-end best-effort trace insert survives for
     `consultant_notification` / `founder_notification` audit rows only —
     the two authoritative kinds are no longer duplicated.

## Runtime proof gate

`NOT PROVEN`. `supabase/tests/public_booking_dst.test.sql` is wired into
`scripts/rc5/run-pgtap.mjs`, which refuses to execute against the
production project ref. The DST + 10-parallel-submissions runtime scenarios
in the acceptance criteria require a non-production DB.

Local checks executed this turn: `bunx tsgo -p tsconfig.typecheck.json
--noEmit` → exit 0.
