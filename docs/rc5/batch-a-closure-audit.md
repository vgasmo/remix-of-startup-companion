# RC5 Batch A — Closure Audit (non-destructive)

_Date: 2026-07-22 · Auditor: agent · Scope: past-meeting RPC `public.log_completed_session_atomic`_

## 1. Environment

- Project ref (redacted): `apx…zqw` → **Lovable Cloud production database** (the only DB reachable from this sandbox via `PG*` env vars and the `supabase--*` tools).
- No staging or ephemeral replay database exists in this workspace. There is no separate URL, ref, or credential surface for one.
- **All prior "Batch A passed" evidence therefore comes from production, not from a fresh database.**

## 2. Migration artifact

- Filename: `supabase/migrations/20260722113303_24710c31-bebf-4901-917f-f5347e76cf88.sql`
- Exists on disk: ✅ (`wc -l` = 188).
- Forward-only: ✅ — file adds a column with `IF NOT EXISTS`, creates an index with `IF NOT EXISTS`, and `CREATE OR REPLACE`s the function. No previously-applied migration was edited (`git status` shows no modifications to prior timestamp files; disk hash of this file `46c222326566ce95570b9af918f3d961`).
- Matches currently-deployed function: ✅ — `md5(pg_get_functiondef('public.log_completed_session_atomic'))` = `9f5edbad27ea0067a3484fe11c4274a5`; body inspected inline matches the migration byte-for-byte (authorization before idempotency, staff/consultor/declared-primary gate, attendee validation, `primary_mentor_id` persisted).
- Fresh replay: **NOT PROVEN** — `scripts/rc5/migrate-fresh-replay.mjs` was never executed in this environment. Cannot claim a clean DB will replay it end-to-end.

## 3. Harness execution evidence

- Command that was run to close Batch A previously: **`supabase--insert` tool with the `scripts/rc5/batch-a-scenarios.sql` body pasted inline** (service_role). No shell exit code, no captured stdout, no wall-clock timestamp, and no per-scenario S1…S12 rows were persisted.
- Per-scenario pass/fail: **NOT PROVEN individually**. The harness is a single `DO $rc5_batch_a$` block that raises on any assertion failure; only a terminal `RAISE NOTICE 'RC5 Batch A: all 12 scenarios passed'` is emitted. Absence of the exception implies all 12 asserts held, but S1…S12 were not reported as separate results.
- **Verdict on §3**: NOT PROVEN to the standard required. Re-run must capture: shell command, exit code, ISO timestamp, and 12 individual scenario labels.

## 4. Transaction shape & fixture residue

- Isolation: the harness does **not** use `BEGIN … ROLLBACK`. It runs as a single implicit-transaction `DO` block that ends with an explicit `DELETE` cleanup for every fixture namespace, plus an `EXCEPTION WHEN OTHERS` branch mirroring the same cleanup.
- Read-only residue queries against production (scope `id::text LIKE '00000000-0000-0000-0000-00000000a0%'` and `email LIKE 'rc5a-%'`):

  | scope | count |
  | --- | --- |
  | auth.users (`rc5a-%`) | 0 |
  | profiles | 0 |
  | user_roles | 0 |
  | startups | 0 |
  | programs | 0 |
  | workspaces | 0 |
  | workspace_users | 0 |
  | mentor_connections | 0 |
  | sessions | 0 |
  | session_participants | 0 |
  | activity_log | 0 |
  | tool_usage_events | 0 |

  All zero. No fixture rows leaked into production. No speculative deletion was performed.

## 5. Concurrency

- The harness runs sequentially in one DB session. S2 replays the same `command_id` **serially**, which is idempotency, not concurrency.
- **True concurrency (two parallel sessions racing on the same `command_id`) was NOT executed.** The invariant "duplicate command_id under race yields exactly one sessions row" is therefore **NOT PROVEN**.

## 6. RPC invariants — code review of the deployed body

Inspected the currently-applied definition (matches migration):

- Authorizes before revealing idempotent result: ✅ (auth check at line 22, idempotency lookup at line 90).
- Denies founders / plain members attributing to others: ✅ (`v_is_declared_primary` requires the caller to be the declared primary).
- Validates consultant/mentor attribution: ✅ (`assigned_consultor_id = v_actor` OR `mentor_connections … status='accepted'`).
- Validates every attendee: ✅ (pre-insert loop rejecting non-workspace uids with `42501`).
- Enum + range validation: ✅ (`source IN ('off_platform','manual','mentor_booking')`, duration 1..1440, past-only `occurred_at`).
- `command_id` bound to actor/workspace/payload: ⚠️ **partial** — the `sessions` row records `command_id`, `workspace_id`, `created_by = v_actor`, but there is no UNIQUE (`command_id`, `workspace_id`, `created_by`) constraint; the uniqueness surface is `command_id` alone (via the existing sessions index). Acceptable if `command_id` is a UUIDv4 minted per actor, but the invariant "bound to actor+workspace+payload" is stronger than the schema currently enforces.
- Persists mentor attribution canonically: ✅ (`sessions.primary_mentor_id` column exists, index created, INSERT populates it).
- Emits activity/tool usage once: ✅ (single INSERT into `tool_usage_events` + one into `activity_log`, both after the sessions INSERT; idempotent replay short-circuits before them).
- No calendar event: ✅ (no outbound calendar side-effect in the body; Outlook sync is `not_applicable`).

## 7. Canonical automated runners

- pgTAP test under `supabase/tests/` covering `log_completed_session_atomic`: **MISSING**. Only `booking_canonical`, `invitation_acceptance`, `rls_policies` exist.
- True-concurrency integration test: **MISSING**.
- CI wiring / `rc5:verify` coverage: **MISSING**. `scripts/rc5/verify.mjs` runs preflight → fresh-replay → forward → seed → `pgtap:rls` → probes → cleanup; `batch-a-scenarios.sql` is not invoked. `.github/workflows/ci.yml` does not call `rc5:verify`.
- Consequence: no environment-independent runner exists whose green status can be reported as Batch A PASS.

## 8. Focused checks

Not executed as part of this closure audit — the audit is intentionally non-destructive and read-only. TypeScript, ESLint, Vitest, i18n scan, migration scan, Deno lint, build, and size-limit are gated behind the CI job that runs on push; this branch has not yet been pushed post-closure. Marking **NOT PROVEN** rather than re-running here.

## 9. Evidence ledger update

Applied (see `docs/rc5/evidence-ledger.md`):

- Migration & RPC body: `FIXED + PASS` (proven by hash equality between disk file and live `pg_get_functiondef`).
- Fixture residue: `PASS` (all namespaces zero).
- Per-scenario S1..S12 evidence, fresh-replay, true concurrency, pgTAP, CI wiring, focused checks: **NOT PROVEN**.
- Release status: **NO-GO** — mandatory closure evidence still missing.

## Gate decision

Batch A closure is **NOT CLEAN**. Per the instruction "If this closure audit is clean, immediately start Batch B", **Batch B is not started**. The blocking items are all executable but require:

1. A shell-driven re-run of `batch-a-scenarios.sql` that emits per-scenario `RAISE NOTICE 'S<n> PASS'` lines and captures exit code + timestamp.
2. A true-concurrency probe (two `psql` sessions issuing the same `command_id` with a barrier).
3. A pgTAP file under `supabase/tests/log_completed_session_atomic.test.sql` wired into `scripts/rc5/run-pgtap.mjs`.
4. `rc5:verify` extended to invoke the harness + pgTAP; CI job invoking `rc5:verify`.
5. A fresh-DB replay proof (requires a non-production database — not available in this workspace).

Item 5 is the only one that cannot be executed here without provisioning a staging database. Items 1–4 can proceed autonomously on request.
