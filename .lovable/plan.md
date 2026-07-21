
# RC5 Rescue — Source-Truth Map & Execution Plan

Two-phase engagement. Phase 1 (this document) publishes the source-truth map and the batched execution plan. Phase 2 executes A→G in agent mode, batch by batch, without further prompts.

## Scope reality check (read this first)

The full scope above (7 batches, ~30 sub-items, a full harness rebuild, staging census, fresh-replay in disposable Supabase, seeded Playwright at 4 viewports, pgTAP matrix, bundle profiling, live reconciliation) cannot honestly be completed in a single autonomous session inside this sandbox for two hard reasons:

1. **No staging Supabase, no Docker, no MS Graph test tenant, no Mailtrap key are injected.** Every "prove behavior" gate (fresh replay, forward apply, seeded E2E across 4 viewports, failure-injection for Graph/email/storage/signature) requires infra I cannot provision. Per your own rule #2, those items must be reported **NOT PROVEN** with a non-zero release gate — not silently skipped, not fake-passed.
2. **Person-specific production repair migrations already exist in history** (A4). Per your rule #3, I will not rewrite applied migration history. I will inspect, document, and add forward-only reconciliation + CI guardrails.

Everything **locally executable** — code fixes, new migrations (forward-only, idempotent), RPCs, RLS tightening, unit/pgTAP test files, i18n keys, harness scripts, config — I will land. Everything requiring live infra will ship as executable scripts + explicit NOT PROVEN entries in `docs/rc5/results.md`. The final verdict will therefore be **NO-GO until ops runs the staging harness**, exactly as rule #1 requires.

## Source-truth map (per domain)

### 1. Contracts — signing, dispatch, documents, autosave

| Operation | UI caller | Edge/RPC | Tables | Auth | Idempotency | Txn | Test |
|---|---|---|---|---|---|---|---|
| Inline eIDAS sign | `PublicContractSigning.tsx` | `public-contract-onboarding` (`action=sign_inline`) | `startup_contracts`, `contract_lifecycle_events` | Public token (SHA-256) | Token single-use (missing enforcement) | Non-atomic: SELECT → UPDATE | none |
| Provider dispatch | `ContractDetailDrawer` "Send" | `send-contract-for-signature` (DocuSign/PandaDoc) | `startup_contracts.envelope_id/pandadoc_id`, `contract_lifecycle_events` | Staff RLS | None — retry duplicates envelopes | UI marks `sent` before provider ack | none |
| Manual mark sent/signed | `ContractDetailDrawer` | `mark_contract_sent`, `mark_contract_signed` RPCs | `startup_contracts`, intake/funnel | Staff | ok | ok | partial |
| Document upload | `ContractOnboarding`, `PublicContractIntake` | `upload-contract-document` | `startup_contracts.documents_json`, storage `contract-documents` | Staff / signed token | None — last-write-wins on `documents_json` | Two-step (storage then metadata), no rollback | none |
| Intake autosave | `PublicContractIntake`, `ContractOnboarding` | `useContractDraftAutosave` → `public-contract-onboarding action=save_draft` | `contract_intakes` / `startup_contracts` | Token | Debounced local; no CAS | No revision guard; prefill can retrigger save | none |

**Shadow paths:** `ContractDiscountsPanel` writes `contract_discounts` directly; CRM `OverviewTab` writes overlapping discount rows — see B/C.

### 2. Programmes — publish + workspace transfer

| Operation | UI | Backend | Tables | Notes |
|---|---|---|---|---|
| Publish programme | `ProgramSetupWizard.publish()` | Multiple sequential Supabase calls | `programs`, `kpi_definitions`, `program_weeks`, `program_gates`, `stages`, `playbook_items` | **Not one txn** — snapshot failure leaves orphans. C2 target. |
| Transfer workspace programme | `ProgramSwitcher`, `staff_transfer_workspace_program` | RPC (canonical) + legacy direct updates in `ProgramSwitcher` code path | `workspaces`, `milestones`, `action_items`, `program_weeks` | Shadow write in `ProgramSwitcher.tsx` bypasses RPC. C1 target. |

### 3. Mentors — availability → booking → session → impact

| Operation | UI | Backend | Idempotency |
|---|---|---|---|
| Public availability | `PublicBooking.tsx` | `public-first-contact-availability` | Returns [] on error (**A2/E3 verify: fail-closed already partially landed**) |
| Create booking | `MentorBookingDialog` | `mentor_book_slot` RPC | Slot advisory lock — verified |
| Accept/decline/cancel | Client-side status update in `MentorBookings.tsx` | Direct `mentor_bookings.update` | **No transition RPC** — D1 target |
| Impact metrics | `MentorImpact.tsx`, `mentor-impact-pdf` | Selects `sessions.duration_minutes` (nonexistent) | **D2 target** |

### 4. CRM / import / reconciler

| Path | Command | Issue |
|---|---|---|
| Import leads CSV | `LeadsImporter.tsx` → client `split(',')` → direct `funnel_items` insert | **Unsafe. E1 target.** Canonical is `bulk-import-leads` edge + `bulk_import_batches`. |
| Reconciler | `admin/ReconcilerPanel` → `run-reconciler` | Empty allowlist path exists (E2 target) |
| Public first-contact | `PublicBooking.tsx` → `public-book-first-contact` | Idempotency + outbox partial (E3 target) |

### 5. Automations vs. cron

Expectations in `automation_health_expectations`: automation-engine, sync-outlook-emails, check_automation_health, generate-crm-notifications, check-missed-milestones, check-mentor-nda-expiry, recompute-health-scores, email_sync_status, reconcile-contract-founders.

Actual `pg_cron` (from `cron.job`): sync-outlook-emails (5m), automation-engine (hourly), reconcile-contract-founders (hourly). Others: **unscheduled or phantom**. F1 target.

### 6. Profiles / RLS

Migration `20260719145244` added a peer SELECT on base `profiles` — must be reverted; use `profiles_safe` view. A3 target.

### 7. Harness

`scripts/rc5/verify.mjs` correctly fails when `RC5_ALLOW_STAGING_TESTS != 'true'`. Placeholder scripts: `migrate-fresh-replay.mjs`, `migrate-forward.mjs`, `probe-graph.mjs`, `probe-email.mjs`. Playwright specs exist but not run against staging. Cleanup script exists.

## Execution plan (agent mode, batch by batch)

Order optimizes safety: A (P0 containment) → B (contracts) → C (programmes) → D (mentors) → E (CRM/booking) → F (automations/health) → G (delivery + UX + gates). Each batch closes with build + typecheck + vitest.

### Batch A — P0 containment (this session, high confidence)
- A1: New `sign_contract_atomic(contract_id, token, actor_role, evidence)` SECURITY DEFINER RPC. Row-level lock, full field load, explicit consent asserts, immutable `contract_lifecycle_events` write with `evidence_json` (regulation ver, doc SHA-256, IP hash, UA, idempotency key). Token single-use via `used_at`. Bilateral: founder → `partially_signed`; counter-signer required for `signed`. Replace inline path in `public-contract-onboarding`. Remove "eIDAS compliant" wording where legal review marker is absent.
- A2: Reorder `sync-outlook-emails` to auth before `auto_sync`. Timing-safe compare of `x-cron-secret`. Strip mailbox addresses from unauthorized error responses. Add `supabase/config.toml` entry. Unit tests: 4 personas × cron secret variants.
- A3: Migration revokes peer SELECT on `profiles`, restores prior view usage. pgTAP for founder/mentor/consultant/backoffice/admin/unrelated.
- A4: CI script `scripts/ci/scan-migrations.mjs` — regex for email addresses + bare UUID DML in `supabase/migrations/*.sql` with an allowlist file. Add to `.github/workflows/ci.yml`. Document forward-only reconciliation policy in `docs/rc5/migration-policy.md`. Do NOT rewrite applied history.

### Batch B — Contract reliability
- B1: `signature_dispatch` table (queued/dispatching/provider_accepted/failed/manual/signed) + `dispatch_contract_signature(contract_id, provider)` RPC + edge outbox worker. Reconcile provider IDs before retry; DocuSign & PandaDoc list-by-metadata guard. UI states derived from dispatch, not stale `status`.
- B2: `contract_documents` normalized table with `(contract_id, doc_key)` unique. `upsert_contract_document` RPC with atomic JSONB merge fallback for legacy readers. Storage-then-metadata saga with cleanup RPC. Tests for the 6 scenarios listed.
- B3: `useContractDraftAutosave` — add `hydratedRef` guard, revision (`updated_at` CAS), 409 conflict dialog, retain localDraft until server confirms same payload+revision. Apply to all 3 forms.

### Batch C — Programmes
- C1: Delete direct-update path in `ProgramSwitcher`; call `staff_transfer_workspace_program` only. Add `active_milestones` view (`archived_at IS NULL`); repoint dashboards/reports/session-prep/investor-updates/shared workspace. Tests both directions + retry.
- C2: `publish_program(payload jsonb)` SECURITY DEFINER RPC — single txn writes program, KPIs, weeks, gates, stages, playbook items, audit event. Idempotent by draft key.

### Batch D — Mentors
- D1: `mentor_transition_booking(booking_id, target_state, actor)` RPC — pending→accepted creates session + notification outbox in one txn. Overlap check inside txn.
- D2: `mentor_impact_metrics(mentor_id, workspace_id?)` view. Selects only completed sessions with participation row + `actual_duration_minutes IS NOT NULL`. Repoint `MentorImpact.tsx`, PDF, staff analytics. Fix nonexistent `duration_minutes` reference. Tests: two-mentor workspace, no-show, cancelled, past-scheduled-uncompleted.

### Batch E — CRM / booking
- E1: Server-side CSV parse in `bulk-import-leads` (papaparse-style, quoted-field aware). Client `LeadsImporter` uploads raw CSV; review step reads `bulk_import_rows`; commit stays idempotent by `(batch_id, row_hash)`. Remove `split(',')`.
- E2: `run-reconciler` fails closed on empty allowlist; requires `batch_id`, `plan_hash`, `authorized_row_ids[]`, `canary_cap`. `workspace_alerts` severity fixed enum.
- E3: `book_first_contact_atomic` RPC + `first_contact_outbox` table for Graph event + email + notification. Idempotency arbiter on `(email_normalized, slot_start, program_id)`. Merge CRM `metadata_json` via `jsonb_deep_merge` server-side. Remove founder `/crm` link. DB rate-limit table `public_booking_rate_limits`.

### Batch F — Automations / health
- F1: Reconcile `automation_health_expectations` with real `cron.job` list. Drop `email_sync_status` expectation (no emitter). Schedule missing jobs with `x-cron-secret`. Every scheduled edge wraps with `withCronRunLogging`.
- F2: Single severity enum migration (`alert_severity`). Dedupe `system_alerts` before adding unique index on `(kind, entity_ref, day)`. `SystemHealthDashboard` states: OK/UNKNOWN/NEVER_RUN/STALE/RECOVERED/FAILED. Instrument health checks themselves.
- F3: Transcript containment — include NULL source in analysis; default ambiguous → `staff_only`; add `transcript_review_queue` + `reclassify_transcript(id, tier, reason)` staff RPC. Align vocabulary between `import-teams-transcript` and `teams_graph`.

### Batch G — Delivery, product truth, UX, gates
- G1: `notifications` outbox states (queued/leased/delivered/failed) + `notification_attempts`. Proposal send reuses `client_command_id`.
- G2: Rename Business Plan tile → "Guided Financial Plan". Add separate "Business Plan Template (DOCX)" tile linking to existing PT/EN templates. Keep BP-assistant behind `feature_flags.business_plan_assistant_v2` (off).
- G3: `save_financial_scenario_atomic` RPC. Local draft preserved until server confirm.
- G4: Add `ClickableCard` primitive using `clickableProps`. Audit + convert offending Card/div click handlers on the 7 listed surfaces.
- G5: Fix `SendProposalDialog` restricted import (use `@/lib/supabaseClient`). Fill all 30 missing i18n keys in PT+EN. Add bundle profile script; lazy-load `pdf`, chart, import, persona-only routes; document 900KB initial JS budget in `docs/rc5/bundle-budget.md`. Confirm Bun 1.2.0 in `playwright.config.ts` webServer. Add `.env` to release-wrapper export ignore.

### Harness
- Namespace seed with `rc5-e2e-<runId>` prefix everywhere.
- `finally { cleanup() }` in every seeded spec; cleanup asserts zero rows.
- `migrate-fresh-replay.mjs` uses `supabase db start` (disposable local Supabase) — script ready; execution requires Docker (**NOT PROVEN** here).
- Playwright specs already exist at 4 viewports; harness will ship, execution requires staging (**NOT PROVEN** here).
- Suppressive `catch` and toast-based assertions purged.

### Live census
- `scripts/rc5/census.sql` + `scripts/rc5/census.mjs` running read-only against staging URL when provided. Outputs `docs/rc5/census-<ts>.md` + exception CSVs under `docs/rc5/exceptions/`. In this session: **NOT PROVEN** (no staging URL).

## Technical notes

- Every new RPC: `SECURITY DEFINER`, `SET search_path = public`, explicit auth check by JWT claims, `RAISE EXCEPTION` on unauthorized. `GRANT EXECUTE` limited to `authenticated`/`service_role` per surface.
- Every new public-schema table: `CREATE TABLE` → `GRANT` → `ENABLE RLS` → `CREATE POLICY` in the same migration.
- All migrations forward-only, additive, idempotent (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
- Types regenerated after each migration approval.
- No feature removal. Business Plan tile is **renamed and split**, not removed.

## Final response format (Phase 2 deliverable)

The report will strictly follow the 10-point format you specified, with honest GO/NO-GO and explicit NOT PROVEN entries for anything requiring live infra.

---

**Approval requested to begin Phase 2 (Batch A).** I will proceed batch by batch without further prompts once approved.
