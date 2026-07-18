
# Release Lead Plan — Leiria Launchpad Pro RC

This is a large, multi-batch job. I will work in ordered batches, stop only on destructive/live-data actions or product-choice forks, and produce evidence at each gate. No feature-freeze violations.

## Batch 0 — Baseline (read-only, ~30 min)

Goal: establish ground truth. No code changes.

1. Run canonical gates from a clean tree and capture failures verbatim:
   - `bun install --frozen-lockfile`
   - `bun run lint`
   - `bunx tsc --noEmit -p tsconfig.typecheck.json` (canonical typecheck config)
   - `bun run build`
   - `bunx vitest run`
   - `node scripts/i18n-check.cjs`
   - `node scripts/i18n-lint.mjs`
   - `node scripts/secret-scan.cjs`
2. Enumerate scheduled jobs from `supabase/SCHEDULED_JOBS.md`, `supabase/config.toml`, and cron migrations. Diff against actually-deployed pg_cron rows.
3. List every edge function and its `verify_jwt` setting.
4. Run Supabase linter and slow-query snapshot.
5. Dump route table and public-booking related routes/components.

Deliverable: a `docs/RC_BASELINE_2026_07_18.md` with raw failures, so every subsequent fix has a before/after row.

## Batch 1 — P0.A: Green gates (no product changes)

Fix, in this order, without bypasses:

1. **22 strict TS failures in Supabase update calls** — switch each call to `Database['public']['Tables']['<t>']['Update']` and drop the offending fields; no `any`, no ignore.
2. **`UnifiedSmartInbox.tsx:211` ternary side effect** — replace with an explicit `if` or a proper conditional expression that doesn't rely on evaluation for side effects.
3. **`useHiddenCanvasTools.ts`** — swap `@/integrations/supabase/client` → `@/lib/supabaseClient` (canonical PKCE client per `mem://infrastructure/supabase-client-standard`).
4. **`useFinancialPlan.test.tsx`** — rewrite test to match production find-then-update-or-insert path required by the partial unique index. Do not touch production code.
5. **84 missing runtime i18n keys** — add real translations to `en.json` and `pt.json`, verify diacritics, run i18n-lint until green. No generic fallbacks.
6. **Secret scan** — resolve any newly-flagged strings; confirm no service-role material in client/migrations.

Gate: all 8 canonical commands return zero failures. Commit checkpoint.

## Batch 2 — P0.B/C/D: Public booking journey

This is the highest external-risk finding. Product-choice fork here — pausing for approval before shipping the new resolver.

1. **B — Stable `/book` entrypoint**
   - Add route + edge function `resolve-public-booking-link` that returns the single active canonical link (or a `degraded`/`no_active_link` state).
   - Update Login CTA (desktop + mobile) → `/book`.
   - `/book/demo` continues to work; existing tokenized links unchanged.
   - Fallback UI: honest "request contact" form (uses existing lead capture) when no active link.

2. **C — Fail-closed availability**
   - `public-get-availability`: distinguish `available | unavailable | unverifiable | not_configured`; never fabricate slots on Graph error/timeout.
   - Return structured error body; client renders "temporarily unverifiable, request contact instead".
   - Emit diagnostic to `email_sync_runs`-style observability table (reuse or add `integration_diagnostics`).

3. **D — Idempotent booking commit**
   - New table `public_booking_attempts` with unique `idempotency_key`, state machine: `received → slot_validated → crm_persisted → graph_created → notified → done | failed(retryable|terminal)`.
   - `public-book-first-contact` becomes a resumable state machine keyed on idempotency key (client generates once per intent; server rejects duplicates by returning original result).
   - Escape founder name/org/message before Graph HTML injection.
   - Revalidate slot immediately before Graph create.
   - Add integration tests covering: double-click, network timeout post-Graph, Graph 4xx/5xx, DB fail pre/post Graph, slot race, invalid/expired token, rate limit.

Gate: new Vitest integration suite + manual Playwright script covering desktop + mobile.

## Batch 3 — P1.E–J: Automation truthfulness

1. **E — Automation registry** at `docs/automation-registry.md` + `src/lib/automationRegistry.ts` (typed). Reconcile with migrations; fix drift (verify `check-mentor-nda-expiry`, `sweep-session-transcripts` cron auth). No duplicate schedules.
2. **F — NDA reminder ledger** `mentor_nda_reminder_deliveries` with unique key `(mentor_id, acceptance_version, window_key)`; second run sends zero duplicates.
3. **G — Transcript sweep**: treat non-2xx as failure; persist per-session outcome; accurate counts.
4. **H — Webhook→notification auth**: add durable `notification_outbox` table + scheduled worker; DocuSign/PandaDoc webhooks enqueue instead of directly invoking `send-notification-email`.
5. **I — Typed sender results**: `SendResult = { attempted, sent, failed, skipped, retryable, permanent }`; wire into `send-notification-email`, `automation-engine`. No more boolean fire-and-forget.
6. **J — Health telemetry**: fix the current `email_sync_health_check_failed: "column reference \"status\" is ambiguous"` observed in logs (qualify the column in `check_email_sync_health`). Show real state per integration.

## Batch 4 — P1.K/L: CRM & backoffice

1. **K — Proposal sending outbox** with idempotency; enforce all Supabase errors; safe staff retry.
2. **L — Contract deep-link** `?tab=backoffice&subtab=contracts&contract=<id>` — verify route resolver, add regression test.

## Batch 5 — P1.M/N: Clickability contract

1. Build `docs/clickability-matrix.md` classifying every ambiguous surface across founder/consultant/mentor/staff.
2. Ship canonical `InteractiveCard`/`InteractiveRow` wrapping existing `clickableProps`; native `<a>`/`<button>` where possible; 44×44 targets; focus ring; nested-control propagation guard.
3. Apply to the verified problem surfaces only (founder dashboard action cards, stage progress, workspace overview metrics, mentor cards, workspace cards, Documents templates, Help Glossary, Shared Dataroom, Programme Materials). Remove misleading hover/pointer/chevron on informational surfaces.

Gate: axe clean on those surfaces; keyboard parity.

## Batch 6 — P1: Persona E2E hardening

Rewrite Playwright suites in `e2e/` to fail on `pageerror`, console error, failed request, unhandled rejection. Seeded fixtures per persona. No `.skip`. Explicit allowlist only for known third-party noise, reviewed inline.

Covers all four personas + public visitor journeys listed in the request.

## Batch 7 — P2: Polish

1. **O — Rename** "Plano de Negócios" → "Plano Financeiro Guiado" (PT) / "Guided Financial Plan" (EN), realign card copy. Post-launch epic tracked in `docs/post-launch-epics.md`.
2. **P — Performance profiling**: capture cold-load traces on seeded data; set budgets; only split measured boundaries. No blind `manualChunks`.
3. **Q — PWA honesty**: remove any "works offline" copy; keep legacy SW unregistration in place.

## Batch 8 — Migration safety & final gate

1. Replay all migrations against a fresh empty DB (via `supabase db reset` in a sandbox) — capture counts, RLS/grant/trigger/cron invariants.
2. Replay against anonymized clone if available; otherwise document the gap.
3. Compare invariant counts (workspaces, funnel_items, contracts, sessions, orphans/duplicates) — no drift.
4. Re-run all canonical gates from clean.
5. Run hardened Playwright suite.

## Deliverables at end

- `docs/RC_LAUNCH_REPORT.md` with GO/NO-GO, before/after table per finding ID, root cause, files changed, commands + summaries, E2E evidence, registry diff, DB replay evidence, perf numbers, residual risks.
- Every claim backed by a run log or persisted artifact, not by "should work".

## Pauses I will make

I will stop and confirm before:

- **Batch 2 (B/C/D)** — public booking is a product-shape change (new `/book` route + fallback contact form). Two viable options: (i) fully replace `/book/demo` CTA with the resolver, (ii) keep both. I need your call.
- **Batch 8** — before running any migration replay against a production-like clone.
- Anywhere I discover a live-data-destructive step.

Everything else in the plan is safe and reversible, so I will proceed continuously through Batch 0 → 1 → (pause) → 2 → onward.

## What I will NOT do

- Rename database concepts, remove widgets, remove role capabilities, redesign product surfaces, restore the neutralized destructive migration, edit `src/integrations/supabase/client.ts` / `types.ts` / `.env`, or bypass any gate.
- Claim green from grep or a manually-emitted toast.
- Enable offline PWA behavior.

---

**Ready to proceed?** If yes, I start Batch 0 immediately and stop at the Batch 2 fork.
