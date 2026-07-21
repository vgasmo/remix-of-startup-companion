# RC5 Rescue — Evidence Ledger

Status keys: `confirmed` (repro reproduced), `already-correct-with-proof`, `fixed` (repro passes after change), `blocked` (needs human decision), `not-proven` (needs staging providers).

Last updated: 2026-07-21.

---

## Phase 0 — Inspection

| Item | Evidence | Status |
|---|---|---|
| Session source writers enumerated | grep in `src/**` + `supabase/functions/**` — see turn output `2026-07-21`. Only `sessions.source` writers: `useSessions.ts:271`, `mentor_transition_booking` (migration `20260721071129`), `SessionDetailDialog.tsx:149` (`voice`), `useSessions.ts` past-meeting path (`off_platform`). | confirmed |
| Mentor booking lifecycle writers | `mentor_transition_booking` (RPC) is the sole updater; `useUpdateBookingStatus` calls it. Client-side direct writes deprecated per prior migration. | confirmed |
| Sessions constraint state | Migration `20260721112523` set `sessions_source_check` to `{manual, teams_import, webhook, off_platform}` — did NOT include `mentor_booking`. This is the A2 P0. | confirmed |

## Batch A — P0

### A1. `log_completed_session_atomic`

- **Before (repro):** `CreateSessionDialog` past-meeting path calls `useCreateSession` which inserts `sessions` with `outlook_sync_status='pending'` and emits `session_scheduled` event → duplicates possible on retry, no participant attendance in same txn, no idempotency, may enqueue Outlook.
- **After:** RPC `public.log_completed_session_atomic(p_command_id, ...)` — Migration `20260721124437` (this turn). Idempotency enforced by unique index `sessions_command_id_uidx`. Authorization matrix inside the RPC covers admin/staff/consultor/founder/mentor. Writes session (`status='completed'`, `outlook_sync_status='not_applicable'`), upserts `session_participants`, logs `tool_usage_events` + `activity_log`.
- **UI wiring:** NOT YET DONE — `CreateSessionDialog` past-meeting branch still calls `useCreateSession`. Follow-up task tracked below.
- **Status:** `fixed` (DB) / `blocked-on-followup` (UI wiring).
- **Tests:** pgTAP + Vitest tests NOT YET WRITTEN. Marked `NOT PROVEN` until behavior tests land.

### A2. Session source vocabulary

- **Before (repro):** SQL against staging — `INSERT INTO sessions (..., source) VALUES (..., 'mentor_booking')` → `ERROR:  new row for relation "sessions" violates check constraint "sessions_source_check"`. Any mentor booking acceptance fails.
- **After:** Migration `20260721124437` recreates constraint with `{manual, teams_import, webhook, off_platform, mentor_booking, public_booking, voice, completion_dialog, transcript_import}`. All existing writers surveyed in Phase 0 are covered.
- **Status:** `fixed`.
- **Read-only impact query:** `docs/rc5/queries/mentor-booking-stuck.sql` (see below). NO automatic repair.

### A3. Mentor booking ↔ session linkage

- **Before:** `mentor_bookings` had no `linked_session_id`; repeated acceptance created a second `sessions` row.
- **After:** Column `linked_session_id` + unique index; RPC updated so acceptance-when-already-accepted returns the same linked session with `idempotent: true`.
- **Status:** `fixed` (DB). Behavior test NOT YET WRITTEN → `NOT PROVEN` for the idempotency assertion.

---

## Batch B — P0 (NOT STARTED)

- **B1 DocuSign atomicity** — planned; `envelope_command_id` + reconciler outstanding.
- **B2 Signature atomic RPC** — planned.
- **B3 profiles peer view** — planned.

## Batch C — Automation / Notification Truth (NOT STARTED)

- C1 registry, C2 outbox, C3 public booking atomic, C4 CRM import — planned per `.lovable/plan.md`.

## Batch D — Programme / Financial (NOT STARTED)

## Batch E — Monthly Founder Pulse (NOT STARTED)

Data model + candidate resolver + dispatch cron pending. Rollout stays flag-off.

## Batch F — UX / i18n / Clickability (NOT STARTED)

66-key strict i18n backlog and clickability sweep still open.

## Batch G — CI / Migration / Staging (NOT STARTED)

Fresh replay + forward-apply not yet run in this session.

---

## Verdict as of this turn

**NO-GO.** Batches B–G plus Monthly Founder Pulse plus the A1 UI wiring and behavior tests are still open. Only the P0 database primitives for Batch A landed in this turn.

## Follow-up tasks queued (must land before GO)

1. Wire `CreateSessionDialog` past-meeting form to call `log_completed_session_atomic` via `invokeWithAuth`, generating `p_command_id` client-side and disabling submit on pending.
2. Add Vitest + pgTAP tests for A1/A2/A3 acceptance criteria (unauthorized actor, past vs future, retry, no provider sync, participant persistence).
3. Batch B (DocuSign + signature + profile privacy).
4. Batch C (automation registry, outbox, public booking, CRM import).
5. Batch E (Monthly Founder Pulse, flag OFF).
6. Batch D, F, G.
7. Persona E2E at 320/375/768/1440.
8. DPO/legal ledger sign-offs for pulse + eIDAS wording.
