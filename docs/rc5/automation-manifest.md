# RC5 · Batch G1 — Automation Truth Manifest

_Reconciles: `pg_cron.job` ↔ `public.automation_health_expectations` ↔
edge functions under `supabase/functions/` ↔ code call sites._

**Source of truth**: this file. If a scheduled job exists in `pg_cron.job`
but is NOT in this manifest, `scripts/rc5/reconcile-automations.mjs` fails.
If an entry here has `trigger=cron` but is NOT in `pg_cron.job`, the
script fails. If an entry here has `trigger=event|manual` but a stale
`pg_cron.job` row still exists for the same target, the script fails.

## Legend

- **trigger**: `cron` (scheduler-fired), `event` (DB trigger / webhook /
  realtime), `manual` (staff button / CLI only).
- **cadence**: canonical wall-clock cadence in seconds (0 for event/manual).
- **owner**: engineering owner responsible for the run's health.
- **flag**: feature flag guarding the job (empty = always on).
- **health**: name in `public.automation_health_expectations.job_name`
  (empty = no health expectation; missing/never-run is NOT treated as
  healthy — it must appear here explicitly as `no_health_expectation`).

## Manifest

| name | trigger | cadence(s) | edge target | owner | flag | health |
|---|---|---:|---|---|---|---|
| automation-engine | cron | 3600 | `automation-engine` | ops | — | `automation_engine` |
| sync-outlook-emails | cron | 300 | `sync-outlook-emails` | integrations | — | `email_sync` |
| check_email_sync_health | cron | 900 | RPC `public.check_email_sync_health` | integrations | — | `email_sync_health` |
| check-contract-anniversaries | cron | 86400 | `check-contract-anniversaries` | contracts | — | `contract_anniversaries` |
| check-mentor-nda-expiry | cron | 86400 | `check-mentor-nda-expiry` | mentors | — | `mentor_nda_expiry` |
| check-missed-milestones | cron | 86400 | `check-missed-milestones` | workspace | — | `missed_milestones` |
| generate-crm-notifications | cron | 3600 | `generate-crm-notifications` | crm | — | `crm_notifications` |
| generate-invoices | manual | 0 | `generate-invoices` | finance | `invoicing_enabled` | `no_health_expectation` |
| archive-contracts-to-sharepoint | cron | 86400 | `archive-contracts-to-sharepoint` | contracts | — | `sharepoint_archive` |
| compute-cohort-benchmarks | cron | 86400 | `compute-cohort-benchmarks` | analytics | — | `cohort_benchmarks` |
| census-run | cron | 604800 | `census-run` | analytics | — | `census` |
| sweep-session-transcripts | cron | 900 | `sweep-session-transcripts` | sessions | — | `session_transcripts` |
| open-monthly-founder-pulse | cron | 86400 | `open-monthly-founder-pulse` | pulse | `founder_monthly_pulse` | `founder_pulse` |
| reconcile-founder-accounts | cron | 3600 | RPC `public.reconcile_all_contract_founders` | ops | — | `founder_reconcile` |
| docusign-webhook | event | 0 | `docusign-webhook` | contracts | — | `no_health_expectation` |
| public-contract-onboarding | event | 0 | `public-contract-onboarding` | contracts | — | `no_health_expectation` |
| public-book-first-contact | event | 0 | `public-book-first-contact` | crm | — | `no_health_expectation` |

## Rules

1. **Missing-schedule is unhealthy.** Any manifest row with `trigger=cron`
   and no matching `pg_cron.job` fails the reconciliation script and
   flips the row's health to `critical:missing_schedule`.
2. **Missing-registry is unhealthy.** Any cron row without a matching
   `automation_health_expectations` entry (unless `health =
   no_health_expectation`) fails reconciliation.
3. **Dead cron rows are unhealthy.** Any `pg_cron.job` row whose command
   points at an `event` or `manual` function fails reconciliation and
   must be dropped in the next migration.
4. **Never-run is unhealthy after cadence + grace.** The registry view
   `public.v_automation_health` already enforces this; do not silence.
5. **No double-logging.** Each edge function writes AT MOST one row per
   run into `automation_runs`. `sweep-session-transcripts` is the
   historical offender (fixed in-source this batch by ensuring a single
   terminal insert).

## Next actions

- `scripts/rc5/reconcile-automations.mjs` (added this batch) — read-only
  reconciliation; refuses to run against prod.
- Drop dead `pg_cron.job` rows for event/manual functions in the next
  approved migration (draft: `docs/rc5/drafts/2026-07-22_batch-g1_dead_crons.sql`
  will be authored once the live `pg_cron.job` catalogue is captured
  from staging).
