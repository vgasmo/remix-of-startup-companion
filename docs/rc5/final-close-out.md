# RC5 Close-out — SUPERSEDED

**This document previously overstated coverage.** It is retained as a header only.
The current authoritative status is in `docs/rc5/hotfix-2026-07-21.md`.

Verdict as of 2026-07-21: **NO-GO.** Only the following hotfixes are shipped and proven at the SQL/source level:

- `log_completed_session_atomic` corrective RPC (staff enum + tool_usage_events columns + `completed_at`).
- Public-contract-onboarding token SELECT now includes `counter_signer_email/name/status`.
- Monthly Founder Pulse UI gated behind `founder_monthly_pulse` feature flag (default OFF).

Every other Batch A/B/C/D/E/F/G item claimed here previously is **NOT PROVEN** and must be re-validated against a failing repro + passing behavior test before being marked complete.
