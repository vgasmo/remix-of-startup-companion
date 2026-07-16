
# Data Import V2 + Reconciler Canary — Safe Activation

Status: Phase A ✅ · Phase B ✅ · Phase C ✅ · Phase D ✅ · Phase E ⏳ · Phase F ⏳

This is a multi-phase production-safety effort, not a flag flip. It must land as a sequence of reviewable migrations + edge-function/UI changes, each verified before the next.

## Current state (verified)

- Edge functions present: `bulk-import-extract`, `bulk-import-commit`, `reconciler-run`.
- Table `bulk_import_batches` exists (18 cols, 1 policy) plus `bulk_import_rows` and `bulk_import_rollbacks`.
- `reconcile_active_customer` RPC exists across several migrations — signature has drifted; `reconciler-run` calls a dropped overload.
- UI: `AdminDataImportV2.tsx`, `AdminDataImportRouter.tsx`, `ReconcilerCanaryPanel.tsx`.
- Reconciliation docs: `docs/reconciliation/phase0-truth-20260715.md`, `phase0-census.md`.
- No server-side feature-flag/kill-switch table for V2/Reconciler exists yet — must be added.

## Phase A — Fix the RPC contract  *(migration + edge fn + tests)*

1. Read every historical `reconcile_active_customer` definition; pick one canonical signature:
   `reconcile_active_customer(_batch_id uuid, _row_id uuid, _idempotency_key uuid, _plan_hash text, _dry_run boolean) returns jsonb`.
2. Drop all prior overloads in one migration (`DROP FUNCTION ... (old_sig)` explicit).
3. Rewrite `supabase/functions/reconciler-run/index.ts` to call only the canonical signature.
4. Regenerate `src/integrations/supabase/types.ts` (auto after migration).
5. Add Deno contract test in `supabase/functions/reconciler-run/index.test.ts` that asserts arg names + return keys.
6. Add SQL regression `scripts/rls-regression-tests.sql` block asserting exactly one overload exists.

## Phase B — Harden Data Import V2 staging

Migration:
- Add `bulk_import_batches.status` CHECK enum: `uploaded, parsing, staged, reviewed, approved, applying, completed, partially_failed, rejected, rolled_back`.
- Add `plan_hash text`, `plan_hash_locked_at timestamptz`, `approved_by uuid`, `approved_at timestamptz`, `idempotency_key uuid`.
- Add `bulk_import_rows.classification` enum: `valid, warning, conflict, duplicate, rejected`.
- Trigger: locking `plan_hash` on `approved`; reopening resets status to `staged` and clears approval fields (never silently mutates hash).
- RLS: staff/admin only for insert/update; SECURITY DEFINER RPC `bulk_import_approve(_batch_id, _plan_hash)` verifies hash match server-side.
- Private storage bucket `bulk-imports` (not public), RLS scoped to staff.

Edge function (`bulk-import-extract`):
- CSV parser upgrade: BOM strip, delimiter sniff (`,;\t|`), quoted + multiline + escaped quotes (use `npm:papaparse` in Deno).
- Enforce file size ≤ 10 MB, MIME allowlist, row count ≤ 50 000.
- Required-column validation, explicit mapping required before parse commits to `staged`.
- Normalizers: NIF (strip non-digits, validate PT checksum), email (lower/trim), company name (NFKC + collapse whitespace), external IDs (trim).
- Duplicate detection: within batch + against `startups`, `funnel_items`, `startup_contracts` by (nif | external_source_id | normalized_name+email).
- No token/PII in logs — replace with hashes.

## Phase C — Transactional reconciler

Rewrite `reconcile_active_customer` as one `plpgsql` block:
- `PERFORM pg_advisory_xact_lock(hashtextextended(_batch_id::text, 0))` for batch concurrency.
- `SELECT ... FOR UPDATE` on the staging row and any canonical rows it targets.
- Verify `batch.status = 'approved'` and `batch.plan_hash = _plan_hash`; else raise.
- Resolution order: canonical UUID → `external_entity_refs` (PHC/HubSpot) → normalized NIF. Name/email = suggestion only, requires a `conflict` classification.
- Forbidden: auto-merging two candidates, auto-deleting workspace / contract / funnel / programme rows.
- Combined write of company + CRM + contract + workspace + assignment in one transaction (function body already runs inside one).
- Idempotency table `reconciler_idempotency(idempotency_key uuid pk, batch_id uuid, row_id uuid, request_hash text, result jsonb, created_at timestamptz)`; same key + same payload → replay result; same key + different payload → `409` error.
- Post-write verification block: re-read joined shape, assert invariants, else `RAISE` and let transaction roll back. Only then flip row to `completed`.
- Emit `activity_log` row (metadata column) with before/after JSON + correlation id.

## Phase D — Server-side safety controls

New table `feature_control_flags(key text pk, bool_value boolean, int_value int, text_value text, updated_by uuid, updated_at timestamptz)` with admin-only RLS, keys:

- `DATA_IMPORT_V2_ENABLED`
- `RECONCILER_DRY_RUN_ENABLED`
- `RECONCILER_WRITES_ENABLED`
- `RECONCILER_CANARY_MAX_ROWS` (starts at 1)
- `RECONCILER_BATCH_ALLOWLIST` (jsonb array)
- `RECONCILER_EMERGENCY_STOP`

All edge functions read these at the top of every request via a SECURITY DEFINER helper `get_feature_flag(_key)`. Emergency stop = single boolean that fails-closed every reconciler call.

Add:
- Rate limit table `edge_rate_limits(actor uuid, fn text, window_start timestamptz, count int)`.
- Advisory lock on `('reconciler', batch_id)` for concurrency.
- Alert: on `partially_failed` insert a row into `system_alerts`.

## Phase E — Activation ladder (executed after code lands, not in this plan)

Documented in `docs/reconciliation/activation-ladder.md`; each step has a psql verification query. I will not skip stages.

1. `DATA_IMPORT_V2_ENABLED=true`, all reconciler flags off.
2. Upload synthetic CSV `docs/reconciliation/fixtures/canary-synthetic.csv`, verify parse + classifications.
3. `RECONCILER_DRY_RUN_ENABLED=true`, writes off — shadow run, capture proposed plan.
4. Human diff review vs expected.
5. Allowlist a synthetic workspace, `RECONCILER_WRITES_ENABLED=true`, `RECONCILER_CANARY_MAX_ROWS=1`.
6. One canary row.
7. DB verification queries (Phase F).
8. Re-run same request → prove idempotency.
9. Inject forced failure (invariant violation) → prove rollback.
10. One reviewed real customer with a before-snapshot dump.
11. Hold at 1 until census + invariants clean.
12. Raise cap: 5 → 20 → approved size, verify between each.

## Phase F — Canary verification queries

Add `docs/reconciliation/canary-verification.sql` with named queries for each check listed in the request (single identity, no duplicate CRM, contract link, workspace link, programme, consultant, no orphan contracts, no contracted-but-unlinked funnel rows, no duplicate active workspaces, unrelated-customer diff, audit evidence, re-run count, invariants).

## Acceptance gates

Before I flip any switch I will report GO/NO-GO against every criterion in the brief. If any fails, Data Import V2 stays DRY-RUN and Reconciler writes stay OFF.

## Technical details

- Migrations land in this order: A (RPC unification) → B (batch/row schema + storage + approve RPC) → C (transactional reconciler + idempotency table) → D (feature_control_flags + rate limits + alerts).
- Types regenerate after each migration; expect one refactor pass in `reconciler-run/index.ts` and `ReconcilerCanaryPanel.tsx` after A and after D.
- Contract tests live under `supabase/functions/*/index.test.ts` (Deno) and are wired into `scripts/e2e/test-e2e.sh`.
- No client-only guard is treated as a safety control; every gate is enforced server-side.

## Scope explicitly out

- Backfilling historical batches to the new schema — only forward-going batches use the new lifecycle; legacy rows stay in whatever terminal state they already have.
- Rewriting `commit-crm-import` / `commit-hubspot-import` — they remain the legacy path until V2 replaces them; only V2 flows through the new reconciler.

## What I need from you

Approve this plan and I will start with Phase A (RPC unification + contract tests + type regen). Each phase lands as its own migration + code batch so you can review before the next one begins. Activation itself only happens after all acceptance gates pass — no shortcuts.
