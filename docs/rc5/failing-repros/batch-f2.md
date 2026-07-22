# Batch F2 — source landed 2026-07-22

Draft: `docs/rc5/drafts/2026-07-22_batch-f2_sessions_view.sql`.
pgTAP: `supabase/tests/mentor_booking_transition.test.sql`.

- `v_sessions_operational` (security_invoker) attributes minutes to exactly
  one participant role per (session, user). Consultant + mentor + founder
  no longer double-count when a session has both a consultant and a mentor.
- `effective_minutes` = COALESCE(actual, ended_at - occurred_at, scheduled)
  so KPIs are Graph-truth first, slot only as a last resort.
- `transition_mentor_booking_atomic(booking, status, reason, cmd_id)` is
  SECURITY DEFINER with FOR UPDATE lock, terminal-state guard, and
  idempotent replay (`mode='idempotent_reuse'`). Cancellation/no-show
  propagate to the linked `sessions` row inside the same tx.

Runtime proof gate: staging pgTAP + 4-persona clicks — `NOT PROVEN`.
Local typecheck: pass.
