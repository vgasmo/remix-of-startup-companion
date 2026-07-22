# Batch G1 — Automation Truth Manifest (FAILING REPRO)

Sources: `automation_health_expectations`, `automation_runs`,
`cron_job_runs`, `pg_cron.job`, `supabase/functions/*`,
edge-function health registry.

## Defects

1. There is no single manifest reconciling scheduler ↔ wrapper ↔
   health registry.
2. Duplicate transcript-sweep logging (`sweep-session-transcripts`
   writes two health-registry rows).
3. Missing-schedule / missing-registry / never-run jobs report
   `healthy` because absence is treated as OK.
4. Event-driven and manual functions have cron schedules that never
   fire, giving false "unhealthy" alerts.

## Required outcome

`docs/rc5/automation-manifest.md` listing, per job:
`name | trigger (cron|event|manual) | cadence | owner | edge target |
feature flag | health expectation | last-run source`. Reconciliation
script asserts every scheduled job appears in the manifest and every
manifest job with `trigger=cron` has a matching `pg_cron.job` row.

## Next action

Generate the manifest by joining `pg_cron.job` +
`automation_health_expectations` + a code scan of
`supabase/functions`. Then remove the duplicate transcript-sweep log
and drop dead cron rows for event/manual functions.
