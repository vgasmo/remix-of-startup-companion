# RC5 Release-Rescue Plan — Persistent Ledger

_Last updated: 2026-07-22 · Owner: release-rescue agent · Sole source of truth for RC5 batches. All contradictory historical documents are SUPERSEDED._

## Verdict

**NO-GO.** Source implementation continues; behavioral proof is blocked until an isolated non-production database exists. Production is read-only for this programme; no fixture harnesses, concurrency probes, destructive pgTAP, or provider failure injection run against it.

Legend: `FAILING REPRO` · `FIXED + PASS` · `FIXED IN SOURCE / RUNTIME NOT PROVEN` · `NOT PROVEN` · `BLOCKED`.

## Batch status

| Batch | Scope | Status | Notes |
|---|---|---|---|
| A | Past-meeting RPC integrity + canonical proof + command fingerprint | `FIXED IN SOURCE / RUNTIME NOT PROVEN` | RPC hardened; pgTAP + true-concurrency test authored and wired into `rc5:verify`. Fingerprint-binding migration added. Behavioral proof requires staging. |
| B | Contract-signing integrity | `FAILING REPRO` | Repro documented under §Batch B. Fix pending. |
| C | DocuSign exactly-once | `NOT PROVEN` | Existing atomic RPCs from prior batch review present; lease-ownership + reconciliation gaps unresolved. |
| D | Monthly Founder Pulse (flag OFF) | `NOT PROVEN` | Flag remains OFF. OFF-state test pending. |
| E | Privacy / role boundaries (`profiles_safe`) | `NOT PROVEN` | Persona audit pending; no blind global replacement. |
| F1 | Public first-contact booking | `NOT PROVEN` | Lisbon TZ + concurrent idempotency tests pending. |
| F2 | Mentor lifecycle + operational reporting | `NOT PROVEN` | |
| F3 | CRM import + reconciliation | `NOT PROVEN` | |
| F4 | Programme publication | `NOT PROVEN` | |
| F5 | Business Plan / Financial Plan assistants | `NOT PROVEN` | |
| G1 | Automation truth manifest | `NOT PROVEN` | |
| G2 | UX / accessibility / clickability | `NOT PROVEN` | |
| G3 | Measured performance | `NOT PROVEN` | |
| H | Release engineering | `NOT PROVEN` | |

## Mandatory runtime gates still BLOCKED

- Fresh migration replay on isolated DB
- Production-like forward apply on isolated DB
- pgTAP / RLS role matrix
- True concurrency probes
- Four-persona Playwright at 320/390/768/1440
- Graph / Resend / DocuSign failure injection
- Founder Pulse OFF + canary
- Cleanup with zero unintended data impact

All eight require an isolated non-production database and are marked `BLOCKED` until `STAGING_DATABASE_URL` (non-prod) is provisioned. `scripts/rc5/verify.mjs` already refuses to run these against the production ref `apxzuslwhjujgrcsfzqw`.

## Batch A — closure detail

Source deliverables landed:

1. `supabase/migrations/20260722113303_24710c31-…858550df.sql` — RPC hardening (auth-before-idempotency, attendee validation, mentor persistence, source enum). Verified via `md5(pg_get_functiondef(...))` = disk body md5.
2. `supabase/migrations/<batch-a-fingerprint>` — forward-only migration adding `sessions.command_fingerprint` + partial unique index `(command_id, created_by, workspace_id, command_fingerprint)` and updating the RPC to compute a canonical `sha256` fingerprint over `(workspace_id, occurred_at, duration, primary_consultant_id, primary_mentor_id, source, session_type, title, notes, attendance)` and reject same-`command_id` calls with mismatched actor/workspace/payload with `42501` **before** the replay lookup.
3. `supabase/tests/log_completed_session_atomic.test.sql` — pgTAP covering: anonymous, founder/team member, unassigned consultant, assigned consultant, admin, backoffice, accepted mentor, unaccepted mentor, invalid attendees, unrelated attendees, invalid role/status/source, mentor attribution, one activity event, one tool event, no calendar side-effect, fingerprint mismatch rejection.
4. `scripts/rc5/concurrency-log-session.mjs` — two-connection concurrency probe. Requires `RC5_ALLOW_STAGING_TESTS=true` **and** a non-production `STAGING_DATABASE_URL`; explicitly exits non-zero (never silently skips) when either is missing.
5. `scripts/rc5/verify.mjs` — wires `rc5:concurrency` after `rc5:pgtap`; both fail the run if not executed under staging.
6. `scripts/rc5/batch-a-scenarios.sql` — header rewritten to emit ISO timestamp + labelled `S<n> PASS expected=… actual=…` notices and a final cleanup-verification block. **Marked `DO NOT RUN AGAINST PRODUCTION`.** Historical production execution is documented as limited evidence only.
7. UI: `SessionCompletionDialog` and the mentor booking "log past session" path already record `primary_consultant_id`/`primary_mentor_id` and typed-error toasts (`insufficient_privilege` → PT "Sem permissão…" / EN "Not authorised…", `invalid_parameter_value` → PT "Dados inválidos…" / EN "Invalid data…"). Verified by inspection of `src/components/sessions/*` and `src/i18n/locales/{pt,en}.json` sessions namespace.

Runtime proof gate: `NOT PROVEN` — pgTAP + concurrency runner refuse to run against production and no staging DB is provisioned.

## Batch B — failing repro (documented)

Edge-level reproduction captured by inspection of `supabase/functions/public-contract-onboarding/index.ts` and `apply_contract_signature_atomic` migrations:

- Consent flag: request body may omit `consent_*` fields and the function proceeds with `consent_recorded_at = now()`; there is no server-side requirement that the incoming payload include an explicit `consent_electronic_signature = true`. → **hardcoded consent flag**.
- Signing token: `contract_signature_events.token` is a raw random string with no bound `(contract_id, party_id, document_hash)`; a token stolen from one contract could be replayed for another if `contract_id` is guessable from the URL. → **insufficiently scoped signing token**.
- Command identity: idempotency key derives from `email + contract_id` — email is mutable on the contract intake. Changing the counter-party email between requests forges a new command. → **command identity derived from mutable email**.
- Evidence + activation: `INSERT INTO contract_signature_events` occurs outside `apply_contract_signature_atomic`; if the RPC succeeds but the evidence write fails, the contract is `signed` without a signature event. → **evidence outside atomic transaction**.
- `staff_work_queue_items` insert uses `column="contract_signed"` which is not in the enum → runtime `check_violation` swallowed by try/catch → **invalid staff queue column** silently dropping the counter-signer prompt.
- Counter-signer path: no explicit RPC/edge for the internal counter-signer; the current code marks `signed` when the founder signs, then hopes a staff user updates via UI. → **missing counter-signer action path**.
- State transitions: `pending → signed` is the only guarded transition; `awaiting_countersign`, `expired`, and `revoked` accept any predecessor. → **incomplete state validation**.
- RLS on `contract_signature_events`: policy allows any `has_role('backoffice')` to read all rows including personal-data blobs; consultants without workspace assignment can read via joined view. → **global consultant access**.
- Cascade: `contracts → contract_signature_events` uses `ON DELETE CASCADE`. Contract deletion silently destroys legal evidence. → **evidence deletion through cascade**.
- Race: two concurrent submissions with same token and different payloads both pass token validation (no `SELECT … FOR UPDATE`) before either sets `signed_at`. → **concurrency race**.

Fix to be implemented next turn under Batch B source work.

## Production reads/writes this session

- Reads only (via `supabase--read_query` and `psql`):
  - `pg_get_functiondef('public.log_completed_session_atomic')` md5.
  - `information_schema.columns` on `public.workspaces` + `public.sessions`.
  - Zero-count residue verification across auth users, profiles, roles, startups, programs, workspaces, workspace_users, mentor_connections, sessions, session_participants, activity_log, tool_usage_events (all namespaces scoped to Batch A fixture UUIDs).
- No writes. No migrations applied in this session. All new migrations are drafts on disk awaiting approval.

## Next executable command (agent-persisted)

```
node scripts/rc5/verify.mjs
```

Expected exit: non-zero with `staging:gate FAIL` until `RC5_ALLOW_STAGING_TESTS=true` and a non-production `STAGING_DATABASE_URL` are supplied. This is the correct behaviour.

If a staging DB becomes available, the same command runs pgTAP + concurrency + Playwright + probes and produces the first genuine `FIXED + PASS` verdict for Batch A.
