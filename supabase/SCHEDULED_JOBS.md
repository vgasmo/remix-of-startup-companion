# Scheduled Jobs (pg_cron)

This file documents the canonical scheduled jobs for this project.
These jobs are managed via `pg_cron` + `pg_net` in the database.

## run-intake-reminders

- **Schedule**: `0 9 * * *` (daily at 09:00 UTC)
- **Edge Function**: `run-intake-reminders`
- **Auth**: `x-cron-secret` header from `app.settings.cron_secret`
- **Purpose**: Sends automated reminders for:
  1. Intake reminders — intakes pending submission (D+2, D+5, D+10, then weekly)
  2. Signature reminders — intakes pending signature (D+3, D+7, then weekly)
- **Config**: `supabase/config.toml` → `[functions.run-intake-reminders]` with `verify_jwt = false`

### Setup SQL (already applied as cron jobid 7)

```sql
SELECT cron.schedule(
  'run-intake-reminders',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/run-intake-reminders',
    headers := ('{"Content-Type": "application/json", "x-cron-secret": "' || current_setting('app.settings.cron_secret', true) || '"}')::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

## run-checkin-reminders-weekly

- **Schedule**: `0 9 * * 1` (Mondays at 09:00 UTC)
- **Edge Function**: `run-checkin-reminders`
- **Auth**: Anon key (Bearer token)
- **Purpose**: Sends weekly check-in reminders to startups

## archive-contracts-daily

- **Schedule**: `0 2 * * *` (daily at 02:00 UTC)
- **Edge Function**: `archive-contracts-to-sharepoint`
- **Auth**: `x-cron-secret` header from `app.settings.cron_secret`
- **Purpose**: Archives signed contracts (7+ days after signature) to SharePoint via MS Graph API. Processes up to 20 contracts per run, with retry support (max 5 attempts per contract).

### Setup SQL

```sql
SELECT cron.schedule(
  'archive-contracts-daily',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/archive-contracts-to-sharepoint',
    headers := ('{"Content-Type": "application/json", "x-cron-secret": "' || current_setting('app.settings.cron_secret', true) || '"}')::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

## run-ecosystem-snapshot-daily

- **Schedule**: `0 3 * * *` (daily at 03:00 UTC)
- **Edge Function**: `run-ecosystem-snapshot`
- **Auth**: `x-cron-secret` header from `app.settings.cron_secret`
- **Purpose**: Creates daily snapshots of critical ecosystem data (10 domains) to private `ecosystem-backups` storage bucket. Tracks metadata in `ecosystem_snapshots` table.

### Setup SQL

```sql
SELECT cron.schedule(
  'run-ecosystem-snapshot-daily',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/run-ecosystem-snapshot',
    headers := ('{"Content-Type": "application/json", "x-cron-secret": "' || current_setting('app.settings.cron_secret', true) || '"}')::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

## compute-cohort-benchmarks-daily

- **Schedule**: `0 4 * * *` (daily at 04:00 UTC)
- **Edge Function**: `compute-cohort-benchmarks`
- **Auth**: `x-cron-secret` header from `app.settings.cron_secret`
- **Purpose**: Aggregates `kpi_values` and workspace `health_score_numeric` into anonymized percentile rows (p25/p50/p75/p90/avg) in `cohort_benchmarks`, per `program_id` + `stage` + `metric_key`. Enforces **k-anonymity ≥ 5** (cohorts smaller than 5 are skipped). Founders read only aggregated percentiles — never individual peer values.
