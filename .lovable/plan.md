# Reconciler staged-commit protocol

Replace the current diagnostics-only reconciler with a real two-phase commit that is safe against races, partial writes, and plan drift between dry-run and commit.

## Protocol

```text
DRY-RUN                             COMMIT
-------                             ------
1. create bulk_import_batches row   1. verify batch owner = caller
2. per candidate:                   2. recompute plan_hash from rows
     stage row via                  3. reject if != client's expected_hash
     reconcile_active_customer      4. per authorized row_id:
       (returns row_id, status)          call reconciler_commit_row(row_id, expected_hash)
3. compute plan_hash over               (SECURITY DEFINER, atomic:
   dry_run_ok rows                       - re-checks hash under row lock
4. persist plan_hash on batch          - links funnel_item → startup/workspace
5. return {batch_id, plan_hash,        - flips row.status = 'committed'
   rows}                                - writes lifecycle_event)
                                     5. return per-row outcomes
```

The plan hash is `sha256(sorted(row_id || sha256(after_snapshot_canonical)))` — any drift in matching, service map, or program map between the two calls invalidates the batch.

## Migration

Restore + extend the two RPCs dropped in `20260715202735`:

1. `reconcile_active_customer(p_batch_id uuid, p_input jsonb, p_service_program_map jsonb, p_idempotency_key uuid) → jsonb` — the staging function (never writes business tables, only inserts into `bulk_import_rows` with status `dry_run_ok` / `conflict` / `excluded`). Same body as the prior version.
2. `reconciler_commit_row(p_row_id uuid, p_expected_plan_hash text) → jsonb` — atomic commit. Under `FOR UPDATE` row lock on the batch and row:
   - verify batch's `plan_hash = p_expected_plan_hash`, else raise `plan_hash_mismatch`
   - verify row status = `dry_run_ok`, else raise `row_not_stageable`
   - update `funnel_items` (`linked_startup_id`, `linked_workspace_id`, `stage='active_customer'` when applicable) from `after_snapshot`
   - insert `contract_lifecycle_events` row for audit
   - update `bulk_import_rows.status = 'committed'`, `committed_at = now()`, `actor_id = auth.uid()`
   - respect the kill-switch: raise if `system_settings.reconciler.write_mode.enabled ≠ true`
3. Add `plan_hash text` to `bulk_import_batches` if not present, plus `committed_at`, `committed_by`.
4. Keep `reconcile_rollback` intact (already flips marker; edge function handles restore).

All functions `SECURITY DEFINER`, admin-only via `has_role(auth.uid(),'admin')`.

## Edge function `reconciler-run`

Two modes on the same endpoint:

- `phase: 'stage'` (was `dry_run: true`)
  - create batch, loop candidates, invoke staging RPC, compute + persist `plan_hash`, return it plus per-row plan.
- `phase: 'commit'`
  - required: `batch_id`, `expected_plan_hash`, `commit_authorized_ids[]`
  - refuses unless BOTH kill-switches on (env + db) — unchanged.
  - re-reads rows for `batch_id`, recomputes hash, compares to stored + client-supplied hash; any mismatch → 409 `plan_hash_mismatch`.
  - per authorized id: call `reconciler_commit_row(row_id, expected_plan_hash)`.
  - returns aggregate counts (committed / skipped / conflicts / errors) and per-row outcome.

Legacy `dry_run` boolean stays supported by mapping to phases so `AdminContracts.tsx` keeps working during the transition; a second small UI patch adds a "Commit selected" action wired to the new phase.

## Validation

- `bun run typecheck` — 0 errors expected.
- `bunx vitest run` — full suite must remain green.
- Add a targeted vitest for `reconciler-run` covering: stage happy-path, hash mismatch on commit, kill-switch closed on commit, non-admin 403.
- Manual smoke via `supabase--curl_edge_functions` against the deployed function with `phase: 'stage'` on a tiny `funnel_item_ids` list; verify no writes and a hash is returned. Do NOT run a real commit — kill-switch remains OFF; leave enabling to the operator.

## Out of scope

- Automatic user/membership/invitation creation (explicitly forbidden by product rules).
- Rollback UI (rollback RPC already exists; keep as follow-up).
- Changes to `AdminContracts.tsx` beyond wiring the commit action + hash echo.

## Rollback

Every migration statement is idempotent (`CREATE OR REPLACE`, `IF NOT EXISTS`, `DROP … IF EXISTS`). Revert = drop the two new function signatures and the added columns; edge function reverts to the diagnostics-only version already in git history.
