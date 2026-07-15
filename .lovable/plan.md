
# Production Recovery Plan

Four phases delivered as separate, reviewable batches. Nothing writes to production data until an admin explicitly authorizes a canary after all dry-run invariants pass.

## Ground rules

- Read-only until a human approves a commit. `reconciler-run` refuses commits without an admin-issued authorization token and a matching authorized-ID allowlist.
- No user creation, membership grants, invitations, notifications, automations, or e-mail sends inside the import path.
- No hardcoded programme UUIDs. All programme mapping comes from an explicit `service_program_map` submitted by the operator.
- Every reconciliation row is a persisted `bulk_import_rows`-shaped record with `idempotency_key`, `before_snapshot`, `after_snapshot`, `actor`, `status`, `error`, and `committed_at`.
- Every code path guarding a write asserts the caller is `admin` via `has_role`, never via role columns on profiles.

## Phase 0 — Freeze and verify (read-only)

Deliverables:
- `reconciler-run` gains a hard `WRITE_MODE=false` env-driven kill switch. Commits return 423 Locked until an admin flips it via a new `system_settings` row (audited).
- New edge function `census-run` (admin-only, read-only) produces:
  - Counts and cross-tab of `funnel_items` × `phc_customer_id` presence × `metadata_json.phc_service_hint` × stage.
  - Counts of `startups`, `workspaces` (by `access_status`, `engagement_state`, `programme_id`), `startup_contracts`, `contract_intakes`, `workspace_users`, room allocations, `bulk_import_rows`.
  - Duplicate NIF and duplicate HubSpot company reports.
  - Distinct services observed and their current default classification.
- Operator uploads the authoritative PHC service extract as a CSV via `AdminDataImport` → stored in a private storage bucket `phc-extracts/` (admin-only RLS). Census joins that extract; the target customer count is derived, never hardcoded.
- Census output persisted to `bulk_import_batches` (new `kind='census'` row) and exported as CSV to the admin-downloadable storage bucket `admin-exports/` with a signed URL surfaced in the UI.

Gate to Phase 1: operator signs off on the census numbers in-app (recorded in `activity_log`).

## Phase 1 — Safe reconciliation

Schema (single migration):
- Extend `bulk_import_rows` with `status` enum (`ready`, `conflict`, `excluded`, `dry_run_ok`, `authorized`, `committed`, `failed`, `rolled_back`), `idempotency_key uuid unique`, `before_snapshot jsonb`, `after_snapshot jsonb`, `error jsonb`, `committed_at`, `rolled_back_at`.
- Add `workspaces.engagement_state text` (`operational`, `service_only`, `dormant`) separate from `access_status` (which stays `imported_unclaimed` until claim).
- Add `workspaces.service_classification text` and `workspaces.phc_customer_id text unique nullable`.
- RPC `public.reconcile_active_customer(...)` rewritten as `SECURITY DEFINER` and:
  - Reads identity by precedence `phc_customer_id → normalized NIF → HubSpot company ID`. Email is advisory only, never auto-link.
  - Rejects ambiguous matches (two rows for same key) with `status='conflict'` — no `LIMIT 1`.
  - Requires an explicit `programme_id` for `founder_journey` and `mixed`; otherwise `status='conflict'`.
  - Uses `metadata_json ->> 'phc_service_hint'` (correct path) — unknown service is `conflict`, never defaulted to `founder_journey`.
  - Excludes rows where PHC extract marks customer archived/rejected/inactive unless explicitly authorized.
  - Wraps startup + workspace + startup_contract + contract_intake linkage in a single transaction. Any failure rolls back that row.
  - Idempotent: same `idempotency_key` re-run is a no-op returning the prior `after_snapshot`.
  - Rollback RPC `reconcile_rollback(row_id)` restores from `before_snapshot` and marks `rolled_back`.
- No user/membership/invitation writes anywhere in these RPCs; enforced by grep test.

Edge function `reconciler-run`:
- Modes: `plan` (default), `commit` (requires kill switch open, admin, and `commit_authorized_ids`).
- Validates every row against invariants before returning. Persists all rows with their status.
- Returns exact counts: reconciled, service_only, excluded, conflicts, contracts_linked, workspaces_created, workspaces_reused.

UI: `AdminDataImportV2` gains staged review — filter by status, inspect before/after JSON diff, tick authorized IDs, submit canary of 5, then rollback, then rerun, then full commit. Every action logged.

## Phase 2 — Meeting and impact truth

Schema:
- `sessions`: add `status` (`scheduled|completed|cancelled|no_show`), `actual_duration_minutes int`, `completed_at timestamptz`, `session_template_id uuid`, `primary_consultant_id uuid`.
- New `session_participants (session_id, user_id, role, attendance_status, source, created_at)` with unique `(session_id, user_id)` and RLS mirroring `sessions`.
- New `tool_usage_events (id, tool, entity_type, entity_id, workspace_id, user_id, session_id, occurred_at, metadata jsonb)` — no PII, indexed by workspace/user/tool.
- Backfill script only marks attendance where evidence is unambiguous (present in `session_participants` legacy JSON or explicit membership on that session). Never infers attendance from workspace membership or a past date; unresolved rows stay `null`.

RPCs (all `SECURITY DEFINER`, filter by role):
- `get_impact_aggregates(date_from, date_to, consultant_id?, startup_id?, programme_id?, service?)` returning completed meetings, scheduled meetings, actual meeting hours, manual logged hours (from `time_entries`), startups supported, meetings per startup, avg duration, no-contact-30d count, cancellations, no-shows, data completeness percentages.
- De-dupe rule: `time_entries` linked to a session are excluded from manual hours; sessions without `actual_duration_minutes` contribute zero hours, not an estimate.
- `get_tool_adoption(...)` grouped by tool/entity/workspace.

Client hooks call the RPCs; no aggregation happens client-side.

## Phase 3 — Truthful dashboards

- Four views under `/staff/impact`: Executive, Consultant, Startup, Tool Adoption. Shared global period + programme + service filters via URL search params.
- Every metric card shows a tooltip with source table, filter, and denominator; drill-down opens the underlying sessions or time entries list.
- Data Quality card lists counts of workspaces/sessions missing consultant, programme, contract, participant, duration, service classification, each with a link to the fix flow.
- CSV export button per view.
- Remove `MockSparkline`, `mockKpis`, `sampleImpact` references and any string proxy metric. Grep test in CI forbids `mock` in `src/components/impact/`.
- `list_ecosystem_items_v2`: fix owner filter (currently drops rows with owner mismatches after pagination). Compute `last_activity_at` from `greatest(coalesce(latest_session_completed_at), coalesce(latest_note_at), coalesce(latest_message_at))`; `next_meeting_at` from `min(sessions.starts_at where status='scheduled')`.
- `imported_unclaimed` workspaces visible to staff (`has_role('admin')` or `has_role('consultor')`) but excluded from founder-facing queries by an explicit filter on `access_status <> 'imported_unclaimed'`.

## Phase 4 — Release blockers

- Fix two hook-order violations (identified during typecheck sweep) by moving early returns after all hook calls.
- `scripts/write-version.ts`: write `version.json` only to `dist/`, remove any `public/version.json` output; update Vite plugin accordingly.
- Resolve all `tsgo` errors, all `eslint` errors, and add missing keys in `pt.json`/`en.json` (i18n parity script fails CI on drift).
- Bug screenshots bucket: create `bug-report-screenshots` idempotently in a migration guarded by `if not exists`; add a cleanup edge function `bug-report-cleanup` triggered on failed inserts to delete orphaned uploads; console capture buffer redacts strings matching JWT, email, and known secret patterns before persisting.

## Acceptance and gates

1. Run 5-row canary in `plan` mode → all `dry_run_ok`.
2. Flip kill switch, commit those 5 IDs → all `committed`, snapshots match.
3. Rollback the 5 → all `rolled_back`, before-state restored.
4. Rerun the same 5 in `commit` → `committed` again; rerun once more → no-op (`already_current`).
5. Full dry-run over the full authoritative PHC set → report exact counts.
6. Invariants (all must be zero): ambiguous auto-links, duplicate PHC IDs, founder-journey workspaces with `programme_id is null`, user/invitation/notification writes during import.
7. Final CI: `bun run build`, `tsgo`, `eslint`, `vitest run`, i18n parity, secret scan — all green.

Delivery reports files changed, migrations, SQL verification (as `read_query` results in the reply), canary evidence, residual risks, and a GO/NO-GO based on the invariants above.

## Technical notes

- Kill switch stored in new `public.system_settings (key text primary key, value jsonb, updated_by uuid, updated_at timestamptz)` — reconciler reads `reconciler.write_mode` at request time; UI toggle audits into `activity_log`.
- All new RPCs use `SECURITY DEFINER SET search_path=public`.
- All new tables carry `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated; GRANT ALL ... TO service_role;` plus RLS policies scoped via `has_role`.
- Client uses `invokeWithAuth` for every edge function call, per project standard.
- Order of merges: Phase 0 → Phase 1 (behind kill switch, WRITE_MODE default false) → Phase 4 release blockers → Phase 2 schema+backfill → Phase 2 RPCs → Phase 3 UI. Each phase is independently revertable.

## Assumptions I need confirmed before Agent Mode

- The authoritative PHC service extract will be uploaded by an admin as CSV (columns: `phc_customer_id`, `nif`, `organization_name`, `service_name`, `status`, `hubspot_company_id?`). Fine to fix column names once you share a sample header.
- Programme mapping (`service_name` → `programme_id`) is provided per run by the operator, not stored globally. Confirm this is acceptable, or say if you want a persisted `service_programme_map` table with an audit trail.
- Founder-facing views must exclude `imported_unclaimed`. Confirm no other `access_status` value needs to be hidden from founders.
