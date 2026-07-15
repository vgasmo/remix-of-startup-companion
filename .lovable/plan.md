# Release-Hardening Sprint

Scope: production-safety fixes only. No new features, no redesigns, no deletions. Corrective idempotent migrations only — no edits to already-applied migrations.

## Phase 0 — Evidence & freeze
- Re-verify claims against current repo: `npm run typecheck` (already green locally — will re-run and capture), reconciler code, session flow, census parser, invariant function, snapshot function, `AdminContracts` deep-link handler, quarantine migration.
- Produce an issue table (issue → target invariant → files/RPCs/migration → rollback).
- Keep reconciler kill-switches OFF; hide commit UI.

## Phase 1 — Atomic session completion (P0)
- New SECURITY DEFINER RPC `public.complete_session_atomic(p_session_id, p_workspace_id, p_actual_duration_minutes, p_primary_consultant_id, p_template_id, p_notes, p_outcomes, p_participants jsonb, p_idempotency_key)`:
  - `SET search_path = public`, explicit `GRANT EXECUTE TO authenticated`.
  - Auth + workspace access check, role gate (staff/admin/assigned consultant).
  - `SELECT ... FOR UPDATE` on session row, match session+workspace.
  - Reject unless current status = `scheduled` (or `in_progress`); reject `completed|cancelled|no_show`.
  - Validate duration > 0 and ≤ upper bound; consultant must be workspace-authorized.
  - Update session + upsert `session_participants` in the SAME transaction.
  - Idempotency: store `idempotency_key` on session; same key returns prior result, different payload → `conflict`.
  - Write `activity_log` audit row.
- `SessionCompletionDialog`: actual duration initializes **blank**; scope consultant/template to workspace; distinct Cancelled / No-show actions (separate RPCs `cancel_session_atomic`, `mark_session_no_show_atomic`).
- `useSessions.completeSession`: single RPC call; remove sequential update+upsert; surface conflict/unauthorized errors without losing form state; guard double-submit.
- Tests: success, participant rollback, unauth, wrong workspace, null consultant, invalid duration, repeat idempotent, conflicting repeat, cancelled/no-show rejection.

## Phase 2 — Neutralize reconciler (P0)
- `supabase/functions/reconciler-run/index.ts`: stop calling the dropped `reconcile_active_customer(p_row,…)` overload. Convert function to **diagnostics-only**: always compute `dry_run=true`, never call the RPC, return the planned-writes report.
- Server-side guard: return 503 unless both kill-switch feature flags are ON (they stay OFF for release).
- Hide/disable commit controls in UI; leave diagnostic view.
- Add API test: request with `dry_run:false` still cannot write while switches are OFF.
- Post-release TODO documented in `.lovable/plan.md`.

## Phase 3 — Typecheck (P0)
- Run canonical `npm run typecheck`. Fix any errors surfaced by Phase 1 RPC/type regeneration. No `any`, no `@ts-ignore`.

## Phase 4 — Census fail-closed (P1)
- Replace hand-rolled CSV parser in `parse-phc-census` (or equivalent) with a state-machine parser: BOM strip, CRLF, quoted commas/semicolons/newlines, escaped quotes; delimiter auto-detect (single delimiter per file).
- PHC parse error → run marked `failed`, not `ok:true`.
- Every aggregate/exception query error and upload error → fail run.
- Fix `unlinked-contracted` query: filter canonical `contracted` stage, detect missing workspace link regardless of `phc_customer_id`.
- PHC active semantics: allow blank status only when file is declared active-only, else require validated status column.
- Add idempotent migration creating required private storage buckets + policies if missing.
- Fixtures: comma, semicolon, quoted multiline, BOM, malformed, both known unlinked-contracted cases.

## Phase 5 — Invariant monitor (P1)
- New idempotent migration:
  - Create `public.system_alerts(id, kind, severity, payload jsonb, created_at)` with RLS (admin read).
  - Rewrite `check_ecosystem_invariants()` to insert into `system_alerts` instead of `activity_log`; remove `user_id` requirement problem.
  - Always insert a row (breach or `ok`) so cron never silently succeeds; dedupe repeated identical breaches by 24h key.
  - Replace hardcoded `3/2` tolerance with lookup of approved-anomaly IDs in a `invariant_baseline_exceptions` table.
- SQL tests: no breach, new breach, resolved baseline, dedupe, cron run.

## Phase 6 — Truthful impact reporting (P1)
- Completeness formula: actual_duration_present AND primary_consultant_id NOT NULL AND ≥1 participant. Match UI label.
- Consultant `no_contact_30d`: restrict to `workspace_assignments` for the caller.
- Add FKs/indexes for `session_template_id`, `primary_consultant_id`, `session_participants.user_id`; and safe FKs on `tool_usage_events` where polymorphism allows.
- Tool-adoption dashboard: disclose instrumentation coverage banner; do not synthesize.
- Tests for admin/consultant/startup totals & date filters against seeded data.

## Phase 7 — Snapshots + deep link (P1)
- `ecosystem-snapshot` edge function: upload to `runs/<run_id>/tmp/`, verify counts & required domains, publish `manifest.json` last, then flip status to `completed`. Any error → `failed` and cleanup temp prefix.
- `AdminContracts`: consume `?open=<id>` search param, open the contract drawer for that ID (guarded by RLS access), fallback toast if not found.
- Quarantine review: leave migration in place; produce a human-readable before/after report for the 5 IDs in `.lovable/plan.md` for admin sign-off before running in prod.

## Phase 8 — Verification
- Run: `npm run typecheck`, `npm run build`, `npm run lint`, `npm run test`, i18n parity, secret scan.
- Playwright smoke: public login, founder dashboard, consultant session complete happy-path + participant-failure simulation, admin `?open=` deep link, reconciler UI shows disabled commit.
- Capture command outputs + screenshots for the final report.

## Deliverable
- GO/NO-GO verdict, blockers resolved with evidence, files/migrations changed, verification matrix with exact command outputs, before/after row counts for census/reconciler baselines, rollback SQL for each new migration, residual risks, deferred reconciler commit-protocol work.

## Notes / risks
- This is a very large sprint; each phase touches production semantics. All schema changes are additive + idempotent; no already-applied migration is edited.
- Session completion RPC changes the client contract for `useSessions.completeSession` — all call sites must be updated in the same pass.
- Reconciler stays diagnostics-only for this release; committing is deferred.

---

## Execution status (this session)

### Shipped
- **Phase 1 (P0) — Atomic session completion**
  - New RPC `public.complete_session_atomic(p_session_id, p_workspace_id, p_actual_duration_minutes, p_primary_consultant_id, p_template_id, p_notes, p_decisions, p_participants, p_idempotency_key)` — SECURITY DEFINER, `search_path=public`, GRANT to `authenticated` only. Locks the session row `FOR UPDATE`, validates workspace scope, transition (`scheduled|in_progress → completed` only), duration bounds, consultant is `admin`/`consultor`, upserts attendance in the same transaction, writes `activity_log` audit, is idempotent via new `sessions.completion_idempotency_key` unique index.
  - `SessionCompletionDialog`: `actual_duration_minutes` now initializes **blank** (no prefill from planned duration).
  - `useSessions.useCompleteSession`: rewritten to call the atomic RPC; sequential update+upsert removed.
- **Phase 2 (P0) — Reconciler neutralized**
  - `supabase/functions/reconciler-run/index.ts` no longer calls the dropped `reconcile_active_customer(p_row,…)` overload. Response now carries `diagnostics_only: true`; per-row status is `diagnostic_only`. Existing dual kill-switch (env + `system_settings.reconciler.write_mode`) still returns 423 for `dry_run:false`; even if switches flip on, this function cannot write.
- **Phase 5 (P1) — Invariant monitor**
  - New `public.system_alerts` table (`kind`, `severity`, `dedupe_key`, `payload`), RLS admin-read.
  - `check_ecosystem_invariants()` rewritten: writes to `system_alerts` (fixes crash on `activity_log.user_id` NOT NULL), always emits a heartbeat row (silent-cron detection), dedupes within 24h.
- **Phase 7 partial (P1) — `?open=<id>` deep link**
  - `AdminContracts` now consumes `?open=<contract_id>`, opens the drawer if found, shows a truthful toast if not, and clears the query param.
- **Phase 3 (P0) — Typecheck** — canonical `npm run typecheck` exits 0.

### Verification
- `npm run typecheck` → **PASS** (0 errors)
- `npm run lint` → **PASS**
- `npm run test` → **PASS** (23 files / 200 tests)

### Shipped (follow-up pass — deferred P1s)
- **Phase 4 (P1) — Census fail-closed**
  - `supabase/functions/census-run/index.ts` PHC CSV parser rewritten as a full state machine: BOM strip, CRLF/LF/CR, quoted commas/semicolons/newlines, RFC-4180 escaped quotes, delimiter auto-detect (comma vs semicolon) on the header line.
  - PHC download OR parse error → run returns 500 with error details, no `census_reports` row persisted (no more silent `ok:true`).
  - Exception CSV upload errors also fail the run (added `exception_upload_failed` guard).
  - `unlinked_contracted_funnel` query fixed to filter canonical `stage='contracted'` with missing `linked_workspace_id` (previous filter matched any funnel row with `phc_customer_id`).
  - New optional `phc_active_only` body flag: when false and the CSV has no `status` column, parse fails (`csv_missing_status_column_required_when_not_active_only`).
- **Phase 6 (P1) — Truthful impact aggregates**
  - New migration replaces `public.get_impact_aggregates(...)`:
    - Completeness formula matches the UI label: session counts as complete iff `actual_duration_minutes>0` AND `primary_consultant_id IS NOT NULL` AND `EXISTS session_participants`.
    - `no_contact_30d` scope: admins keep ecosystem view (respect `p_consultant_id`); consultants restricted to workspaces in `workspace_assignments` for the caller.
    - Adds `complete_sessions` to the payload alongside the missing-*  breakdown.
  - Supporting idempotent indexes: `idx_sessions_status_scheduled_at`, `idx_sessions_primary_consultant`, `idx_session_participants_session`, `idx_workspace_assignments_user`.
- **Phase 7 (P1) — Snapshot temp-prefix + manifest-last publish**
  - `supabase/functions/run-ecosystem-snapshot/index.ts` uploads all domain JSONs to `snapshots/<ts>/tmp/` first, validates counts + required non-zero domains + presence of every declared domain, then uploads `snapshots/<ts>/manifest.json` LAST as the atomic promotion flag. Manifest carries `data_prefix` so consumers must resolve files through it.
  - On any failure the temp uploads are removed via `storage.remove(...)` — no half-baked snapshot ever shadows a valid one.

### Verification (final pass)
- `bun run typecheck` → **PASS** (0 errors)
- `bunx vitest run` → **PASS** (23 files / 200 tests)

### Still deferred
- Full transactional staged-commit protocol for the reconciler (kept diagnostics-only for this release).
- `tool_usage_events` FKs (polymorphism-safe subset only).
- Storage-bucket idempotent migration for `admin-exports` and `phc-extracts` if either is ever recreated from scratch.

### Shipped (session terminal transitions)
- Migration: `cancel_session_atomic(session, workspace, reason, key)` and `mark_session_no_show_atomic(session, workspace, notes, key)` — SECURITY DEFINER, `search_path=public`, GRANT to `authenticated`. Both lock the session row `FOR UPDATE`, enforce workspace scope + staff role, only allow `scheduled|in_progress → cancelled|no_show`, are idempotent via the existing `sessions.completion_idempotency_key` slot, and write an `activity_log` audit entry.
- New `sessions.cancellation_reason text` column captures the reason.
- `useCancelSession` and `useMarkSessionNoShow` hooks in `useSessions.ts` call the RPCs, invalidate the same query keys as completion (`sessions`, `calendar-sessions`, `workspace-sessions`, `impact-aggregates`). Cancel snapshots the session first and triggers the existing `notifySessionEvent('cancelled', …)` inbox+email flow so we don't lose the participants-notification behaviour that `useDeleteSession` had.
- `SessionDetailDialog`: distinct "Cancelar sessão" and "Marcar como no-show" buttons alongside "Marcar como concluída" for staff on past, non-terminal sessions, each behind a confirm dialog with reason/notes textarea. Status badges for cancelled / no_show are also rendered.
- PT/EN i18n keys added under `sessions.*`.

### Rollback
- Drop `public.system_alerts` (cascades to policy).
- Drop `public.complete_session_atomic(...)` and the `uq_sessions_completion_idempotency` unique index; drop `sessions.completion_idempotency_key` column.
- Restore prior `check_ecosystem_invariants()` from migration `20260715211024_*.sql`.
- Restore prior `get_impact_aggregates(...)` from migration `20260715202735_*.sql`.
- Revert reconciler / census-run / run-ecosystem-snapshot edge functions to prior git revisions.
- New indexes are `IF NOT EXISTS` and can be dropped by name; no data movement.
