# RC5 Release-Rescue Plan — Persistent Ledger

_Last updated: 2026-07-22 (failing-repros bundle) · Owner: release-rescue agent · Sole source of truth for RC5 batches. All contradictory historical documents are SUPERSEDED._

Per-batch failing repros with concrete defect lists and next executable actions live under [`docs/rc5/failing-repros/`](./failing-repros/README.md). Nothing there has been shipped.

## Verdict

**NO-GO.** Source implementation continues; behavioral proof is blocked until an isolated non-production database exists. Production is read-only for this programme; no fixture harnesses, concurrency probes, destructive pgTAP, or provider failure injection run against it.

Legend: `FAILING REPRO` · `FIXED + PASS` · `FIXED IN SOURCE / RUNTIME NOT PROVEN` · `NOT PROVEN` · `BLOCKED`.

## Batch status

| Batch | Scope | Status | Notes |
|---|---|---|---|
| A | Past-meeting RPC integrity + canonical proof + command fingerprint | `FIXED IN SOURCE / RUNTIME NOT PROVEN` | RPC hardened; pgTAP + true-concurrency test authored and wired into `rc5:verify`. Fingerprint-binding migration added. Behavioral proof requires staging. |
| B | Contract-signing integrity | `FIXED IN SOURCE / RUNTIME NOT PROVEN` | Forward migration drafted (grants + fingerprint + RESTRICT + narrowed RLS). Edge function: explicit consent block required, honest "advanced electronic signature per eIDAS Art. 26" copy, canonical `staff_work_queue_items` insert. pgTAP suite authored. Runtime proof BLOCKED on staging. |
| C | DocuSign exactly-once | `FIXED IN SOURCE / RUNTIME NOT PROVEN` | Draft `docs/rc5/drafts/2026-07-22_batch-c_docusign_lease.sql` adds `docusign_dispatch_leases` + state machine; send edge binds provider idempotency key to `sha256(command||doc)` and treats timeouts / 5xx as `unknown`. pgTAP `supabase/tests/docusign_dispatch_lease.test.sql` covers concurrent claim, monotonic finalize, stale-reclaim reconciliation. Runtime proof pending staging. |
| D | Monthly Founder Pulse (flag OFF) | `FIXED IN SOURCE / RUNTIME NOT PROVEN` | Draft `docs/rc5/drafts/2026-07-22_batch-d_pulse_off_guard.sql` adds `is_feature_flag_enabled`, flag guards on all three pulse RPCs, `is_account_active` eligibility, structural dedup index, `notification_attempts_state_chk`, and 18-month anonymizer. Edge fn short-circuits on flag OFF. pgTAP `supabase/tests/founder_pulse_off_state.test.sql` asserts 9 OFF-state invariants. rc5:verify remains NO-GO (staging gates disabled). |
| E | Privacy / role boundaries (`profiles_safe`) | `FIXED IN SOURCE / RUNTIME NOT PROVEN` | Audit `docs/rc5/batch-e-profiles-audit.md` classifies all 28 `src/` `from('profiles')` sites — 2 peer reads in `ChatTab.tsx` switched to `profiles_safe`; `useConsultantNotes.ts` also routed through the view for defence-in-depth. Migration draft `docs/rc5/drafts/2026-07-22_batch-e_onboarding_gate.sql` narrows `complete_workspace_onboarding` to founder/owner or staff. pgTAP `supabase/tests/profiles_peer_boundary.test.sql` asserts 11 invariants (peer denial on `profiles`, masked PII on `profiles_safe`, founder-only onboarding gate). Runtime proof BLOCKED on staging. |
| F1 | Public first-contact booking | `FIXED IN SOURCE / RUNTIME NOT PROVEN` | Draft `docs/rc5/drafts/2026-07-22_batch-f1_outbox_unique.sql` pins Europe/Lisbon in `commit_first_contact_booking_atomic`, switches metadata merge to `jsonb_deep_merge`, adds composite unique index on `(link_id, submitter_email_normalized, booking_slot_utc)`, and ships `claim_first_contact_outbox_batch` + `mark_first_contact_outbox_completed/failed` (SKIP LOCKED lease). Edge fn now fail-closes the rate-limit under strict flag, short-circuits all external side-effects on `idempotent_reuse`, and writes outbox intent rows **before** Graph/Resend calls (updated to `completed`/`failed` after). pgTAP `supabase/tests/public_booking_dst.test.sql` asserts 9 invariants including DST wall-clock stability and SKIP LOCKED lease semantics. Runtime proof BLOCKED on staging. |
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

### Batch B — source landed this turn

1. `docs/rc5/drafts/2026-07-22_batch-b_signing_integrity.sql` — forward-only, additive, idempotent migration draft (held, not applied):
   - `public.contract_signing_grants` table with partial unique index `(contract_id, party_role) WHERE consumed_at IS NULL`, RLS scoped to admin/backoffice/consultor read + admin/backoffice write.
   - `public.issue_contract_signing_grant(contract_id, party_role, signer_email, document_sha256, document_version, ttl_minutes=15)` SECURITY DEFINER; rejects non-staff with `42501`; revokes any live grant for the pair before issuing a fresh 32-byte hex nonce.
   - Extended `public.apply_contract_signature_atomic` — adds optional `p_grant_nonce`, `p_document_sha256`, `p_canonical_payload_sha256`; consumes the grant in the same tx; rejects wrong/expired/reused nonce or document-hash mismatch with `42501`; computes and persists `command_fingerprint = sha256(contract || party || document_sha256 || payload_sha256)` inside `evidence_json`; keeps the prior FOR UPDATE lock, terminal-state guard, and idempotent replay short-circuit.
   - `contract_signature_events` FK moved from `ON DELETE CASCADE` → `ON DELETE RESTRICT`; mirror `contract_signature_events_archive` table (staff-read RLS).
   - `contract_signature_events` RLS narrowed: admin/backoffice read, consultor read only when `has_workspace_access(contract.workspace_id, auth.uid())`; writes via service_role/SECURITY DEFINER only; anon denied.
2. `supabase/tests/apply_contract_signature_atomic.test.sql` — 14 pgTAP assertions covering: non-staff grant issuance rejection, legacy grant-bypass path, happy-path grant issue+consume, reused nonce rejection, document hash mismatch, expired grant, bilateral counter-signer completion, terminal state regression rejection, idempotent replay + no duplicate event, FK is RESTRICT, anon denial on events and grants. Runs under `rc5:pgtap` via `scripts/rc5/run-pgtap.mjs` (already wired into `rc5:verify`).
3. `supabase/functions/public-contract-onboarding/index.ts` (`action === 'digital_sign'`):
   - Requires an explicit `consent: { eidas_ack: true, timestamp, ip }` block; returns `400 consent_required` otherwise. Server no longer infills consent.
   - Signature proof now labels `method: 'advanced_electronic_signature'`, `regulation_reference: 'eIDAS EU 910/2014, Article 26'`, `qualified: false`. Removed the unsupported "eIDAS compliant" claim.
   - Counter-signer work-queue insert uses the canonical schema (`type`, `workspace_id`, `evidence_json`) and skips gracefully when `workspace_id` is not yet linked (reconciler picks it up) — the previous insert referenced non-existent `item_type`/`entity_type`/`entity_id` columns and could crash silently.
4. Runtime gate: pgTAP + counter-signer bilateral concurrency remain `NOT PROVEN` — `scripts/rc5/run-pgtap.mjs` refuses to execute against the production project ref `apxzuslwhjujgrcsfzqw`. Migration itself is held as a draft until staging replays it.
5. Local checks executed this turn: `bunx tsgo -p tsconfig.typecheck.json --noEmit` → exit 0.

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
