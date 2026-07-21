# Migration policy — forward-only, no person-specific data

Effective RC5. Enforced by `scripts/ci/scan-migrations.mjs`.

## Rule

`supabase/migrations/*.sql` is the **repeatable database lifecycle**. It must
replay identically on any empty database — a fresh Supabase project, a CI
disposable stack, or a developer laptop.

Consequently, migrations must not contain:

- real email addresses (personal or workspace-member);
- `INSERT` / `UPDATE` / `DELETE` targeting specific UUID literals of live
  workspaces, contracts, users, funnel items, etc.

Both patterns are person-specific data operations. They belong in an
operational RPC or a one-shot ops task, not in the schema lifecycle.

## What to do instead

For live-data reconciliation:

1. Write a `SECURITY DEFINER` RPC in a normal schema-only migration
   (`public.reconcile_<thing>(...)`). The RPC is forward-only, idempotent,
   guarded by staff auth, and safe to re-run.
2. Invoke it from the admin surface, from a scheduled edge function, or via
   `supabase--insert` after review — **outside** the migration file.
3. Log the operation into `activity_log` or a dedicated audit table for a
   permanent, queryable record. Fresh replay does not need this row.

For seed data that must exist on every environment (canonical KPI definitions,
pricing v1, feature flag defaults, etc.):

- Prefer synthetic, self-generated identifiers (`gen_random_uuid()`,
  natural keys) so re-running is idempotent and IDs are not hard-coded.
- If a fixed UUID is genuinely required for cross-environment referential
  stability (e.g. the pricing-table version referenced by early contracts),
  document the rationale in the migration header and add its filename to
  `scripts/ci/migration-scan-allowlist.txt` with a comment.

## Baseline

The scanner runs against a frozen baseline: the applied history at RC5
already contains such operations. Those files are enumerated in
`scripts/ci/migration-scan-allowlist.txt` and **must not be rewritten** —
that would break replay for anyone whose database was already advanced past
those timestamps.

**No new file may be added to the allowlist.** If CI fails on a new
migration, refactor the migration to remove the person-specific operation.

## Fresh-replay strategy

- `supabase/migrations/*.sql` is the sole input to fresh replay.
- Fresh replay is executed by `scripts/rc5/migrate-fresh-replay.mjs` inside a
  disposable Supabase stack (requires Docker). It is not runnable inside this
  sandbox; it is part of the release ops workflow.
- Live-data reconciliation runs against staging and production **after**
  migrations have applied, via the operational RPCs described above.
