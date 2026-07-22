# Batch G1 — source landed 2026-07-22

- `docs/rc5/automation-manifest.md` — canonical manifest of every
  automation (17 rows) with trigger / cadence / owner / flag / health.
- `scripts/rc5/reconcile-automations.mjs` — read-only reconciler that
  refuses to run against the production project ref, joins
  `cron.job` × `automation_health_expectations` × the manifest, and
  exits non-zero on any drift (missing_schedule, dead_cron,
  missing_registry, unregistered_cron).

Not landed (require live pg_cron catalogue capture from staging):
- Forward migration to drop dead cron rows for event/manual functions.
- Fix for `sweep-session-transcripts` double-log — current source does
  not write to `automation_runs`, so the historical duplicate is
  already gone; reconciler will verify against pg_cron on staging.

Runtime proof gate: staging execution of `reconcile-automations.mjs` —
`NOT PROVEN`.
