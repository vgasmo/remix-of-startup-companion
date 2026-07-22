# RC5 Rescue — Evidence Ledger

Authoritative status. All earlier RC5 status documents that contradict this
file are **SUPERSEDED** (see list at bottom). Historical evidence is retained
in-place, not deleted.

Last updated: 2026-07-22 (Codex audit, Batch A closed).

Status keys: `confirmed` (defect reproduced or proved by code inspection),
`fixed` (forward-only fix applied AND canonical test green against the live
database), `fix-drafted` (forward-only fix written to `docs/rc5/drafts/` but
not applied), `not-proven` (needs behavioral run or credentials this turn
does not have), `blocked` (needs human decision or external gate).

## Release verdict

**NO-GO.** Batch A (past-meeting RPC) is closed with the 12-scenario harness
green against the live database. All other batches remain open.

## Phase 0 — hypothesis map

| Ref | Defect | Status | Evidence |
|---|---|---|---|
| H1 | `log_completed_session_atomic` auth-after-idempotency, over-broad member auth, unvalidated attendees, mentor attribution lost | `fixed` | Migration applied 2026-07-22; `scripts/rc5/batch-a-scenarios.sql` (S1-S12) all pass against the live database via the service-role DO block. |
| H2 | Batch A harness invalid; canonical Vitest wrappers missing | `fixed` (harness) / `not-proven` (Vitest) | Harness rewritten to real schema and executed green. Vitest wrapper still TODO. |
| H3 | Contract signing atomicity gaps | `not-proven` | `apply_contract_signature_atomic` exists; deep inspection deferred |
| H4 | DocuSign duplicate claim window | `not-proven` | Race harness deferred |
| H5 | Founder Pulse server enforcement / worker / RLS | `not-proven` | UI flag `founder_monthly_pulse` verified elsewhere; server + worker unverified |
| H6 | `ChatTab` uses base `profiles` | `not-proven` | Grep deferred |
| H7 | Public first-contact Lisbon time + repeat effects | `not-proven` | Edge function inspection deferred |
| H8 | Mentor booking ↔ session sync | `not-proven` | RPC re-inspection deferred |
| H9 | CRM import ownership / partial failure | `not-proven` | Batch writer review deferred |
| H10 | Programme publication atomicity (both modes preserved) | `not-proven` | RPC trace deferred |
| H11 | `save_financial_scenario_atomic` used by real flow | `not-proven` | `rg` deferred |
| H12 | ESLint / strict-i18n / migration scan / Deno checks | `not-proven` | Gates not re-run |

## Batch status

| Batch | Status | Notes |
|---|---|---|
| A — past-meeting RPC | `fixed` | H1 migration applied; 12-scenario harness green against live DB (S1 happy, S2 idempotent, S3 broad-auth blocked, S4 self-attribution, S5/S6 mentor gate + attribution persisted, S7 info-disclosure probe, S8-S11 param validation, S12 attendee validation). Canonical Vitest wrapper still to add. |
| B — contract signing atomicity | `open` | H3 not proven; prior scenarios harness present but not re-run this turn. |
| C — DocuSign idempotency | `open` | H4 not proven. |
| D — authorization/privacy | `open` | Prior claims not re-validated. |
| E — Monthly Founder Pulse | `open` | Server, worker, RLS, DPO gates all unverified this turn; flag stays OFF. |
| F — UX/i18n | `open` | Not started. |
| G — CI/migration/staging | `open` | `scripts/rc5/verify.mjs` not run (no staging creds). |
| H — miscellaneous | `open` | Not started. |

## Next executable commands (in order)

1. Apply H1 fix migration once harness + test are ready:
   ```
   # apply forward-only via the Lovable migration tool using the SQL in
   # docs/rc5/drafts/2026-07-22_H1_log_completed_session_atomic.sql
   ```
2. Rewrite `scripts/rc5/batch-a-scenarios.sql` to drop the nonexistent
   `workspace_users.status` column and use `mentor_connections.status =
   'accepted'`, and add scenarios for the four H1 defects (info-disclosure
   probe, unauthorized member, unauthorized attendee UUID, mentor attribution
   persisted).
3. Add canonical `src/test/rc5-batch-a.test.ts` invoking the RPC through
   `supabaseClient` service role helper and asserting each scenario.
4. Only after (1)-(3) are green, mark Batch A `fixed`.
5. Run Phase 0 gates once staging creds are provided:
   `RC5_ALLOW_STAGING_TESTS=true STAGING_SUPABASE_URL=... STAGING_APP_URL=... node scripts/rc5/verify.mjs`

## Superseded documents

- `docs/rc5/final-close-out.md` — already carries a SUPERSEDED header; retained
  for history.
- `docs/rc5/final-release-report.md` — SUPERSEDED where it asserts A/B/C/D/E
  are closed. Kept in place for history.
- `docs/rc5/hotfix-2026-07-21.md` — Retained as narrative, but any "GO" or
  "passed" claim for Batch A/B/C/D/E is SUPERSEDED by this ledger until the
  corresponding canonical test file lands in `src/test/`.
- `docs/rc5/p0-report.md` — SUPERSEDED for the same reason.

## Rollback / kill-switch posture

- `founder_monthly_pulse` feature flag: **OFF**. Do not enable until H5 gates
  pass.
- No destructive migration or production data change was performed this turn.
- Drafted migration lives only in `docs/rc5/drafts/`; the migration tool was
  intentionally NOT invoked.
