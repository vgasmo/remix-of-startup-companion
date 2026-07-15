# Production Recovery Remediation Plan

Live app. Data integrity > new features. All schema changes are additive/corrective — no history rewrites. Every phase produces read-only evidence before mutating anything.

## Phase 0 — Freeze & Truth (this pass, before any writes)

1. **Double kill-switch for reconciler**
   - Keep `RECONCILER_WRITE_MODE` env check in `reconciler-run`.
   - Add DB-side `system_settings.reconciler_writes_enabled` (default `false`). Function reads both; either off = 423.
2. **Hide `/staff/impact`**
   - Route renders a "Beta — data under repair" panel behind an admin-only flag until Phase 3 lands.
3. **DB introspection report** (read-only via psql):
   - Overloads of `reconcile_active_customer`.
   - Columns on `workspaces` (`status` vs `access_status`, `program_id` vs `programme_id`), `startups` (confirm `hubspot_company_id` absent).
   - `engagement_state` CHECK values.
   - `storage.buckets` rows for `bug-report-screenshots`, `phc-extracts`, `admin-exports`.
   - Applied migration list around the meeting backfill.
   - Row counts for sessions with `completed_at` set by the backfill (via `updated_at` window + `actual_duration_minutes = duration`).
4. Deliverable: `docs/reconciliation/phase0-truth-<date>.md` with actual query output. No writes yet.

## Phase 1 — Reconciler contract unification

Migration 1 (additive):
- Drop obsolete overload `reconcile_active_customer(jsonb, text, boolean)` **only after** grep confirms zero callers.
- Canonical signature: `reconcile_active_customer(p_batch_id uuid, p_input jsonb, p_service_program_map jsonb, p_idempotency_key uuid, p_dry_run boolean) returns jsonb`.
- Body writes to `bulk_import_batches` + `bulk_import_rows` (before-snapshot, proposed after-snapshot, plan_hash).
- Uses canonical columns only: `workspaces.status`, `workspaces.program_id`, `engagement_state ∈ {prospect, active, paused, churned, service_only}`.
- Never references `startups.hubspot_company_id`; matches via `funnel_items.phc_customer_id`, `nif_normalized`, `external_entity_refs`.
- Workspace selection: filter by `program_id + service_classification + archived_at IS NULL`; ambiguity → conflict, never `LIMIT 1`.

Edge function `reconciler-run`:
- New request payload matching RPC.
- Server computes `plan_hash = sha256(sorted ids + service_map + program_map + input row snapshots)`; returns it in plan response.
- Commit body must echo `plan_hash`; server re-verifies row `updated_at`/version unchanged, else rejects `stale_plan`.
- Commit refuses if plan had any conflicts or errors.
- Commit result reports per-row status; overall `errors > 0` returns 207 and UI shows failure.

New RPC `reconcile_rollback(p_batch_id uuid, p_row_ids uuid[])`:
- Restores before-snapshot for updated fields.
- Deletes newly-created startups/workspaces only when: created_by = reconciler, no memberships, no contracts, no sessions.

Canary Panel:
- Show `plan_hash` after plan; disable commit until IDs+maps unchanged.
- Disable commit if `conflicts>0 || errors>0`.
- Add "Rollback batch" action.

## Phase 2 — Census authoritative

- Fix `census-run`: query `workspaces.status`, collect per-query errors into `errors[]`, fail entire run if any error.
- Replace ad-hoc CSV split with a proper parser (delimiter detection, quoted fields, CRLF, BOM) — reuse `_shared/spreadsheetParse.ts`.
- Add exception queries producing row-level CSVs: orphan contracts, unlinked contracted funnel, dup PHC/NIF, wrong-programme workspaces, service-only-with-programme, active contracts >1.
- Upload result CSVs to `admin-exports` bucket.
- Wire to `AdminDataImportV2` with upload → run → status → exceptions download → sign-off (writes `activity_log`).

## Phase 3 — Impact & meeting backfill correction

Migration 2 (quarantine, since backfill already ran in prod):
- Create `sessions_backfill_quarantine` snapshot table with the affected row IDs + before values.
- Identify affected rows: `status='completed' AND completed_at IS NOT NULL AND actual_duration_minutes = duration AND updated_at BETWEEN <backfill window>` and no independent evidence (no artifacts, no participants beyond auto-inserted, no feedback).
- Copy those rows to quarantine, then revert on the live row: `status='scheduled'`, `completed_at=NULL`, `actual_duration_minutes=NULL`.
- Preserve any session that has real evidence (participants inserted post-backfill, transcript, artifacts, feedback).

Migration 3 (impact RPC contract):
- Rewrite RPC using `w.program_id`.
- Choose flat contract (matches SQL) — update `StaffImpact.tsx` to consume flat fields; add Zod-parsed runtime validation.
- Apply RLS-equivalent filters inside RPC: consultants see own portfolio, admins ecosystem.

Frontend:
- StaffImpact: loading/empty/error/retry states. Errors never render as "Sem dados".
- Session completion dialog: capture `status, actual_duration_minutes, primary_consultant_id, completed_at, session_template_id`, participant attendance list.
- Tool usage instrumentation: canonical event taxonomy (`playbook_step_completed`, `template_generated`, `checkin_submitted`, etc.), not page views.

## Phase 4 — Backup, storage, ecosystem, bug reports

- `run-ecosystem-snapshot`: replace `profiles_safe` query with new `profiles_export` view (security definer, service-role only) OR select `profiles` directly with the service client. Assert `profiles.count >= expected` before marking snapshot successful.
- Migration 4: `insert into storage.buckets (id, name, public) values (…) on conflict do nothing` for `bug-report-screenshots`, `phc-extracts`, `admin-exports`. Use `supabase--storage_create_bucket` if needed (per instructions).
- `BugReportWidget`: track uploaded paths; on any failure or exception, best-effort remove all previously uploaded paths in that attempt.
- `ConsultorPortfolioView`: replace `parseInt(health)` with enum→color map.
- `list_ecosystem_items_v2`: include contracted funnel rows without workspace, tagged `operational_state='awaiting_workspace'`.

## Phase 5 — Release gates

- Fix all 20 typecheck errors: add typed `Insert`/`Update` payload helpers stripping joined/read-only fields; remove `as any` in affected files.
- Add 50 missing `impact.*` keys to PT and EN (run `i18n-lint` to enumerate).
- New tests:
  - `reconcile_active_customer` SQL: plan, commit, replay, stale-plan, conflict, rollback.
  - `census-run` fixture: query error → hard fail.
  - Impact RPC: contract + permission tests.
  - Session completion write path.
  - Snapshot nonzero profiles assertion.
  - BugReport upload cleanup on partial failure.
- Run: `bun run build`, `tsgo`, `eslint`, `vitest run`, `node scripts/i18n-check.cjs`, `node scripts/i18n-lint.mjs`, `node scripts/secret-scan.cjs`.

## Mandatory live canary (executable from this sandbox via psql)

I have psql access to the live DB. I will:
1. Run full read-only census; deliver totals + exceptions CSV.
2. Select 5 canary funnel_item IDs (exact match, new founder, service-only, mixed, intentional conflict) — surfaced to you for approval before commit.
3. Dry-run 5, record `plan_hash`.
4. **Pause for your explicit approval** with the plan_hash before enabling `reconciler_writes_enabled=true` and committing the 4 valid rows.
5. SQL evidence post-commit + replay proving idempotency.
6. Rollback one row via `reconcile_rollback`, prove before-state restoration.
7. Recommit, prove final state.

I will not enable writes without your explicit go on the canary plan.

## Technical details

**Migrations added** (order):
1. `..._phase0_add_reconciler_writes_setting.sql` — `system_settings.reconciler_writes_enabled`.
2. `..._phase1_reconciler_rpc_canonical.sql` — new signature, drop old overload, `reconcile_rollback`.
3. `..._phase3_quarantine_backfilled_sessions.sql` — snapshot + revert.
4. `..._phase3_impact_rpc_v2.sql` — `program_id`, flat contract, permission filters.
5. `..._phase4_storage_buckets.sql` (guarded) + `profiles_export` view.

**Files changed** (non-exhaustive):
- `supabase/functions/reconciler-run/index.ts` — new contract, plan_hash.
- `supabase/functions/census-run/index.ts` — column fix, error collection, exception CSVs.
- `supabase/functions/run-ecosystem-snapshot/index.ts` — non-empty assertion.
- `src/components/admin/ReconcilerCanaryPanel.tsx` — plan_hash binding, rollback.
- `src/pages/StaffImpact.tsx` — flat contract + error/empty/retry states + beta gate.
- `src/pages/AdminDataImportV2.tsx` — census wiring.
- `src/components/ecosystem/ConsultorPortfolioView.tsx` — health enum colors.
- `src/components/support/BugReportWidget.tsx` — upload cleanup.
- `src/i18n/*` — 50 impact keys.
- ~10–15 files for typecheck payload types.

**Estimated size**: 3–4 focused turns for P0+P1 code + migrations, 1 turn for canary, 1 turn for release gates + tests. I'll pause for approval at each migration and before enabling live writes.

Approve to proceed with Phase 0 (freeze + introspection report). Nothing gets mutated in Phase 0.