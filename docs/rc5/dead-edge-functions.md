# Edge functions with no in-repo caller (P4.6)

Audited 2026-09-08 with `rg` across `src/`, `supabase/functions/` and
`supabase/migrations/`. None of the functions below are invoked by application
code, by another function, or by a `pg_cron` job.

Decision: **kept, not deleted** — each is either an operator-triggered tool
(invoked manually from the backend console) or part of a paused capability whose
removal would need a product decision. They stay registered with
`verify_jwt = false` and validate credentials in code, so they are not
anonymously reachable.

| Function | Why it has no caller | Disposition |
|---|---|---|
| `analyze-template` | Template QA helper, run ad hoc by staff | Keep — operator tool |
| `bulk-create-workspaces` | One-off migration/import tool | Keep — operator tool |
| `commit-hubspot-history-import` | Historical CRM backfill, run per import | Keep — operator tool |
| `commit-hubspot-import` | Referenced by import docs/runbooks only | Keep — operator tool |
| `export-cohort-health-pdf` | Reporting export triggered manually | Keep — operator tool |
| `generate-first-contact-brief` | AI brief, gated behind staff review | Keep — pending UI wiring |
| `generate-invoices` | Unscheduled 2026-07-15 by the no-billing rule | Keep, permanently unscheduled |
| `generate-session-suggestions` | Superseded by session prep panels | Candidate for removal next release |
| `graph-config-status` | MS Graph diagnostics, run manually | Keep — operator tool |
| `run-workflow-rules` | Workflow engine kept dormant | Keep — dormant capability |
| `send-whatsapp-reminder` | Twilio path not enabled in production | Keep — dormant capability |
| `validate-booking-slot` | Validation moved into the booking RPC | Candidate for removal next release |

Removal of the two candidates is deliberately deferred: it changes the deployed
function surface and must ship on its own, with the deploy verified.
