# RC12 — Automation manifest

Verified against the hosted read-only catalogue and the fresh local migration replay on 9 November 2026.
Schedules are UTC. Cadence is the health-registry threshold, not a computed cron interval (monthly pulse uses 31 days).
The catalogue and migrations remain operational truth: this manifest detects drift and never rewrites schedules.

| name | trigger | schedule UTC | target | owner | flag | health | cadence seconds |
|---|---|---|---|---|---|---|---:|
| anonymize-founder-pulse-daily | cron | 41 3 * * * | `RPC public.anonymize_stale_founder_pulse_responses` | ops | — | `anonymize_stale_founder_pulse_responses` | 86400 |
| archive-contracts-daily | cron | 0 2 * * * | `archive-contracts-to-sharepoint` | ops | — | `archive-contracts-to-sharepoint` | 86400 |
| auto-sync-outlook-emails | cron | */5 * * * * | `sync-outlook-emails` | ops | — | `sync-outlook-emails` | 300 |
| automation-engine-hourly | cron | 0 * * * * | `automation-engine` | ops | — | `automation-engine` | 3600 |
| check-automation-health-15m | cron | */15 * * * * | `RPC public.check_automation_health` | ops | — | `check_automation_health` | 900 |
| check-contract-anniversaries-daily | cron | 0 6 * * * | `check-contract-anniversaries` | ops | — | `check-contract-anniversaries` | 86400 |
| check-first-contact-outbox | cron | 7 * * * * | `RPC public.check_first_contact_outbox` | ops | — | `check_first_contact_outbox` | 3600 |
| check-mentor-nda-expiry-daily | cron | 0 8 * * * | `check-mentor-nda-expiry` | ops | — | `check-mentor-nda-expiry` | 86400 |
| check-missed-milestones-daily | cron | 0 9 * * * | `check-missed-milestones` | ops | — | `check-missed-milestones` | 86400 |
| compute-cohort-benchmarks-daily | cron | 0 4 * * * | `compute-cohort-benchmarks` | ops | — | `compute-cohort-benchmarks` | 86400 |
| ecosystem-invariants-hourly | cron | 17 * * * * | `RPC public.check_ecosystem_invariants` | ops | — | `check_ecosystem_invariants` | 3600 |
| email-sync-health-check | cron | */10 * * * * | `RPC public.check_email_sync_health` | ops | — | `check_email_sync_health` | 600 |
| generate-crm-notifications-daily | cron | 30 8 * * * | `generate-crm-notifications` | ops | — | `generate-crm-notifications` | 86400 |
| open-monthly-founder-pulse | cron | 0 8 1 * * | `open-monthly-founder-pulse` | ops | — | `open-monthly-founder-pulse` | 2678400 |
| purge-operational-logs-daily | cron | 47 3 * * * | `RPC public.purge_operational_logs` | ops | — | no_health_expectation | 86400 |
| recompute-health-scores-daily | cron | 0 6 * * * | `recompute-health-scores` | ops | — | `recompute-health-scores` | 86400 |
| recompute-work-queue-daily | cron | 15 6 * * * | `recompute-work-queue` | ops | — | `recompute-work-queue` | 86400 |
| reconcile-contract-founders-hourly | cron | 17 * * * * | `RPC public.reconcile_contract_founders` | ops | — | `reconcile_contract_founders` | 3600 |
| reopen-work-queue-snoozes | cron | 23 * * * * | `RPC public.reopen_expired_work_queue_snoozes` | ops | — | `reopen_expired_work_queue_snoozes` | 3600 |
| run-checkin-reminders-weekly | cron | 0 9 * * 1 | `run-checkin-reminders` | ops | — | `run-checkin-reminders` | 604800 |
| run-ecosystem-snapshot-daily | cron | 0 3 * * * | `run-ecosystem-snapshot` | ops | — | `run-ecosystem-snapshot` | 86400 |
| run-intake-reminders | cron | 0 9 * * * | `run-intake-reminders` | ops | — | `run-intake-reminders` | 86400 |
| send-email-digest-weekly | cron | 0 8 * * 1 | `send-email-digest` | ops | — | `send-email-digest` | 604800 |
| send-milestone-reminders-daily | cron | 30 8 * * * | `send-milestone-reminders` | ops | — | `send-milestone-reminders` | 86400 |
| send-weekly-health-digest-weekly | cron | 30 7 * * 1 | `send-weekly-health-digest` | ops | — | `send-weekly-health-digest` | 604800 |
| sweep-session-transcripts | cron | */20 * * * * | `sweep-session-transcripts` | ops | — | `sweep-session-transcripts` | 1200 |
| reconcile-contract-activation | dynamic | */5 * * * * | `RPC public.dispatch_contract_activation_recovery` | ops | — | no_health_expectation | 300 |
| docusign-webhook | event | — | `docusign-webhook` | ops | — | no_health_expectation | 0 |
| public-contract-onboarding | event | — | `public-contract-onboarding` | ops | — | no_health_expectation | 0 |
| public-book-first-contact | event | — | `public-book-first-contact` | ops | — | no_health_expectation | 0 |

## Verification

Run `node scripts/rc5/reconcile-automations.mjs` with an isolated `STAGING_DATABASE_URL`.
Remote staging additionally requires `RC5_ALLOW_STAGING_TESTS=true`. The command opens a read-only transaction,
checks names, active state, exact schedules, canonical edge/RPC targets, registry presence/enabled state and cadence.
Unknown jobs, missing jobs, invalid manifests and lookup failures fail the gate. It never invokes providers or emits connection secrets.

## Recovery schedules

Contract activation recovery arms its retry schedule only while its durable queue contains work and disarms after drain.
This is not a permanent missing-schedule requirement. Its known `dynamic` schedule and dispatch RPC are checked when armed; absence after drain is allowed.
Unknown jobs still fail reconciliation rather than being ignored.

## Transport

`cron_invoke_edge` uses `app.edge_base_url` when configured; without it the shared production host is the fallback.
An isolated database must configure an isolated edge destination and sandbox providers before scheduling real execution.
Single-use cron tokens expire after five minutes; legacy secret authentication remains supported.
RPC jobs use `cron_invoke_rpc` for honest success/failure logging. Read-only reconciliation never changes health rows.
No invoicing/billing automation is part of this platform.
