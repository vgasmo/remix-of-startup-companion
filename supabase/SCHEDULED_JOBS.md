# Scheduled Jobs (pg_cron)

Canonical list of scheduled jobs. Every job is created by a versioned migration
under `supabase/migrations/` and authenticates against its edge function using
the shared `x-cron-secret` header, sourced from
`current_setting('app.settings.cron_secret', true)`. No job uses the anon key
as authorization.

| Job | Schedule (UTC) | Edge function | Auth | Migration |
|---|---|---|---|---|
| `run-intake-reminders` | `0 9 * * *` (daily 09:00) | `run-intake-reminders` | `x-cron-secret` | `20260330122409_*.sql` |
| `check-contract-anniversaries-daily` | `0 6 * * *` (daily 06:00) | `check-contract-anniversaries` | `x-cron-secret` | `20260713141000_schedule-contract-lifecycle-and-checkin-reminders.sql` |
| `run-checkin-reminders-weekly` | `0 9 * * 1` (Mon 09:00) | `run-checkin-reminders` | `x-cron-secret` | `20260713141000_schedule-contract-lifecycle-and-checkin-reminders.sql` |
| `archive-contracts-daily` | `0 2 * * *` (daily 02:00) | `archive-contracts-to-sharepoint` | `x-cron-secret` | `20260428_schedule-archive-contracts.sql` |
| `run-ecosystem-snapshot-daily` | `0 3 * * *` (daily 03:00) | `run-ecosystem-snapshot` | `x-cron-secret` | `20260428_schedule-ecosystem-snapshot.sql` |
| `compute-cohort-benchmarks-daily` | `0 4 * * *` (daily 04:00) | `compute-cohort-benchmarks` | `x-cron-secret` | `20260428_schedule-cohort-benchmarks.sql` |

---

## run-intake-reminders — daily 09:00 UTC

Sends automated reminders for:
1. Intake reminders — intakes pending submission (D+2, D+5, D+10, then weekly).
2. Signature reminders — contracts sent for signature but not yet signed
   (D+3, D+7, then weekly).

Config: `supabase/config.toml` → `[functions.run-intake-reminders]` with
`verify_jwt = false`. Runtime auth: only `x-cron-secret === CRON_SECRET`.

## check-contract-anniversaries-daily — daily 06:00 UTC

Runs the regulatory contract lifecycle engine. Creates operational records
(anniversary reviews, biennial price-review notices with 60-day advance,
post-incubation transitions, renewal eligibility) required by the Minuta
(Cl. 6.ª / 10.ª) and Regulamento (Art. 9.º / 10.º).

Config: `[functions.check-contract-anniversaries]` with `verify_jwt = false`.
Runtime auth: `x-cron-secret === CRON_SECRET` (cron path) or a staff JWT
(admin / consultor / backoffice).

## run-checkin-reminders-weekly — Mondays 09:00 UTC

Generates the current period's check-in instances and emails startups whose
check-ins are due or overdue.

Config: `[functions.run-checkin-reminders]` with `verify_jwt = false`. Runtime
auth: `x-cron-secret === CRON_SECRET`.

## archive-contracts-daily — daily 02:00 UTC

Archives signed contracts (7+ days after signature) to SharePoint via MS Graph.
Processes up to 20 contracts per run with retry support (max 5 attempts).

Config: `[functions.archive-contracts-to-sharepoint]` with `verify_jwt = false`.
Runtime auth: `x-cron-secret === CRON_SECRET`.

## run-ecosystem-snapshot-daily — daily 03:00 UTC

Creates daily snapshots of critical ecosystem data (10 domains) to the private
`ecosystem-backups` storage bucket. Tracks metadata in `ecosystem_snapshots`.

Config: `[functions.run-ecosystem-snapshot]` with `verify_jwt = false`. Runtime
auth: `x-cron-secret === CRON_SECRET`.

## compute-cohort-benchmarks-daily — daily 04:00 UTC

Aggregates `kpi_values` and workspace `health_score_numeric` into anonymized
percentile rows (p25/p50/p75/p90/avg) in `cohort_benchmarks`, per
`program_id` + `stage` + `metric_key`. Enforces **k-anonymity ≥ 5** (cohorts
smaller than 5 are skipped). Founders read only aggregated percentiles.

Config: `[functions.compute-cohort-benchmarks]` with `verify_jwt = false`.
Runtime auth: `x-cron-secret === CRON_SECRET`.
