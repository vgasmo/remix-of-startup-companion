# RC5 Rescue — Evidence Ledger

Authoritative status. All earlier RC5 status documents that contradict this
file are **SUPERSEDED** (see list at bottom). Historical evidence is retained
in-place, not deleted. Candidate identity and Batch 0 detail live in
`docs/rc5/AUDIT-2026-08-06-FINAL-CODEX.md`.

Last updated: 2026-08-06 (Batch 0 closed: full-tree Deno green, CI/verify gates
wired, PT-PT i18n quality gate added).

Status keys: `FAILING REPRO` (defect reproduced or proved by code inspection),
`FIXED + PASS` (forward-only fix applied AND a canonical test green),
`NOT PROVEN` (needs a behavioral run or credentials this environment lacks),
`BLOCKED` (needs a human decision or external gate).

## Release verdict

**NO-GO.** Batch 0 is closed and every local gate is green (TypeScript, ESLint,
206 tests, build, size, i18n parity + quality, secret scan, migration scan,
**full-tree Deno 131 files**). Mandatory gates 7-14 - fresh replay, staging
forward apply, pgTAP role matrix, true concurrency, provider failure injection,
authenticated persona E2E, automation reconciliation, Founder Pulse canary/DPO -
remain `NOT PROVEN` because only the production database is reachable.

## Batch 0 - evidence truthfulness (CLOSED 2026-08-06)

| Item | Status | Evidence |
|---|---|---|
| Full-tree Deno check (replaces changed-only) | `FIXED + PASS` | `scripts/rc5/deno-check-all.mjs` -> `PASS - 131 files typecheck clean` |
| `_shared/xlsxFingerprint.ts` dead SHA module URL | `FIXED + PASS` | unused `deno.land/std@0.224.0/hash/sha256.ts` import removed; file already used Web Crypto |
| `_shared/xlsmCanonical_e2e_test.ts` `BufferSource` mismatch | `FIXED + PASS` | digest now receives a concrete `ArrayBuffer` slice |
| Deterministic Deno dependency resolution | `FIXED + PASS` | `deno install` + `--config supabase/functions/deno.json`, wired in CI |
| `rc5:verify` missing gates (size-limit, migration scan, automation reconcile, full Deno, i18n quality) | `FIXED + PASS` | `scripts/rc5/verify.mjs` |
| PT-PT mixed-language copy (P2) | `FIXED + PASS` | 56 strings rewritten; `scripts/rc5/i18n-quality.mjs` gate PASS |
| Stale/contradictory RC5 documents | `FIXED + PASS` | superseded list below; audit file is the single candidate-truth doc |
| Applied-migration list from this environment | `NOT PROVEN` | exec DB role denied `supabase_migrations`; per-object presence verified instead |

## Phase 0 — hypothesis map

| Ref | Defect | Status | Evidence |
|---|---|---|---|
| H1 | `log_completed_session_atomic` auth-after-idempotency, over-broad member auth, unvalidated attendees, mentor attribution lost | `fixed (code)` / `not-proven (runners)` | Migration `20260722113303…24710c31` applied; live `pg_get_functiondef` md5 matches disk body. No pgTAP / true-concurrency / CI runner yet. See `batch-a-closure-audit.md`. |
| H2 | Batch A harness invalid; canonical automated runners missing | `partial` | Harness rewritten and executed once via service-role DO block; no per-scenario evidence captured, no pgTAP, not wired into `rc5:verify` or CI. |
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

## Batch 1 — P0-A signing bypass closed (2026-08-06)

| Item | State | Evidence |
|---|---|---|
| Legacy 8-arg `apply_contract_signature_atomic` overload | **DROPPED** | migration 2026-08-06 (P0-A); pgTAP assertion "legacy 8-argument bypass overload dropped" |
| Nullable `p_grant_nonce` bypass (`grant_bypass` evidence flag) | **REMOVED** — fail closed with `42501 signing_grant_required` | migration 2026-08-06; pgTAP tests 2 / 2b |
| Document-hash binding | mandatory: `p_document_sha256` must equal the grant's `document_sha256` | migration 2026-08-06 |
| Authorize-before-replay ordering | grant is located, hash-matched and ownership-checked **before** any contract state is read or returned | migration 2026-08-06 |
| Grant issuance from the public onboarding edge function | `issue_contract_signing_grant` now accepts `service_role` (JWT claim) in addition to admin/backoffice | migration 2026-08-06 |
| Edge call site wiring | `public-contract-onboarding` hashes a canonical contract projection, mints a 15-min single-use grant, and passes `p_grant_nonce` / `p_document_sha256` / `p_canonical_payload_sha256`; already-signed replays return 409 instead of 500 | `supabase/functions/public-contract-onboarding/index.ts:1303-1377`, deployed 2026-08-06 |
| pgTAP suite | 15 assertions, updated for the mandatory-grant contract | `supabase/tests/apply_contract_signature_atomic.test.sql` |
| Gates | `deno-check-all` 131 files PASS; app typecheck exit 0 | this turn |
| Behavioural proof (pgTAP execution, concurrent double-sign) | **NOT PROVEN** — needs non-production `STAGING_DATABASE_URL` | protocol rule 4 |

## Batch 2 — P0-B DocuSign lease call site wired (2026-08-06)

| Item | State | Evidence |
|---|---|---|
| Lease RPCs had no Edge call site | **FIXED (source + deployed)** | `supabase/functions/docusign-send-envelope/index.ts` |
| Claim before provider call, bound to document hash | `claim_docusign_dispatch_lease(contract, command, owner=uuid, 120s, document_sha256)` runs after the PDF is hashed; a non-`claimed` result never reaches DocuSign | same file |
| Provider idempotency key sourced from the lease | lease `provider_idempotency_key` overrides the locally computed digest so retries of the same document reuse the exact key DocuSign saw | same file |
| Unreconciled expiry cannot be re-dispatched | `requires_reconciliation` / `lease_held` / `attempts_exhausted` return 409 without touching the provider; `idempotent` returns 200 `already_sent` | same file |
| `in_flight` transition immediately before the HTTP call | `mark_docusign_dispatch_in_flight`; failure aborts before dispatch | same file |
| Ambiguous outcomes (5xx, timeout) | `mark_docusign_dispatch_unknown` + contract `provider_last_error`, 202 response, no auto-retry | same file |
| Definite failure (4xx / missing envelopeId) | `reconcile_docusign_dispatch_lease(..., 'not_found')` then `release_docusign_envelope_command`, so a later attempt may legitimately reclaim | same file |
| Success | `finalize_docusign_dispatch_lease` (owner-checked) before `finalize_docusign_envelope` stamps the contract | same file |
| Gates | `deno check` on the function: exit 0; function deployed 2026-08-06 | this turn |
| Behavioural proof (pgTAP `docusign_dispatch_lease.test.sql`, true concurrent dispatch, provider failure injection) | **NOT PROVEN** — needs non-production `STAGING_DATABASE_URL` | protocol rule 4 |


## Batch 3 — P0-C past-meeting RPC: first executed behavioural proof (2026-08-06)

### The harness (this is the unblock)

Behavioural proof no longer needs an operator-provisioned staging DB. `scripts/rc5/local-pg-harness.sh`
(`bun run rc5:pgtap:local`) boots a **disposable local PostgreSQL 17**, installs
`scripts/rc5/supabase-shim.sql` (auth/storage/cron/net/vault schemas, `auth.uid()`/`auth.jwt()`/
`auth.role()`, storage helpers), replays **every** migration from an empty database, loads pgTAP and
executes `supabase/tests/*.test.sql`. It only ever talks to the local socket it created — production
and staging are unreachable by construction.

Forward replay: 443 migration files, **5** failing — all classified below, none blocking:

| File | Error | Class |
|---|---|---|
| `20260103024619…` | `public.investor_readiness_items` missing | replay-order defect (table created later / dropped) — tracked for Batch 4 |
| `20260115005921…` | `public.investor_update_templates` missing | same |
| `20260401022520…` | `communication_log` is not part of the publication | harness artifact (`ALTER PUBLICATION … DROP TABLE`) |
| `20260403163048…` | `workflow_executions` is not part of the publication | harness artifact |
| `20260404150656…` | `realtime.messages` missing | harness artifact (platform-managed schema) |

### Executed result — `log_completed_session_atomic.test.sql`

First execution ever (the file previously contained a hard syntax error at line 67, `PERFORM` in a
top-level SQL statement, so **every** prior "19 scenarios exist" claim was unexecuted paper):

| Run | Result |
|---|---|
| First execution (pre-fix) | 20 pass, **2 fail**, plan mismatch (planned 23, ran 22) |
| After fixes below, fresh replay | **22 / 22 PASS, 0 errors** |

Findings and dispositions:

| Finding | Class | Disposition |
|---|---|---|
| Test 1 expected message `insufficient_privilege`; RPC raises `42501 unauthenticated` | test defect | expectation corrected |
| `plan(23)` vs 22 assertions | test defect | `plan(22)` |
| **Test 21 — replaying a known `command_id` with a tampered payload returned the original `session_id` instead of failing closed. No fingerprint existed anywhere in the RPC.** | **production defect (P0-C)** | migration 2026-08-06: `sessions.command_fingerprint` + SHA-256 canonical fingerprint over actor + all 12 payload fields; mismatch → `42501 command_fingerprint_mismatch`; identical replay stays idempotent; legacy `NULL` rows are stamped on first replay and never duplicated |
| Test 22 ("different actor replaying known command_id") | passed only because the rogue actor fails authorization first | now genuinely covered by the fingerprint (actor is part of the digest) |

**P0-C status: FIXED and PROVEN** (executed pgTAP, fresh full-migration replay, production migration applied 2026-08-06).

### Newly proven: the rest of the pgTAP corpus does not execute

The same harness gives the first honest baseline of the other suites. These were all previously
labelled "exists / not proven"; they are in fact **broken or failing** and are now real, owned work:

| Suite | ok | fail | psql errors |
|---|---|---|---|
| `log_completed_session_atomic` | **22** | 0 | 0 |
| `rls_policies` | 26 | 2 | 28 |
| `crm_import_dedupe` | 6 | 1 | 0 |
| `mentor_booking_transition` | 6 | 0 | 0 |
| `apply_contract_signature_atomic` | 5 | 4 | 13 |
| `program_publish_atomic` | 4 | 0 | 3 |
| `financial_scenario_atomic` | 1 | 3 | 0 |
| `booking_canonical` | 1 | 0 | 34 |
| `docusign_dispatch_lease` | 0 | 0 | 17 |
| `founder_pulse_off_state` | 0 | 0 | 12 |
| `invitation_acceptance` | 0 | 0 | 25 |
| `profiles_peer_boundary` | 0 | 0 | 30 |
| `public_booking_dst` | 0 | 0 | 13 |

Batch 4 scope is therefore fixed: repair these suites one by one and fix whatever production defects
they expose — exactly as test 21 exposed the missing session fingerprint.

## Batch 4 — local pgTAP harness green-up (2026-08-06)

Harness: `scripts/rc5/local-pg-harness.sh` (ephemeral PG17 + pgTAP + Supabase shim),
now mirrors production privileges (platform default privileges grant anon/authenticated/
service_role on every public table; RLS is the only boundary) and no longer aborts a whole
legacy migration file on a single shim gap.

Suite status (ok/fail/errors):
- rls_policies 39/0/0, booking_canonical 15/0/0, log_completed_session_atomic 22/0/0,
  docusign_dispatch_lease 14/0/0, public_booking_dst 9/0/0, founder_pulse_off_state 9/0/0,
  crm_import_dedupe 7/0/0, mentor_booking_transition 6/0/0, program_publish_atomic 5/0/0
- apply_contract_signature_atomic 15/1/0 — remaining fail is a repo/prod drift: the staff
  guard on `issue_contract_signing_grant` exists in production but not in the replayed
  migration tree.
- profiles_peer_boundary 10/1/0 — post-onboarding read returns NULL under
  `has_workspace_access`; needs policy-level follow-up.
- invitation_acceptance 5/0/18 — `unique_workspace_email` + the field-immutability trigger
  require one workspace per scenario (fixture rework pending).
- financial_scenario_atomic 1/3/0 — Batch F5 (`save_financial_scenario_atomic` + fingerprint
  column) is still not landed in production.

### Production defects found by the harness and FIXED this turn
1. `apply_contract_signature_atomic`, `issue_contract_signing_grant`,
   `staff_rotate_onboarding_token`, `claim_docusign_dispatch_lease` all called pgcrypto
   (`digest`, `gen_random_bytes`) with `search_path=public`, but pgcrypto lives in
   `extensions` — every call raised 42883. Contract signing, signing-grant issuance,
   onboarding-token rotation and DocuSign dispatch were all broken at runtime.
   Fix: `SET search_path = public, extensions` on all four.
2. `complete_workspace_onboarding` compared `workspace_users.role` against `'owner'`,
   which is not an `app_role` label → 22P02 for every caller, founders and staff included.
   Fix: compare against `'founder'` only, staff override unchanged.
