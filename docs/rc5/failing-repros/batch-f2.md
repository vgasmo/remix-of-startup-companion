# Batch F2 — Mentor Lifecycle & Operational Reporting (FAILING REPRO)

Source: `mentor_bookings`, `mentor_connections`, `sessions`,
`session_participants`, staff KPI views.

## Defects

1. On acceptance, founder + mentor are not both inserted as canonical
   `session_participants` rows; some flows rely on `sessions.host_id`
   only.
2. Cancellation on a mentor booking does not synchronize the linked
   session row.
3. Actual duration is derived from scheduled slot, not from Graph
   event end / attendance.
4. External calendar events created but never reconciled if the
   provider event is deleted.
5. Overlap detection considers only mentor_bookings — misses ordinary
   sessions + Graph busy time.
6. Idempotent transitions missing on booking status machine.
7. Reporting: consultant hours double-counted when a session has both
   consultant and mentor host attribution.

## Required KPI truth

- Meetings per consultant, meetings per startup, consultant hours,
  mentor hours, cancellations, no-shows, tools used, mentor impact.
- Single canonical view `v_sessions_operational` that de-duplicates on
  `(workspace_id, session_id)` and attributes hours by explicit
  participant role.

## Next action

Author `supabase/migrations/*_batch_f2_sessions_view.sql` (draft) and
scenario tests.
