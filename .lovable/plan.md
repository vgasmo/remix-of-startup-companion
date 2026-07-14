# Release Remediation Plan

This is a large, multi-day release-engineering effort against a **live** application. Before I start editing code, I need to align on scope and sequencing, because several items in the brief conflict with existing product memory and cannot all be done safely in a single pass.

## Reality check vs. the brief

A few items need explicit confirmation before I touch code:

1. **Scope size.** Batches 1–3 span ~17 numbered workstreams, new migrations, new RLS, new RPCs, importer rewrite, 18 TS errors, 8 failing tests, 12 i18n keys, dep audit, and a full acceptance-test matrix (fresh DB replay, canary, rollback, 5-role smoke tests). Realistically this is multiple focused sessions, not one. I'd like to land it as a sequence of reviewable migrations + PR-sized changes rather than one mega-change that is impossible to review or roll back.

2. **"Replay every migration on a fresh local Supabase database."** The sandbox here does not run a local Supabase stack — it only has managed psql access to the live project (select/insert only; schema changes go through the `supabase--migration` approval flow). I can't spin up a throwaway Postgres and replay the full migration history end-to-end from this environment. I can:
   - Lint the migration set (`supabase--linter`).
   - Dry-run new corrective migrations via the approval flow.
   - Run structural checks against the live DB read-only.
   
   A true fresh-DB replay needs to happen in CI or on your machine. I'll produce the exact commands and a checklist; I won't fake a green result.

3. **"bun audit / bun test / bun run build / typecheck / lint / i18n scripts."** Build and typecheck are run automatically by the harness after edits; I will not run them manually. The other scripts (`bun test`, `bun audit`, `node scripts/i18n-*`, `node scripts/secret-scan.cjs`) I will run via exec and paste real output. If a script doesn't exist in the repo, I'll say so instead of inventing results.

4. **Existing product memory constraints.** Several rules in project memory bear directly on this work and I will honor them over the brief where they conflict:
   - Contract immutability + `startup_contracts` as source of truth.
   - CRM Contract Decoupling and Contract Lead Identity Mapping (workspace_id nullable on contracts for pre-onboarding leads).
   - Workspace data isolation, PII masking via `profiles_safe`, integration credential RLS.
   - Zero hardcoded strings, PT/EN parity.
   
   None of these appear to conflict with the brief, but I'll flag it if I hit one.

5. **"Never claim GO based only on a successful Vite build."** Agreed. My final verdict will be **NO-GO** unless the full acceptance matrix (including fresh-DB replay + canary that I can't run from here) has been executed. I expect to hand you a **NO-GO with an exact blocker list** at the end of my work, plus everything you need to close those blockers in CI / on your machine.

## Proposed execution order

I want to do this in the order below, because later batches depend on earlier fixes being stable. Each numbered step lands as its own commit / migration so it is individually reviewable and revertible.

### Phase 0 — Freeze and inventory (read-only)
- Confirm `hubspot_importer_v2` flag is OFF and legacy import mutations are gated.
- Inventory current importer surface: `commit-crm-import` edge function, `admin_commit_crm_import_job` RPC, `data_import_jobs`, `data_import_rows`, `external_entity_refs`, related hooks and UI (Admin > Import).
- Inventory current RLS on `data_import_jobs`, `data_import_rows`, `external_entity_refs`.
- Snapshot counts: rows in `funnel_items` by stage/type, `external_entity_refs` by source, existing `data_import_jobs`.
- Read the failing tests and TS errors to get exact file list.
- **Output:** short written inventory in chat, no code changes.

### Phase 1 — Release-gate hygiene (Batch 3, items 13–17)
Do these first because they're independent, small, and unblock CI:
- **13.** Fix conditional `useMemo` in `GuidedPlanTab` (hoist to top-level, guard inside).
- **14.** Fix 18 TS errors properly (no `any` / `ts-ignore`).
- **15.** Fix 8 failing tests at the root cause; add importer regression tests as a placeholder file with `.skip` until Phase 2 code lands, then flip them on.
- **16.** Add the 12 missing EN/PT keys reported by `i18n-lint`.
- **17.** Remove tracked `.env` files (keep `.env.example`), fix secret-scan repo-root resolution, run `bun audit` and address only clearly-safe high-severity prod findings (no forced breaking upgrades).

### Phase 2 — CRM importer repair (Batch 1, items 1–10)
Land as a single feature branch composed of small commits:
- **1 + 10.** New RPC `public.commit_crm_import_job_v2(job_id, mode)` = single canonical transactional commit path. `commit-crm-import` edge function becomes a thin auth wrapper that delegates. `admin_commit_crm_import_job` is deprecated (kept as a shim that calls v2 to avoid breaking any live callers, but marked deprecated and logs a warning).
- **2.** Canonical enums: introduce `crm_type` (`lead|contract|startup_candidate|startup_active`) and reuse the shared funnel-stage model. Reject `customer` / `startup`. Preserve explicit row values.
- **3.** New parser module `supabase/functions/_shared/spreadsheetParser.ts` with header auto-detect (score across first 25 rows), title/blank tolerance, shared-strings + rich-text handling, CSV delimiter sniff, accent-insensitive normalization, original source-row-number preservation.
- **4.** Alias map covering all PHC + classified headers listed in the brief; accent-insensitive matching, original display value preserved.
- **5.** Server-side persisted mapping on `data_import_jobs.column_mapping_json`; re-run prepare/reconciliation whenever it changes. Remove UI controls that don't persist.
- **6.** Real per-row review UI: approve / reject / remap / pick target, before-after diff, match reason. Auto-approval limited to deterministic matches only.
- **7.** Deterministic matching cascade with strict uniqueness checks (`count(*) = 1`, never `LIMIT 1`).
- **8.** External-ref conflict detection: reject reassignment; `ON CONFLICT` restricted to timestamp/metadata when target is unchanged.
- **9.** Idempotency: `file_sha256` + per-row `normalized_row_hash`, unique constraint, stale-write guard via `updated_at`/`version`, transactional row commit, audit rows written before mutation.
- **10.** In PHC CRM-only mode: hard-code no workspace/contract/user/membership/task/automation/notification writes. Assert this in the RPC and in tests.

### Phase 3 — Production data protection (Batch 2, items 11–12)
- **11.** Corrective additive RLS migration (new policies, no drops of existing product policies):
  - `data_import_jobs`, `data_import_rows`: admin/backoffice only.
  - `external_entity_refs`: admin/backoffice + tightly scoped staff read for their assigned workspaces.
  - Founders/mentors: no access to PHC/HubSpot IDs. Where such IDs surface in views, mask via existing `profiles_safe` pattern.
  - Positive + negative RLS tests per role in `supabase/tests/rls/`.
- **12.** New `identity_conflicts_audit` table capturing every duplicate + all candidate records. Verification query for whatever the old destructive dedupe already cleared, output preserved as a downloadable CSV in `/mnt/documents/`. No further destructive correction until you review.

### Phase 4 — Acceptance testing (what I can run here)
- `bun install --frozen-lockfile`
- `bun test` (with new importer regression tests enabled)
- `node scripts/i18n-check.cjs`, `node scripts/i18n-lint.mjs`, `node scripts/secret-scan.cjs`
- `bun audit`
- Importer unit tests against fixture PHC workbook (header row 6, title/blank rows) and classified CSV. Assert expected dry-run counts (202/187/15/191/11).
- Second identical dry run: assert 0 inserts / 0 duplicates.
- `supabase--linter` after each migration.
- Typecheck + build (auto-run by harness).

### Phase 5 — What must happen outside this sandbox (blockers for GO)
I will spell these out explicitly in the final report:
- Fresh local Supabase migration replay.
- 10-row canary against production with rollback evidence.
- Authenticated smoke tests for the 5 roles + public intake + booking (I can script Playwright for a subset via the localhost preview, but production canary is yours).
- Enabling `hubspot_importer_v2` and unlocking legacy import mutations after all gates pass.

## Technical details

- **New migrations (additive only):** `crm_import_canonical_enums`, `data_import_jobs_hashes_and_mapping`, `external_entity_refs_conflict_guards`, `commit_crm_import_job_v2_rpc`, `import_rls_hardening`, `identity_conflicts_audit`.
- **New edge function behavior:** `commit-crm-import` = auth + delegate to `commit_crm_import_job_v2`. No payload logic.
- **Deprecations:** `admin_commit_crm_import_job` becomes a shim; slated for removal after one release with zero call-site hits (logged).
- **Feature flag:** `hubspot_importer_v2` stays OFF; legacy import mutation guards added at the RPC layer (double gate).
- **Tests:** `src/__tests__/importer/*` unit tests for parser + matcher + commit RPC via `pgtap`-style SQL fixtures.
- **i18n:** add the 12 missing keys under existing namespaces; no new namespaces.

## What I need from you before I start executing

1. **Confirm the phased approach** — Phase 1 (release-gate hygiene) first, then Phase 2 importer, then Phase 3 RLS/audit. If you want the importer first, say so and I'll reorder.
2. **Confirm the sandbox limitation** on fresh-DB replay and 5-role production smoke tests — I will produce commands + evidence for what I *can* run here, and a runbook for the rest. Final verdict from me will be **NO-GO** with those items listed as blockers unless you tell me they've been executed elsewhere.
3. **Point me at the PHC workbook + classified CSV fixtures.** The brief cites exact expected counts (202/187/15/191/11) — I need the actual files (or representative fixtures with the same shape) checked into `test/fixtures/` or uploaded, otherwise I can only test structural correctness, not those specific numbers.
4. **Confirm zero-behavior-change tolerance on `admin_commit_crm_import_job`.** I want to keep it as a thin shim for one release rather than delete it — safer for anything already calling it. OK?

Once you approve (or adjust) the plan and drop the fixtures, I'll start executing Phase 0 → Phase 4 in this session and hand you a Phase 5 runbook + honest GO/NO-GO at the end.
