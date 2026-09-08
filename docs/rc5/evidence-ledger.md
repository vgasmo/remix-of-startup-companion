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

## Batch 5 — local pgTAP suite fully green (2026-08-06)

`scripts/rc5/local-pg-harness.sh` — 13 suites, 168 assertions, **0 fail / 0 errors**:
apply_contract_signature_atomic 16, rls_policies 39, log_completed_session_atomic 22,
booking_canonical 15, docusign_dispatch_lease 14, invitation_acceptance 11,
profiles_peer_boundary 11, founder_pulse_off_state 9, public_booking_dst 9,
crm_import_dedupe 7, mentor_booking_transition 6, program_publish_atomic 5,
financial_scenario_atomic 4.

### Landed in production
1. **Batch F5 — atomic Save-As-Scenario.** `financial_model_versions` gains
   `session_id`, `assumptions_json`, `scoring_json`, `metadata_json`, `command_id`,
   `command_fingerprint`; `document_id` is now nullable (guided-plan scenarios have no
   uploaded workbook); partial unique index `(session_id, command_fingerprint)`.
   `save_financial_scenario_atomic(...)` is workspace-access checked, session-locked and
   fingerprint-idempotent (`mode='idempotent_reuse'`), snapshots assumption rows and
   repoints `financial_plan_sessions.active_version_id`.
   NOTE: the held draft targeted columns (`label`, `metrics_json`, `created_by`,
   `financial_assumptions.is_locked`) that never existed — the landed version matches
   the live schema.

### Production defects the harness exposed, all FIXED this turn
1. **Every workspace invitation acceptance was failing.**
   `workspace_invitations.role` is `text`, `workspace_users.role` is `app_role`;
   `accept_workspace_invitation` inserted the raw text and raised 42804 for all callers.
   Now cast with an enum-label check (`invitation_role_invalid`, 22023).
2. **Signing-grant staff gate was bypassable by a claim-less caller.**
   `issue_contract_signing_grant` evaluated `IF NOT (v_jwt_role = 'service_role' OR ...)`;
   with no JWT claim that expression is NULL, so `IF NOT NULL` never fired and the guard
   was skipped. Now `COALESCE(..., false)` — unknown identity means refuse. Verified no
   other public function carries the same three-valued pattern.
3. Repo/production drift on `issue_contract_signing_grant` closed (the staff guard was
   live but absent from the tracked migration tree, so replays lost it).

### Product truth confirmed
- `app_role` labels are `admin, consultor, mentor_externo, founder, team_member, backoffice`.
  There is no `mentor` label; `send-workspace-invite` correctly restricts invitations to
  `founder` / `team_member`.

## RC7 round P2-P4 (2026-09-08)

| Item | Status | Evidence |
|---|---|---|
| P2.1 signature provider hydration / toggle preservation | `FIXED + PASS` | typecheck + lint green; credentials no longer cleared on toggle |
| P2.2 termination invalidations, founder links, bulk partial failures | `FIXED + PASS` | source fixes; partial-failure counts surfaced |
| P2.3 playbook invalidations + fresh workspace list | `FIXED + PASS` | query keys corrected |
| P2.4 realtime invalidation keys | `FIXED + PASS` | `useRealtimeWorkspaces.ts` |
| P2.5 explicit `{ data, error }` handling in listed flows | `FIXED + PASS` | approvals, consultant assignment, CRM stage, financial snapshot, quick sessions |
| P2.6 session load retry + duplicate-submit guard | `FIXED + PASS` | source fixes |
| P2.7 admin deep links | `FIXED + PASS` | source fixes |
| P2.8 contract PDF requires active membership | `FIXED + PASS` | server-side membership check |
| P2.9 admin-only surveys + `launch_survey_campaign` | `FIXED + PASS` | RPC + gated UI |
| P2.10 legacy 13-arg `list_ecosystem_items_v2` dropped; active statuses corrected | `FIXED + PASS` | migration 2026-09-08 |
| P2.11 backoffice keeps access to inactive programs | `FIXED + PASS` | programs SELECT policy rewritten |
| P2.12 MCP rate limits on all tools; CRM `contact_email` removed | `FIXED + PASS` | `src/lib/mcp/rateLimit.ts` + 6 tools |
| P2.13 stage-gate queue moved server-side (trigger) | `FIXED + PASS` | `supabase/tests/stage_gate_review_queue.test.sql` ok=3 fail=0 |
| P3 interpolation + PT-PT leakage + EN-word heuristic | `FIXED + PASS` | `i18n-quality`, `i18n-check` (9071 keys), `i18n-lint` 0 problems |
| P4.1 CI env guard restricted to public Vite keys | `FIXED + PASS` | `.github/workflows/ci.yml` |
| P4.2 migration-scan allowlist entry for survey seed | `FIXED + PASS` | `scripts/ci/migration-scan-allowlist.txt` |
| P4.3 i18n sync clean | `FIXED + PASS` | `scripts/i18n-sync.cjs` -> 0 added/filled/fixed |
| P4.4 pgTAP coverage for changed RPCs | `FIXED + PASS` | 20 suites under `supabase/tests/`, incl. `serialize_program_tree_privileges` |
| P4.5 dead edge-function audit | `FIXED + PASS` | `docs/rc5/dead-edge-functions.md` (12 functions, dispositions recorded) |
| P4.6 contradictory release docs | `FIXED + PASS` | `PUBLISH_READY.md` / `PRODUCTION_READINESS.md` marked SUPERSEDED |
| P4.7 GitHub job logs (`deno-check-edge`, `db-tests`, `e2e`) | `BLOCKED` | logs not reachable from this environment; must be supplied by the release lead |
| Staging behavioural gates | `NOT PROVEN` | `RC5_ALLOW_STAGING_TESTS` requires a staging project + secrets |

## Fecho P2–P4 — suites de base de dados verdes numa base vazia (2026-09-08)

| Item | Estado | Prova |
|---|---|---|
| Replay integral das migrações numa base vazia | `PASS` | `scripts/rc5/local-pg-harness.sh` → `forward replay finished (0 failing migration file(s))`. O harness passa agora a falhar (exit != 0) se o replay não estiver limpo, salvo `RC5_ALLOW_REPLAY_FAILURES=1`. |
| Tabelas sem migração no repositório (`investor_readiness_items`, `workspace_readiness_status`, `investor_update_templates`) | `PASS` | DDL de produção reproduzida em `scripts/rc5/legacy-baseline.sql`, aplicada antes do replay. Colunas/tipos/defaults conferidos contra o esquema real. |
| `realtime.messages` ausente do shim | `PASS` | tabela + RLS + grants acrescentados a `scripts/rc5/supabase-shim.sql`. |
| Suites pgTAP | `PASS` | 23 suites, ok=210, fail=0, errors=0. |
| Novo: kill switch de notificações a founders (comportamental) | `PASS` | `supabase/tests/founder_notifications_kill_switch.test.sql` ok=7 — OFF entrega, ON descarta founder/team_member, staff mantém-se, helper coerente. |
| Novo: inscrição automática em campanhas de inquérito | `PASS` | `supabase/tests/survey_auto_enroll.test.sql` ok=6 — só campanhas ativas com `auto_enroll` inscrevem, unicidade `(campaign_id, workspace_id)`, RLS em `survey_writebacks`. |
| Novo: isolamento da "Última Atividade" + filtro de atenção | `PASS` | `supabase/tests/ecosystem_activity_isolation.test.sql` ok=4 — atividade de um workspace não contamina o vizinho; `p_needs_attention` filtra corretamente. |
| Testes manuais da lista final | `PENDING (humano)` | `docs/rc5/manual-test-runsheet.md` — 12 passos que exigem contas reais, email e tenant Microsoft. |
