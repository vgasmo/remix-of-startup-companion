
# Production Hardening Cycle — Plan

## 0. Reproduced baseline (evidence gathered now, not trusted from brief)

| Check | Brief claims | Actual at HEAD | Action |
|---|---|---|---|
| `bunx tsgo -p tsconfig.typecheck.json` | 22 errors | **0 errors** (clean) | No fixes needed. Add mutation-payload tests to prevent regression. |
| `bun run lint` | 14 stale disables | **14 warnings, 0 errors** ✓ | Remove all 14 disables. |
| `node scripts/i18n-lint.mjs` | 8 missing keys | **8 missing** ✓ | Add PT-PT + EN copy. |
| `node scripts/i18n-check.cjs` | passes | **passes** ✓ | — |
| `node scripts/secret-scan.cjs` | passes | **passes** ✓ | — |
| `WorkspaceDetail` chunk | ~653 KB | **653 013 B** ✓ | Split lazy tabs → target <400 KB. |
| `index` chunk | ~828 KB | **827 860 B** ✓ | Extract vendor + PDF/chart libs → target <700 KB. |
| `list_ecosystem_items` | hard limit 1000 | **confirmed** (`p_limit int default 1000`) | Replace with cursor pagination + total_count. |

**Truthful note:** the "22 type errors" no longer reproduce — either they were on a stale branch or already fixed. I will not fabricate work to match the brief; instead Phase 0 adds the *tests* that would have caught them, so the class of bug stays fixed.

## 1. Non-negotiable safety rails I will hold

- No `as any`, `as never`, `Record<string, unknown>` payloads, or disabled lint/TS rules.
- All mutation payloads typed with `Database['public']['Tables'][T]['Insert' | 'Update']` + explicit field pickers.
- No RLS widening. New writes go through `SECURITY DEFINER` RPCs with explicit role checks.
- Forward-only migrations. Every `CREATE TABLE` in `public` ships GRANTs in the same file.
- Preserve: direct `functions.invoke` on public/tokenized pages, contract draft recovery, template autosave, FounderDashboard progressive disclosure, per-user advanced pref, OneThingToday, FounderHelpNudge, programme-type branching, PT-PT parity, both incubation (stages/playbooks) and acceleration (weeks/gates) modes.
- Zero feature removal without explicit approval.

## 2. Execution batches (each ends with green baseline before next starts)

### Batch A — Release gate (Phase 0)
- Add 8 i18n keys with real PT-PT and EN copy (no `defaultValue` fallbacks).
- Remove all 14 stale `eslint-disable` directives.
- Add typed-mutation tests (`src/test/mutation-payloads.test.ts`) that stub `supabase.from(...).insert/update` and assert payload keys against `Database[...]['Insert' | 'Update']` for: contracts, CRM bulk actions, calendar, email sync, actions, milestones, surveys, templates, playbooks, time tracking, work queue, alerts, imports.
- Add lint rule / test that fails if `playbook.items`, `timeEntry.workspace`, `workQueueItem.workspace` appear in an insert/update payload.
- Gate: `lint`, `tsgo`, `vitest`, `build`, `i18n-lint`, `i18n-check`, `secret-scan` all green.

### Batch B — Transactional integrity (Phase 1)
- Migration `staff_convert_funnel_item_to_startup(funnel_item_id, program_id, stage)`: `SECURITY DEFINER`, `is_staff()` guard, `SELECT ... FOR UPDATE` on the funnel row, idempotency (returns existing workspace if `linked_workspace_id` set), creates startup + workspace + workspace_users + optional contract stub + `funnel_events` row, stamps `workspaces.created_by = auth.uid()`. Rewrites `useConvertToStartup` to call the RPC only.
- Migration `create_startup_application` (patch): stamp `workspaces.created_by = auth.uid()`.
- Migration `staff_smart_import_workspace(payload jsonb)`: staff-only, transactional startup + workspace + imported children. No client-side multi-step.
- Revoke direct `INSERT` on `startups` / `workspaces` from `consultor` where present; keep admin + `service_role`.
- SQL tests `supabase/tests/rpc_convert_and_import.test.sql`: admin OK, consultor OK where allowed / denied where not, founder denied, mentor denied, anon denied, duplicate conversion returns same IDs, mid-op failure leaves zero rows.

### Batch C — Programme truth (Phase 2)
- Fix `usePlaybooks` payload columns (drop relation-only fields).
- Migration `publish_program_version(program_id, payload jsonb)`: transactional weeks + gates + deliverables clone; failure leaves the currently-active version byte-identical. Edge function becomes a thin authenticator that calls the RPC.
- Integration tests: create, republish success, republish rollback, mode switch (incubation ↔ acceleration), duplicate week rejection, orphan gate rejection, concurrent publish returns typed conflict.
- `docs/adr/0001-program-vs-cohort.md`: programme = blueprint; cohort = dated delivery. No schema migration this cycle; UI copy stays honest ("Programa"), a follow-up ticket carries the cohort model with feature flag.

### Batch D — Ecosystem truth (Phase 3)
- Migration `list_ecosystem_items_v2(filters jsonb, cursor timestamptz, page_size int default 50)` returning `{ rows, next_cursor, total_count }`. Adds real joins for building, incubation_type, category, tags, needs_attention, owner (applies to both workspaces and leads). Health filter explicitly excludes leads (documented in RPC comment).
- Client `useEcosystemItems` switched to cursor pagination + `useInfiniteQuery`; filter UI wired end-to-end; deterministic sort `(last_activity_at desc, id desc)`; empty / error / retry states.
- Tests: 1500-row fixture proves >1000 accessible; combined-filter cases; RLS visibility for founder/mentor/consultor/admin; boundary pages.

### Batch E — Mentor impact truth (Phase 4)
- `QuickNoteDialog`: **remove** auto `time_entries` insert. Add explicit "Registar tempo (opcional)" checkbox + hours field on the same dialog.
- Migration `get_mentor_impact(mentor_id uuid, from date, to date)`: attended/delivered sessions from `session_participants`, distinct startups, explicit logged hours from `time_entries`, open follow-ups from `action_items` where `owner_user_id = mentor_id`, feedback averages joined only to sessions the mentor attended (prevents cross-attribution).
- `MentorImpactDashboard` reads solely from the RPC. Monthly target moves to a `profiles.mentor_monthly_target_hours` column (default 20, editable).
- Tests: role isolation (mentor A can't see mentor B's numbers), double-count guard, empty months.

### Batch F — Founder analytics + autosave regression (Phase 5)
- `FounderHelpNudge` imports `track` from `@/lib/analytics`. Delete `analytics:event` dispatcher + listener.
- Whitelist events: `founder_help_nudge_shown/action/dismissed`, `one_thing_today_shown/clicked/completed`. No PII in payloads.
- Verify every `OneThingToday` deep link hits the right tab + highlighted entity (add data-testid + Playwright).
- Regression tests for `useContractDraftAutosave` + `useTemplateDraftAutosave`: tab switch, visibility change, refresh, network failure (mocked), duplicate-save race.

### Batch G — UX + performance (Phase 6)
- Route-level `lazyWithRetry` on `WorkspaceDetail` tabs (`SessionsTab`, `CalendarTab`, `KpisTab`, `DocumentsTab`, `ProgressReportView`, `MilestonesActionsTab`). Extract `pdfRenderer`, chart libs, `@react-pdf` to their own async chunks.
- Mobile bottom nav responsive fix at 320/360/375/430 px with `env(safe-area-inset-bottom)`.
- Audit sheets/drawers for keyboard scroll + sticky actions + focus restore (shared primitive `<ScrollableDialogBody>`).
- `prefers-reduced-motion`, contrast, 44 px targets, focus order, 200 % zoom checks.
- Bundle target: `WorkspaceDetail` < 400 KB, `index` < 700 KB. Report before/after.
- Rename any "Offline" copy to "Rascunho protegido / Resistência à ligação" — never "full offline".

### Batch H — Final regression
- Frozen `bun install`, `lint`, `tsgo`, `build`, `vitest`, `i18n-lint`, `i18n-check`, `secret-scan`.
- Playwright headless: founder / consultant / mentor / admin / backoffice at 1280×1800 and 390×844. Console + network capture per persona.
- SQL/RLS suite for every new RPC.
- Bundle diff table, no-new-console-errors assertion.
- Final report with role matrix, migrations list, tests added, remaining risks, GO/NO-GO.

## 3. Rollback strategy per migration

- Each migration is a single `CREATE OR REPLACE FUNCTION` or additive DDL; a forward-only revert migration is prepared alongside but not committed unless needed.
- Ecosystem RPC ships as `list_ecosystem_items_v2` beside the existing function; client swap is the only cutover. Reverting = one-line client change.
- Publish-programme RPC keeps the previous edge function code path behind a feature flag `publish_programme_rpc` (default on) for two release cycles.

## 4. What I will NOT do in this cycle (and why)

- No cohort table migration — brief says avoid risky migration unless clearly required. Delivered as ADR only.
- No blanket auth wrapper on public contract/booking pages — explicitly protected by brief.
- No "full offline" claim, no PWA install prompts — brief forbids.
- No feature/route removal — brief forbids without approval.

## 5. Estimated surface

- ~5 new migrations, ~4 SQL test files, ~35–45 files touched, ~15 new/updated unit tests, ~6 Playwright specs. Realistically 4–6 agent turns per batch, 8 batches.

---

**Approve to switch to Agent Mode and execute Batch A → H in order, verifying the release gate at the end of each batch before proceeding.**
