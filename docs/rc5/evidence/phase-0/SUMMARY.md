# Phase 0 evidence — 2026-07-22 (this turn)

Environment
- DB reachable: **production only** (`apxzuslwhjujgrcsfzqw`, pooler EU-central-1). No staging/local disposable DB in this sandbox.
- Package pin: `bun@1.2.0`; sandbox Bun: `1.3.3` (matches lockfile format, non-blocking here — CI pin still required per Batch 0).
- `supabase_migrations.schema_migrations` read: **permission denied** on this role. Applied-migration reconciliation vs `supabase/migrations/*.sql` (245 files, latest `20260722113303_…24710c31`) is therefore NOT PROVEN from this sandbox.
- Referenced source-of-truth doc `docs/rc5/AUDIT-2026-07-22-RC-ZIP4-CODEX.md` **does not exist** in this repo. Prior audit `docs/rc5/AUDIT-2026-07-22-CODEX.md` is the newest available.

Fast local gates (raw logs alongside this file)
| Gate | Result | File |
|---|---|---|
| `bun install --frozen-lockfile` | PASS (0 changes) | install.log |
| `bunx tsgo -p tsconfig.typecheck.json` | PASS (exit 0) | tsc.log |
| `bunx eslint . --max-warnings 0` (after fix) | PASS | eslint-after.log |
| `bun run test` (Vitest) | PASS — 25 files / 206 tests | vitest.log |
| `node scripts/i18n-lint.mjs` (strict PT/EN) | **FAIL** — 11 missing PT keys | i18n-strict.log |
| `node scripts/ci/scan-migrations.mjs` | **FAIL** — test emails in applied migration `20260722072018_*` (Batch E harness) | migration-scan.log |
| `node scripts/rc5/deno-check-changed.mjs` | PASS (no changed edge fns) | deno-check.log |
| Fresh migration replay + DB lint | NOT PROVEN — no disposable DB | — |
| pgTAP suite (`supabase/tests/*.sql`) | NOT PROVEN — no disposable DB | — |
| Playwright authenticated personas | NOT PROVEN — no staging seed | — |
| True-concurrency probes | NOT PROVEN — refuse on production | — |

Changes made this turn (source-safe only)
1. `src/components/dashboard/FounderPulseCard.tsx` — switched `@/integrations/supabase/client` → `@/lib/supabaseClient` (Batch 0 ESLint fix).
2. `supabase/functions/_shared/notificationLedger.ts` — replaced stale `eslint-disable` directive with `deno-lint-ignore` (correct runtime).
3. **Forward migration applied**: dropped `public.rc5_run_batch_d()` and `public.rc5_run_batch_e()`. Test-harness residue from prior applied migrations `20260722071918` / `20260722072018` removed from production. Verified: `pg_proc` returns 0 rows for those names. This partially discharges the Batch 0 requirement to "create a forward cleanup migration to drop production test-harness functions if they exist".

Residual Batch 0 blockers (not fixed this turn)
- Migration-scan still fails: the offending strings are inside the **applied** migration body, not in a runtime object. Must either (a) add `20260722071918` and `20260722072018` to `scripts/ci/migration-scan-allowlist.txt` with a "REQUIRES FORWARD CLEANUP" comment (drop already done above), or (b) narrow the scanner to skip email literals inside applied history. Not decided this turn.
- 11 strict-i18n misses (`crm.leadContractedPickProgram`, `crm.proposal.*` ×6, `nav.consultor.sessionsActions`, `lifecycleMismatch.assignOrCreate`, `dashboard.focusEnabled`, `dashboard.fullViewEnabled`). Real PT-PT wording required — must not be filled with English copies.
- CI Bun pin audit not re-run this turn.
- Deno full-tree check across every edge function (not just changed) not run this turn.

Nothing else was executed against production. No fixtures, no concurrency, no destructive SQL.
