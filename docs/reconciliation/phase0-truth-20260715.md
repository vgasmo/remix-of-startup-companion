# Phase 0 truth report — 2026-07-15

Read-only introspection captured against production before any Phase 1+ writes.

## Reconciler RPC overloads (pre-fix)

- `reconcile_active_customer(jsonb, text, boolean)` — obsolete unsafe path used by edge fn (**DROPPED** in migration `20260715...`).
- `reconcile_active_customer(uuid, jsonb, jsonb, uuid)` — safe staging signature, retained.
- `reconcile_rollback(uuid)` — present.

## Workspace canonical columns

- `status` (text, NOT NULL) ✓
- `program_id` (uuid, NOT NULL) ✓
- `engagement_state` (text, nullable) ✓ — CHECK allows `prospect | active | paused | churned | service_only` (no `operational`).
- `archived_at` (timestamptz)
- `service_classification` (text)
- **`access_status`** — does not exist.
- **`programme_id`** — does not exist.

## Startups canonical columns

- `phc_customer_id` ✓
- **`hubspot_company_id`** — does not exist. All HubSpot linkage lives on `funnel_items` + `external_entity_refs`.

## Storage buckets (audit P1-4)

All three buckets already exist (private):
- `bug-report-screenshots` (public=false)
- `phc-extracts` (public=false)
- `admin-exports` (public=false)

## Reconciler kill-switch

`system_settings.reconciler.write_mode` = `{"enabled": false, "reason": "phase_0_freeze"}` (canonical DB kill-switch, mirrored by `RECONCILER_WRITE_MODE` env).

## Meeting backfill impact (audit P0-5)

Before quarantine:
- Total sessions: 12
- `status='completed'`: 7
- Suspect (completed AND `actual_duration_minutes = duration` AND completed_at set): **7**

After quarantine (this migration):
- Rows moved to `sessions_backfill_quarantine`: **5**
- Rows preserved (had participants/transcripts/feedback evidence): **2**
- `sessions.status` counts: completed=2, scheduled=10.

## Impact RPC (audit P0-4)

- Old signature filtered on `w.programme_id` (nonexistent) → always errored.
- Replaced with canonical `w.program_id` + nested-jsonb return shape matching `StaffImpact.tsx`.
- Consultant scoping enforced in SQL (SECURITY DEFINER): non-admin callers can only see their own portfolio, ignoring any injected `p_consultant_id`.

## Changes shipped in this pass

- **Migration** (approved): quarantine table, reverted 5 sessions, rewrote `get_impact_aggregates`, dropped unsafe overload, canonicalised kill-switch setting.
- **`reconciler-run`**: dual kill-switch (env + DB), 423 on either off.
- **`census-run`**: `workspaces.access_status` → canonical `status` + `engagement_state`; hard-fails on the workspace query error instead of silently zeroing.
- **`StaffImpact.tsx`**: beta banner, error state with retry, null-safe formatting.
- **`ConsultorPortfolioView`**: enum→color health map (fixes healthy startups rendered red).
- **`ReconcilerCanaryPanel`**: client-side plan hash freeze; commit blocks on drift, conflicts, or errors.

## Not yet in this pass

- Live canary against production (requires operator go / DB kill-switch flip).
- P1-5 typecheck payload types (20 errors) and impact.* i18n (50 keys).
- Real rollback data restoration from `bulk_import_rows` before-snapshot.
- Contracted-without-workspace visibility in `list_ecosystem_items_v2`.
- `run-ecosystem-snapshot` nonzero-profiles assertion.
- BugReport partial-upload cleanup.
- Write-side session-completion instrumentation and canonical tool-usage taxonomy.

Verdict: **still NO-GO for reconciler commits.** Impact page safe to view as beta; census now truthful on workspace status.
