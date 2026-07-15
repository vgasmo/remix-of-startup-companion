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
