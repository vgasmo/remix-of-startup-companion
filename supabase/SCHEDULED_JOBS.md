# Scheduled Jobs (pg_cron)

All jobs authenticate through `public.cron_invoke_edge(fn, body)` (one-time token in `cron_invocation_tokens`, consumed by the edge function) or run SQL through `public.cron_invoke_rpc(name, sql)`, which records each run in `cron_job_runs`. Times are UTC. Source of truth: `select * from cron.job`.

| Job | Schedule | Target |
|---|---|---|
| anonymize-founder-pulse-daily | `41 3 * * *` | rpc anonymize_stale_founder_pulse_responses |
| archive-contracts-daily | `0 2 * * *` | edge archive-contracts-to-sharepoint |
| auto-sync-outlook-emails | `*/5 * * * *` | edge sync-outlook-emails |
| automation-engine-hourly | `0 * * * *` | edge automation-engine |
| check-automation-health-15m | `*/15 * * * *` | rpc check_automation_health |
| check-contract-anniversaries-daily | `0 6 * * *` | edge check-contract-anniversaries |
| check-first-contact-outbox | `7 * * * *` | rpc check_first_contact_outbox |
| check-mentor-nda-expiry-daily | `0 8 * * *` | edge check-mentor-nda-expiry |
| check-missed-milestones-daily | `0 9 * * *` | edge check-missed-milestones |
| compute-cohort-benchmarks-daily | `0 4 * * *` | edge compute-cohort-benchmarks |
| ecosystem-invariants-hourly | `17 * * * *` | rpc check_ecosystem_invariants |
| email-sync-health-check | `*/10 * * * *` | rpc check_email_sync_health |
| generate-crm-notifications-daily | `30 8 * * *` | edge generate-crm-notifications |
| open-monthly-founder-pulse | `0 8 1 * *` | edge open-monthly-founder-pulse |
| recompute-health-scores-daily | `0 6 * * *` | edge recompute-health-scores |
| recompute-work-queue-daily | `15 6 * * *` | edge recompute-work-queue |
| reconcile-contract-founders-hourly | `17 * * * *` | rpc reconcile_contract_founders(NULL) |
| reopen-work-queue-snoozes | `23 * * * *` | rpc reopen_expired_work_queue_snoozes |
| run-checkin-reminders-weekly | `0 9 * * 1` | edge run-checkin-reminders |
| run-ecosystem-snapshot-daily | `0 3 * * *` | edge run-ecosystem-snapshot |
| run-intake-reminders | `0 9 * * *` | edge run-intake-reminders |
| send-email-digest-weekly | `0 8 * * 1` | edge send-email-digest |
| send-milestone-reminders-daily | `30 8 * * *` | edge send-milestone-reminders |
| send-weekly-health-digest-weekly | `30 7 * * 1` | edge send-weekly-health-digest |
| sweep-session-transcripts | `*/20 * * * *` | edge sweep-session-transcripts |
