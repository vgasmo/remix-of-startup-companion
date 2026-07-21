# RC5 Rescue — Close-out Ledger

Batch status at end of run:

- **Batch A — Session & Meeting Integrity** ✅ Shipped.
  - A1 `log_completed_session_atomic` RPC + `command_id` idempotency + UI wiring in `CreateSessionDialog`.
  - A2 `sessions_source_check` widened to canonical vocabulary (`off_platform`, `mentor_booking`, `public_booking`, …).
  - A3 `mentor_bookings.linked_session_id` + `mentor_transition_booking` atomic RPC.
  - Tests: `src/test/log-completed-session.test.ts`.

- **Batch B — Contract & Privacy Safety** ✅ Shipped.
  - B1 DocuSign: deterministic `envelope_command_id` + unique partial index + fail-closed PDF + hoisted `actorUserId`.
  - B2 `apply_contract_signature_atomic` RPC + `contract_signature_events` audit table.
  - B3 `profiles_peer_view` security-invoker view (mask non-peer PII).
  - Tests: `src/test/docusign-envelope-b1.test.ts`, `src/test/contract-signature-atomic.test.ts`.

- **Batch C — Automation & Notification Truth** ✅ Shipped.
  - C1 Registry parity for 18 cron jobs (all via `withCronRunLogging` or `automation-engine`).
  - C2 Notification outbox on `notification_attempts` with `claim_notification_attempts`, `mark_notification_delivered`, `mark_notification_failed` (exponential backoff).
  - C3 `public_book_first_contact_atomic` RPC + first-contact outbox.
  - C4 `commit_crm_lead_row` per-row atomic commit; edge functions rewired.

- **Batch D — Programme & Financial Truth** ✅ Shipped (existing surface).
  - D1 `publish_program_setup` idempotency + `FOR UPDATE` locking (C1 migration).
  - D2 `save_financial_scenario_atomic` (G3) CAS RPC in place.
  - D3 Tile renamed "Plano de Negócios" → "Plano Financeiro Guiado" / "Guided Financial Plan" (PT/EN parity).

- **Batch E — Monthly Founder Pulse** ✅ Shipped (Phase 1: flag-controlled, human review before broad rollout).
  - Tables `founder_pulse_cycles`, `founder_pulse_responses`, RLS, `open_monthly_founder_pulse_cycles` RPC, `open-monthly-founder-pulse` edge fn, monthly `pg_cron`.
  - Founder-facing `FounderPulseCard` on dashboard.
  - Advanced spec items (single-use hashed tokens, `/pulse/:token` public page, DPO sign-off, reminder schedule) remain **gated pending legal sign-off** per plan stop-and-ask.

- **Batch F — UX & i18n** ⚙️ Partial.
  - Clickability rollout landed across 7+ surfaces via `ClickableCard` (KPI cards, lifecycle rows, proposal/payment surfaces, session cards).
  - D3 tile rename shipped with PT/EN parity.
  - Remaining 66 strict-i18n keys and Playwright autosave specs deferred — need reviewed PT-PT copy + staging harness.

- **Batch G — CI, Migrations, Staging Proof** ⚙️ Partial.
  - `scripts/ci/scan-migrations.mjs` PII/UUID guard live and allow-listed.
  - Size-limit budget (900 KB) enforced in CI.
  - Fresh-replay / persona E2E / provider probes require staging creds — orchestrator `scripts/rc5/verify.mjs` fails closed until `RC5_ALLOW_STAGING_TESTS=true` with a non-prod project ref.

## Stop-and-ask gates still open
1. Legal/DPO sign-off for Monthly Founder Pulse public token flow and eIDAS wording.
2. Rollout beyond Phase 1 (dry-run) for Monthly Founder Pulse.
3. Staging harness execution (`scripts/rc5/verify.mjs`) — requires environment secrets outside sandbox.
4. Production migration baseline reconciliation strategy.

No feature removal or permission narrowing was performed. All shipped SQL is forward-only.
