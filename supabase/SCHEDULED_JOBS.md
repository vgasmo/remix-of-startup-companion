# Scheduled Jobs (pg_cron)

Canonical list of scheduled jobs. Every job is created by a versioned migration
under `supabase/migrations/` and authenticates against its edge function using
the shared `x-cron-secret` header, sourced from
`current_setting('app.settings.cron_secret', true)`. No job uses the anon key
as authorization.

| Job | Schedule (UTC) | Edge function | Auth |
|---|---|---|---|
| `run-intake-reminders` | `0 9 * * *` (daily 09:00) | `run-intake-reminders` | `x-cron-secret` |
| `check-contract-anniversaries-daily` | `0 6 * * *` (daily 06:00) | `check-contract-anniversaries` | `x-cron-secret` |
| `check-missed-milestones-daily` | `0 9 * * *` (daily 09:00) | `check-missed-milestones` | `x-cron-secret` |
| `send-milestone-reminders-daily` | `30 8 * * *` (daily 08:30) | `send-milestone-reminders` | `x-cron-secret` |
| `generate-crm-notifications-daily` | `30 8 * * *` (daily 08:30) | `generate-crm-notifications` | `x-cron-secret` |
| `recompute-health-scores-daily` | `0 6 * * *` (daily 06:00) | `recompute-health-scores` (→ fires `send-health-alert-email` on drops) | `x-cron-secret` |
| `automation-engine-hourly` | `0 * * * *` (hourly) | `automation-engine` | `x-cron-secret` |
| `ecosystem-invariants-hourly` | `17 * * * *` (hourly) | invariants checker | `x-cron-secret` |
| `auto-sync-outlook-emails` | `*/5 * * * *` (every 5 min) | `sync-outlook-emails` | `x-cron-secret` |
| `run-checkin-reminders-weekly` | `0 9 * * 1` (Mon 09:00) | `run-checkin-reminders` | `x-cron-secret` |
| `send-email-digest-weekly` | `0 8 * * 1` (Mon 08:00) | `send-email-digest` | `x-cron-secret` |
| `send-weekly-health-digest-weekly` | `30 7 * * 1` (Mon 07:30) | `send-weekly-health-digest` | `x-cron-secret` |
| `archive-contracts-daily` | `0 2 * * *` (daily 02:00) | `archive-contracts-to-sharepoint` | `x-cron-secret` |
| `run-ecosystem-snapshot-daily` | `0 3 * * *` (daily 03:00) | `run-ecosystem-snapshot` | `x-cron-secret` |
| `compute-cohort-benchmarks-daily` | `0 4 * * *` (daily 04:00) | `compute-cohort-benchmarks` | `x-cron-secret` |

> `generate-invoices-monthly` was unscheduled — the platform's "No Invoicing/Billing" governance rule forbids financial execution jobs. The `generate-invoices` edge function remains for on-demand/legacy use only.

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

## check-mentor-nda-expiry-daily — daily 08:00 UTC

Emails mentors whose NDA acceptance is within 30 days of the 365-day expiry.
Uses the latest `mentor_nda_acceptances` row per user and skips mentors who
already renewed.

Config: `[functions.check-mentor-nda-expiry]` with `verify_jwt = false`.
Runtime auth: `x-cron-secret === CRON_SECRET`.

## send-notification-email — on-demand dispatcher (not scheduled)

Unified transactional email dispatcher for event-driven notifications:
`contract_signed`, `contract_activated`, `document_review_requested`,
`document_review_approved`, `consultant_assigned`, `mentor_request_accepted`,
`mentor_request_declined`, `activity_mention`. Also pushes to Slack via
`send-slack-notification` for workspace-scoped events. Invoked from
`pandadoc-webhook`, `docusign-webhook`, and client mutations (consultant
assignment, mentor request, document review approval).
