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
| sweep-session-transcripts | cron | 1200 | `sweep-session-transcripts` | sessions | — | `session_transcripts` |
| open-monthly-founder-pulse | cron | 86400 | `open-monthly-founder-pulse` | pulse | `founder_monthly_pulse` | `founder_pulse` |
| reconcile-founder-accounts | cron | 3600 | RPC `public.reconcile_all_contract_founders` | ops | — | `founder_reconcile` |
| docusign-webhook | event | 0 | `docusign-webhook` | contracts | — | `no_health_expectation` |
| public-contract-onboarding | event | 0 | `public-contract-onboarding` | contracts | — | `no_health_expectation` |
| public-book-first-contact | event | 0 | `public-book-first-contact` | crm | — | `no_health_expectation` |
| check_ecosystem_invariants | cron | 3600 | RPC `public.check_ecosystem_invariants` | ops | — | `check_ecosystem_invariants` |
| reconcile_contract_founders | cron | 3600 | RPC `public.reconcile_contract_founders` | ops | — | `reconcile_contract_founders` |
| check_automation_health | cron | 900 | RPC `public.check_automation_health` | ops | — | `check_automation_health` |
| run-checkin-reminders | cron | 604800 | `run-checkin-reminders` | workspace | — | `checkin_reminders` |
| run-ecosystem-snapshot | cron | 86400 | `run-ecosystem-snapshot` | analytics | — | `ecosystem_snapshot` |
| run-intake-reminders | cron | 86400 | `run-intake-reminders` | contracts | — | `intake_reminders` |
| send-email-digest | cron | 604800 | `send-email-digest` | ops | — | `email_digest` |
| send-milestone-reminders | cron | 86400 | `send-milestone-reminders` | workspace | — | `milestone_reminders` |
| send-weekly-health-digest | cron | 604800 | `send-weekly-health-digest` | ops | — | `weekly_health_digest` |
| recompute-health-scores | cron | 86400 | `recompute-health-scores` | analytics | — | `health_scores` |

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

## Transport (Batch G1 closure — 2026-08-11)

All cron→edge invocations go through `public.cron_invoke_edge(fn, payload)`:

- Builds the function URL from a constant project host (the previous
  `current_setting('app.settings.supabase_url')` lookup resolved to NULL, so
  `net.http_post` rejected 11 jobs with a not-null violation on `url` — they
  had never actually fired).
- Mints a **single-use, 5-minute** token via `public.issue_cron_token(job)`
  (sha256-hashed at rest in `public.cron_invocation_tokens`) and sends it as
  `x-cron-token`. Edge functions consume it exactly once through
  `public.consume_cron_token`, so no shared secret must stay in sync between
  the database and the function runtime. Legacy `x-cron-secret` still works.
- RPC-only schedules run through `public.cron_invoke_rpc(job, call)`, which
  writes an `ok`/`failed` row into `public.cron_job_runs` — previously they were
  invisible to the health registry and permanently reported as stale.
- `public.system_alerts.dedupe_key` is now NOT NULL with a plain unique index;
  the partial index could not back the watchdog's `ON CONFLICT`, so
  `check_automation_health` and `check_email_sync_health` failed on every run.
