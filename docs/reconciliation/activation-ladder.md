# Reconciler / Data Import V2 — Activation Ladder

Every stage must be verified before advancing. No skipping. All flags are held in
`public.system_settings` and read server-side by `reconciler-run` and
`bulk-import-extract`. Client toggles are display-only.

| Key | Meaning | Safe default |
| --- | --- | --- |
| `data_import_v2.enabled` | Data Import V2 pipeline accepts uploads | `{ "enabled": false }` |
| `reconciler.dry_run_enabled` | `phase=stage` allowed | `{ "enabled": false }` |
| `reconciler.write_mode` | Legacy DB kill-switch for commits | `{ "enabled": false }` |
| `reconciler.writes_enabled` | New writes gate (must also be true) | `{ "enabled": false }` |
| `reconciler.canary_max_rows` | Cap on `commit_authorized_ids` per call | `{ "value": 1 }` |
| `reconciler.batch_allowlist` | Only these batch_ids may commit | `{ "batch_ids": [] }` |
| `reconciler.emergency_stop` | Fail-closed for every reconciler call | `{ "enabled": false }` |

Env var `RECONCILER_WRITE_MODE=enabled` is required in addition to the DB flags —
commits fail-closed if any of the three (env, `write_mode`, `writes_enabled`) is off.

## Stages

1. **V2 uploads open.** Set `data_import_v2.enabled = true`. Verify:
   ```sql
   SELECT value FROM public.system_settings WHERE key = 'data_import_v2.enabled';
   ```
2. **Synthetic CSV.** Upload `docs/reconciliation/fixtures/canary-synthetic.csv`
   (staff only, `bulk-imports` bucket). Verify parse:
   ```sql
   SELECT status, classification, count(*) FROM public.bulk_import_rows
     WHERE batch_id = :batch GROUP BY 1,2;
   ```
3. **Dry run on.** Set `reconciler.dry_run_enabled = true` (writes still off).
   `POST /reconciler-run { phase: 'stage', batch_id, limit: 10 }` and capture the
   returned `plan_hash`.
4. **Human plan diff review.** Compare `after_snapshot` per row vs. expected.
5. **Allowlist a single batch.** Set `reconciler.batch_allowlist =
   { "batch_ids": [<uuid>] }`, `RECONCILER_WRITE_MODE=enabled`,
   `reconciler.write_mode = { "enabled": true }`, `reconciler.writes_enabled =
   { "enabled": true }`, `canary_max_rows = 1`.
6. **One canary row commit.** `POST /reconciler-run { phase: 'commit', batch_id,
   expected_plan_hash, commit_authorized_ids: [rowId] }`.
7. **DB verification.** Run every query in `canary-verification.sql`. All must pass.
8. **Idempotency proof.** Re-issue the exact same commit payload — expect a
   replay (identical result, no new activity_log rows).
9. **Rollback proof.** Force an invariant failure (set
   `after_snapshot.proposed_startup_id` to a non-existent UUID on a staging row
   in a **test batch** and attempt commit). Expect `invariant_failed_*` and no
   mutation on `funnel_items`.
10. **One reviewed real customer.** Capture before-snapshot with
    `canary-verification.sql`, commit, re-run verification.
11. **Hold at 1** until census and invariants are clean for the sample.
12. **Raise cap gradually.** `canary_max_rows`: 1 → 5 → 20 → approved size,
    running canary verification between each step.

## Emergency stop

```sql
UPDATE public.system_settings
   SET value = jsonb_set(value, '{enabled}', 'true'::jsonb)
 WHERE key = 'reconciler.emergency_stop';
```

Every reconciler request returns `423 emergency_stop` while engaged. There is
no override path.
