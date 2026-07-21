# RC5 Stabilization + Monthly Founder Pulse — Execution Plan

This is a reliability rescue, not a redesign. All changes are forward-only, feature-flagged where risky, and gated on evidence. No feature removals. No client-side privileged writes. No fabricated data.

## Operating invariants (apply to every batch)

- Forward-only migrations. No edits to already-applied migrations. Every constraint change enumerates the full canonical vocabulary.
- All multi-write business operations execute in a single SECURITY DEFINER RPC with `SET search_path = public`, internal authorization, least-privilege grants, and `REVOKE ... FROM PUBLIC, anon` where inappropriate.
- Idempotency: every command accepts a client `command_id uuid`, enforced by unique index; retries return the original result and do NOT replay side effects.
- Notifications/emails go through an outbox with `queued → leased → delivered | failed_retryable | failed_terminal`. Delivered is stamped ONLY after provider confirms.
- Every new automation writes both a `started` and terminal `cron_job_runs` row via the shared wrapper, has a kill switch (feature flag or `enabled` column in registry), and is scheduled from the canonical registry.
- Truthful states: never turn a provider error into success. Ambiguous provider timeouts go through reconciliation.
- I18n: PT-PT + EN reviewed keys, no `defaultValue` in core flows, strict lint stays green.
- No item is marked "fixed" without: (a) a failing repro before, (b) a passing behavior test after, (c) file/line evidence in the ledger.
- Anything requiring staging providers (Graph, DocuSign, email, cron) is marked `NOT PROVEN` with the exact command needed.

## Phase 0 — Inspection & Evidence Ledger

Deliverable: `docs/rc5/evidence-ledger.md` with one row per acceptance item and one row per Batch A–G subtask, status ∈ {confirmed, already-correct-with-proof, fixed, blocked, not-proven}.

Read/enumerate (no writes):

1. Migrations already applied touching: `sessions`, `session_participants`, `mentor_bookings`, `startup_contracts`, `contracts`, `profiles`, `funnel_items`, `communication_log`, `automation_health_expectations`, `cron_job_runs`, `notification_ledger`, `notification_attempts`, `feature_flags`, `financial_*`, `programs`, `stages`, `program_weeks`, `program_gates`.
2. Every writer of the state fields listed by the user (grep + AST walk of `supabase/functions/**` and `src/**`). Produce `docs/rc5/state-writers.md` with file:line and whether the writer goes through an RPC or writes directly.
3. Canonical state machines: session lifecycle, mentor booking lifecycle, contract signing/activation, CRM import batch/row, programme publish/version. Draw as tables in `docs/rc5/state-machines.md`.
4. Reconcile `automation_health_expectations` rows against `pg_cron` jobs and wrapper call sites; list every drift.

Repro scripts (read-only): stored under `scripts/rc5/repro/` with a `README` mapping each P0 to its repro.

## Batch A — Session & Meeting Integrity (P0)

### A1. `log_completed_session_atomic(p_command_id uuid, ...)` RPC
- Inputs: workspace, title, occurred_at (must be `<= now()`), actual_duration_minutes (>0, <=1440), meeting_type, primary_consultant_id (nullable when mentor is attribution), primary_mentor_id (nullable), attendance jsonb[], notes, decisions, location, evidence_url.
- Auth matrix inside RPC: staff/admin always; consultant if assigned to workspace; founder if member; mentor only via active `mentor_connections` with the workspace.
- Writes in one transaction: `sessions` row (`source='off_platform'`, `status='completed'`, `outlook_sync_status='not_applicable'`, actual_duration, primary attribution), `session_participants` upserts (`attendance_status`), one `tool_usage_events` row `session_completed`, one `activity_log` row. NO `session_scheduled`, NO Outlook enqueue.
- Idempotency: unique index on `sessions(command_id)` (new nullable column, backfilled NULL). Retry with same `p_command_id` returns the existing session id.
- UI: `CreateSessionDialog` past-meeting branch becomes a distinct form calling the RPC via `invokeWithAuth`. Future date → route to normal scheduling.
- Tests (Vitest + pgTAP): unauthorized actor, past vs future timestamp, consultant vs mentor attribution, attendance persistence, duplicate command_id, no provider sync, metrics.

### A2. Session-source vocabulary correction
- Enumerate every writer of `sessions.source`. Build the canonical set `{ manual, teams_import, webhook, off_platform, mentor_booking, public_booking }` (adjusted to actual grep results).
- Forward-only migration drops+recreates `sessions_source_check` with the full set. Vitest + pgTAP test: `mentor_transition_booking` accepts and creates a linked session with `source='mentor_booking'`.
- Read-only impact query in `docs/rc5/queries/mentor-booking-stuck.sql` — no auto-repair.

### A3. Mentor booking ↔ session lifecycle
- Add `mentor_bookings.linked_session_id uuid references sessions(id)` + unique partial index on `(mentor_id, linked_session_id) where linked_session_id is not null`.
- `mentor_transition_booking` becomes the only writer. Acceptance: creates or returns existing linked session atomically. Completion: calls `log_completed_session_atomic` internally (`p_command_id = md5(booking_id||'complete')::uuid`).
- Availability query considers accepted bookings + normal sessions + configured busy times.
- Impact report already filters completed+duration; add explicit "active assignments" vs "startups helped" split.

## Batch B — Contract & Privacy Safety (P0)

### B1. DocuSign atomicity
- Hoist `actorUserId` to top scope with `null` default; log service-actor vs user-actor explicitly.
- Deterministic `envelope_command_id = sha256(contract_id || document_version || 'send')`. Unique index on `startup_contracts(envelope_command_id)`.
- States: `preparing → provider_pending → sent | ambiguous | failed`. Reconciliation edge function `reconcile-docusign-envelopes` looks up ambiguous by our command id via DocuSign search.
- PDF failure = fail-closed (no envelope send). Add function typecheck to CI.

### B2. `apply_contract_signature_atomic(p_command_id, p_token_hash, p_signer_kind, p_consent jsonb, p_evidence jsonb)` RPC
- Locks contract row (`FOR UPDATE`), re-validates token hash, expiry, purpose, document version.
- Consent read from request; no hardcoded `true`. Rejects if required consent flags absent.
- Bilateral: sets one signer's state; only activates when BOTH required signatures present. Immutable evidence log appended.
- Public function becomes a thin edge that hashes the token and delegates. Do NOT claim eIDAS in code/UI; add legal-review ledger item.

### B3. `profiles_peer_view` (security invoker view or SECURITY DEFINER RPC)
- Exposes `{id, full_name, avatar_url, role_public}` only. Base `profiles` restricted to self + staff. Update all peer readers (workspace members list, chat, mentor gallery) to use the peer view. RLS matrix tests: founder-of-A cannot see profile fields of founder-of-B beyond peer view.

## Batch C — Automation & Notification Truth

### C1. Canonical automation registry
- Table `automation_registry(job_key, edge_endpoint, schedule_cron, tz, expected_interval, stale_after, log_key, enabled, owner, severity, required_secrets text[])`.
- Migration seeds real jobs: `automation-engine`, `sync-outlook-emails`, `check-missed-milestones`, `check-mentor-nda-expiry`, `generate-crm-notifications`, `recompute-health-scores`, `check_automation_health`, `check_email_sync_health`, `reconcile-contract-founders-hourly`, new `monthly-founder-pulse-dispatch`, `monthly-founder-pulse-reminder`.
- Verifier RPC `verify_automation_registry()` returns drift vs `cron.job`. Health view distinguishes `healthy | never_run | stale | failing | disabled | configuration_missing`.

### C2. Notification outbox
- Repurpose `notification_attempts` (already exists) as the true outbox with states above, `lease_owner`, `lease_expires_at`, `next_attempt_at`, `provider_message_id`, `last_error_class`, `delivered_at`.
- Keep `notification_ledger` as the unique-business-key dedup index. Migrate NDA + commercial proposal callers first (behind a flag), then broader.

### C3. Public first-contact booking
- Wrap CRM+funnel+Graph+email+notify in `public_book_first_contact_atomic(p_command_id, ...)` RPC + outbox rows. Deep-merge metadata via existing `jsonb_deep_merge`. Retries return existing booking.

### C4. CRM staged import
- Enforce `crm_lead_import_batches.created_by` must equal the committer OR committer has explicit `admin`. Require `target_consultant_id` (not inferred).
- Per-row commit RPC `commit_crm_lead_row(batch_id, row_id, decision, target_consultant_id)`, idempotent. Partial batch retryable. Consolidate importer UI to one path; keep dry-run + validation export.

## Batch D — Programme & Financial Truth

### D1. Atomic programme publish
- One RPC `publish_program_version(program_id, expected_version)` with `FOR UPDATE`. Writes program version snapshot + weeks/gates/stages + KPIs + templates in one tx. Incubation omitted stages → versioned deactivate (not delete). Preflight blocks type conversion when references exist without operator remap.

### D2. Financial scenario save
- Trace real writers (`useFinancialPlan`, `financial_plan_sessions`, `financial_assumptions`, `financial_model_versions`, `financial_prefill_proposals`). Implement `save_financial_scenario_atomic(session_id, expected_version, assumptions jsonb, cell_map jsonb, metric_map jsonb)` that matches the real model. Wire the guided UI to it. Retire the unused stub only after all callers migrated.

### D3. Business Plan naming truth
- Rename current tile to "Plano Financeiro Guiado" / "Guided Financial Plan". Register `business_plan_assistant_v2` in typed flag registry (default OFF). Assistant surface only mounted when flag ON.

## Batch E — Monthly Founder Pulse

### E1–E3. Data model + candidate resolution
- Migration: `founder_monthly_pulses` per spec + `founder_monthly_pulse_tokens(pulse_id, token_hash, purpose, expires_at, used_at)` with hashed single-use tokens (SHA-256, 32-byte random).
- RLS: founder self via `auth.uid()`; consultant via `workspaces.assigned_consultor_id`; staff via `has_role`. Anonymous access strictly via `redeem_pulse_action(p_token_plain, p_response)` RPC that hashes and validates.
- Candidate resolver SQL function `resolve_monthly_pulse_candidates(period date)` returning eligible rows + exception reasons (`no_consultant`, `ambiguous_consultant`, `opted_out`, `invalid_email`, `inactive`).

### E4. Schedule & delivery
- Daily UTC cron `monthly-founder-pulse-dispatch`. Function checks: is today the first business day of the local (Europe/Lisbon) month at ~10:00? If yes, atomically claim the period per candidate (unique `(workspace_id, founder_user_id, period_month, template_version)`).
- Enqueue via outbox. Provider is existing email infra (`send-transactional-email`). Reminder job runs daily; sends one reminder after 5 business days if no response, then stops.
- Kill switch: feature flag `founder_monthly_pulse` default OFF + registry `enabled=false`.

### E5. Response behavior
- `redeem_pulse_action` records response once (unique index prevents dupes). `needs_help` creates one `staff_work_queue_items` row + one `notifications` row via outbox. `book_meeting` returns booking URL scoped to consultant/workspace. Optional comment: 1000 char cap, sanitized.

### E6. Operational UX
- Consultant dashboard card: "Pulses do mês" with counts + drilldown.
- Staff admin surface under `/admin` with dry-run, test-send-to-internal, exceptions list, per-consultant metrics (aggregate, not ranking).
- Founder response page `/pulse/:token` — mobile-first, no login, invalid token → generic recovery, no data leakage.

### E7. Rollout
- Phase 1 dry-run only. Phases 2–4 gated on evidence review. Kill switch documented in `docs/rc5/rollback-runbook.md`.
- Legal/DPO ledger item added and marked BLOCKING until sign-off.

## Batch F — UX, i18n, Clickability

### F1. i18n
- Resolve all 66 strict-lint failing keys with reviewed PT-PT + EN copy. Remove `defaultValue` from core flows. Rerun `scripts/i18n-lint.mjs`.

### F2. Clickability sweep
- Convert to `ClickableCard` / native links: `SessionCard`, `WorkspaceOverview` KPI blocks, `StageProgressCard`, `ConsultorTools` tiles, `SupportMaterialsTab` items, setup/review wizard cards. Accessibility test per element (keyboard, focus ring, SR name).

### F3. Draft reliability E2E
- Playwright specs `e2e/template-autosave.spec.ts` + `e2e/contract-autosave.spec.ts` covering the 8 scenarios listed. Investigate `useTemplateDraftAutosave` for stale-closure; only consolidate to `useSingleFlightDraft` if parity tests pass.

## Batch G — CI, Migrations, Staging Proof

### G1. CI
- Pin Bun to exact `packageManager` version. Add `deno lint`/`deno check` for `supabase/functions/**`. Keep existing i18n/secret/size gates. Add `bunx vitest run` + `bunx playwright test`.

### G2. Migration truth
- `scripts/rc5/migrate-fresh-replay.mjs` proves fresh replay green. `scripts/rc5/migrate-forward.mjs` from staging snapshot. RLS/DEFINER audit `docs/rc5/queries/definer-audit.sql`. NO destructive writes replayed.

### G3. Persona E2E
- Seeded Playwright journeys per persona at 320/375/768/1440 with cleanup fixtures. Provider-integrated tests marked `NOT PROVEN` until staging creds injected.

## Deliverables per batch (mandatory)

For each batch, ship:
1. Code + forward-only migration.
2. Vitest unit tests + pgTAP tests where DB behavior.
3. Ledger update with file:line evidence + repro before/after.
4. Read-only impact query for any suggested backfill; NO auto-mutation.

## Stop-and-ask gates (human required)

- Any production data mutation / backfill.
- eIDAS / DPO legal wording sign-off.
- Migration baseline reconciliation strategy for production DB.
- Rollout phase transitions for Monthly Founder Pulse beyond Phase 1 dry-run.
- Removal of any existing feature or narrowing of any existing permission.

## Sequencing

Batch order: Phase 0 → A → B → C → E (data+dispatch, flag OFF) → D → F → G. Batches A, B are P0 and land first. Batch E lands with flag OFF so it ships without user impact and is proven before rollout.

## Final report shape

The final message at GO/CONDITIONAL-GO/NO-GO will contain all 14 required sections. Every acceptance criterion links to (a) the failing repro, (b) the passing test, (c) the file:line where behavior lives.
