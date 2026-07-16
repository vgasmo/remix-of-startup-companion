# Persona Audit & Hardening — Release Candidate Pass

## Scope discipline
This is a live production app. The plan below is executed as a sequence of small, verifiable slices. Every slice ends with a real check (typecheck, SQL, or targeted E2E) before moving on. No speculative redesigns. Reconciler writes and Admin Data Import V2 stay OFF for the entire pass.

## Ground rules (enforced during execution)
- Never edit already-applied migrations — only new idempotent corrective migrations.
- No `any`, `@ts-ignore`, blanket casts, swallowed errors, or fabricated data.
- No destructive tests against real workspaces — use clearly-labelled `__audit__` fixtures.
- Every fix ships with a regression test or an SQL invariant.
- If an external integration (MS Graph, Teams, PandaDoc, Twilio, SharePoint) cannot be exercised, it is reported as **UNVERIFIED** — not "working".

## Phase 0 — Baseline truth (no code changes)
1. Run canonical checks and capture exact output:
   - `bunx tsc --noEmit -p tsconfig.typecheck.json`
   - `bun run lint`
   - `bunx vitest run`
   - `node scripts/i18n-check.cjs && node scripts/i18n-lint.mjs`
   - `node scripts/secret-scan.cjs`
   - `bun run build`
2. Snapshot DB invariants (row counts, orphan checks, RLS spot-checks) via `supabase--read_query`.
3. Confirm both reconciler kill switches are OFF; if commit UI is reachable, hide it behind the flag.

Gate: baseline recorded before any edit.

## Phase 1 — Persona Journey Matrix
Produce a concise matrix (persona × job × journey × current friction × data touched × permission boundary × test coverage × proposed fix × risk). Delivered as `docs/audit/persona-journey-matrix-2026-07-16.md`. No code changes yet.

## Phase 2 — Correctness fixes (highest priority)
Only defects with clear evidence of data-loss, authorization gap, or false-success are fixed here.

Known/suspected items to verify and, if confirmed, correct:
- **Reconciler RPC signature mismatch** — align signature; keep commit path gated by OFF flags; ensure the panel disables commit controls when either kill switch is OFF.
- **Session completion atomicity** — audit `complete_session` path; if session + participants are updated in separate statements, replace with a single `SECURITY DEFINER` RPC using row locking, explicit `actual_duration_minutes` (never inferred from planned), consultant authorization, and idempotency key.
- **Actual meeting duration** — grep for any assignment of `actual_duration` from planned/scheduled fields; remove.
- **Booking token storage** — verify `public_booking_links.token` is hashed (SHA-256) at rest; if a plaintext column exists, add corrective migration to drop/rehash.
- **Census / snapshot completion** — ensure "completed" status requires successful domain exports + manifest upload; fail closed on CSV/query/upload errors and raise a durable `system_alerts` row.
- **Invariant monitor** — replace any `throw` in a background path with `system_alerts` insert.

Each confirmed fix: migration (idempotent) + code + targeted vitest or `pgTAP`-style SQL check.

## Phase 3 — Draft & autosave resilience (Founder assistants)
Focused on Business Plan + Financial Plan assistants and Contract intake.
- Verify `useSingleFlightDraft` / `useContractDraftAutosave` flush on `visibilitychange` and `beforeunload`.
- Confirm server draft revision check rejects stale writes with `SaveState = 'conflict'` and reconciles.
- Confirm KPI writes from XLSX imports go through preview + explicit mapping (no silent writes).
- Confirm generated KPIs carry `source = 'financial_model'` + link back to the model version.
- Add missing tests for: partial save → refresh → restore; conflict reconciliation; XLSX with formulas/macros; duplicate import idempotency.

## Phase 4 — Persona smoke tests (Playwright, headless, localhost)
One script per persona, seeded fixtures, desktop 1280 + mobile 375:
- Founder: login → workspace → onboarding → One Thing Today → open Business Plan assistant → answer 2 questions → refresh → verify restore → open Financial assistant → switch scenario → verify no data loss.
- Consultant: CRM pipeline drag → saved view restore → open startup → session prep → complete session (RPC) → verify participants + actual duration written atomically.
- Mentor: login → NDA gate → availability set → booking conflict rejected → impact panel shows real completed-session counts (or empty-state copy for new mentor).
- Staff: contract intake draft recovery → manual-resolution deep link opens exact entity → census dry-run with malformed CSV fails closed → snapshot completion requires manifest.

Every failure becomes a defect entry with root cause + fix or **UNVERIFIED** marker.

## Phase 5 — Performance (measure first)
Instrument the six priority routes (CRM, workspace overview, founder dashboard, consultant portfolio, mentor dashboard, assistants) via Playwright + `performance.getEntriesByType('resource')`. Report request count, waterfalls, duplicate queries. Only fix items with measured impact — batch obvious N+1s in `useCrmPipeline`, `useWorkspaceData`, `useMentorAvailability`. Keep error handling, cancellation, cache keys, and RLS filters intact. Report before/after.

## Phase 6 — UX consistency (low-risk only)
After correctness + perf gates are green:
- Standardize saveable-surface status chips (Saving / Saved / Offline / Failed / Retry) via existing `SaveState` union.
- Standardize empty states on the six priority routes using the existing `EmptyState` component (copy only, no new components).
- Fix any dialog/drawer that doesn't scroll at 375px.
- No new navigation, no gradient/animation additions, no terminology changes.

## Phase 7 — Final verification
Re-run every command from Phase 0. Diff before/after. Require:
- Typecheck: 0 errors
- Lint: 0 errors
- Vitest: all pass
- i18n parity + lint: pass
- Secret scan: pass
- Build: success
- New regression tests: pass
- DB invariants: unchanged or improved

## Deliverables in final message
1. GO / NO-GO verdict
2. Persona journey matrix (link to doc)
3. Confirmed defects fixed with root cause
4. Files + migrations changed
5. Exact command outputs (before/after)
6. DB before/after invariant checks
7. Perf before/after evidence
8. Screens tested per persona × viewport
9. Features preserved (explicit list of untouched surfaces)
10. UNVERIFIED integrations + residual risks
11. Rollback instructions per migration

## Explicit non-goals for this pass
- Enabling reconciler writes or Admin Data Import V2
- Redesigning navigation or dashboards
- New AI features or new personas
- Storage bucket bootstrap (already documented as manual)

## Time / scope realism
This plan intentionally sequences correctness → resilience → perf → UX. If Phase 2 uncovers a defect that requires a schema change with unclear blast radius, that specific item is escalated as **NO-GO blocker** with a proposed migration, rather than shipped in the same pass.
