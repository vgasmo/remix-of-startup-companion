# RC5 harness integrity audit — 2026-07-19

## What `bun run rc5:verify` executes (command tree)

`package.json` → `bash scripts/rc5/verify.sh` → `exec node scripts/rc5/verify.mjs`.
`verify.mjs` is the cross-platform orchestrator. It **resets** `docs/rc5/results.json` and `results.md` at start, records `git rev-parse HEAD`, git branch, redacted staging project ref, per-step exit codes, and refuses any URL containing the production project ref `apxzuslwhjujgrcsfzqw` or hosts `leiria-launchpad-pro.lovable.app` / `startupleiria.com`.

Steps (in order — each step's non-zero exit aborts the run and marks `overall: "fail"`):

| # | Step | Command | Kind |
|---|---|---|---|
| 1 | install | `bun install --frozen-lockfile` | local |
| 2 | typecheck | `bunx tsgo -p tsconfig.typecheck.json --noEmit` | local |
| 3 | lint | `bun run lint` | local |
| 4 | build | `bun run build` | local |
| 5 | vitest:run:1 | `bunx vitest run` | local |
| 6 | vitest:run:2 | `bunx vitest run` | local |
| 7 | vitest:run:3 | `bunx vitest run` | local |
| 8 | i18n:parity | `node scripts/i18n-check.cjs` | local |
| 9 | i18n:lint | `node scripts/i18n-lint.mjs` | local |
| 10 | secret:scan | `node scripts/secret-scan.cjs` | local |
| — | **staging gate** | if `RC5_ALLOW_STAGING_TESTS !== 'true'` ⇒ **overall fail**, exit 1 | guard |
| 11 | preflight | `node scripts/rc5/preflight.mjs` | staging |
| 12 | migrate:fresh-replay | `node scripts/rc5/migrate-fresh-replay.mjs` (psql, disposable DB) | staging |
| 13 | migrate:forward | `node scripts/rc5/migrate-forward.mjs` (`supabase db push`) | staging |
| 14 | seed | `node scripts/rc5/seed.mjs` (namespace `rc5-e2e-`) | staging |
| 15 | pgtap:rls | `node scripts/rc5/run-pgtap.mjs` → `pg_prove --dbname $STAGING_DATABASE_URL --ext .sql supabase/tests/rls_policies.test.sql` | staging |
| 16 | e2e:personas | `bunx playwright test --project=staging-personas` (+ `staging-personas-mobile` covers 390 px anon booking) | staging |
| 17 | e2e:failure-inj | `bunx playwright test --project=failure-injection` | staging |
| 18 | probe:graph | `node scripts/rc5/probe-graph.mjs` (client_credentials against sandbox tenant) | staging |
| 19 | probe:email | `node scripts/rc5/probe-email.mjs` (sandbox send) | staging |
| 20 | cleanup | `node scripts/rc5/cleanup.mjs` (deletes only `rc5-e2e-%` rows) | staging |

### Exact pgTAP files executed
- `supabase/tests/rls_policies.test.sql` (39 assertions, including Gate 6 role×tier RLS matrix for `session_transcripts` and transcript containment invariants).

### Exact Playwright files executed
`staging-personas` project (`testMatch` in `playwright.config.ts`):
- `e2e/public-booking.spec.ts` — anonymous / `/book` canonical alias
- `e2e/founder-flow.spec.ts`
- `e2e/founder-autosave.spec.ts`
- `e2e/founder-invite-acceptance.spec.ts`
- `e2e/consultant-flow.spec.ts`
- `e2e/mentor-flow.spec.ts`
- `e2e/mentor-double-booking.spec.ts`
- `e2e/admin-flow.spec.ts`
- `e2e/admin-system-health.spec.ts`
- `e2e/backoffice-flow.spec.ts`
- `e2e/permission-gate.spec.ts`

`staging-personas-mobile` project: `e2e/public-booking.spec.ts` on iPhone 12 viewport.
`failure-injection` project: `e2e/failure-injection.spec.ts`.

## Strictness guarantees

- **Reset**: `results.json` / `results.md` are `rm`ed at start of every run — no stale success can persist.
- **Metadata**: `results.json` now includes `started_at`, `finished_at`, `overall`, `reason`, `source.git_sha`, `source.git_branch`, `target.staging_project_ref_redacted`, `env_mode`, and per-step `exit_code` + `duration_ms`.
- **Non-zero exit** on any of: missing tool (`ENOENT` for `bun`, `psql`, `pg_prove`, `supabase`, `playwright`), missing required env var (via `preflight.mjs`), unset `RC5_ALLOW_STAGING_TESTS`, staging URL matching production ref, any failing step, any pgTAP failure, any Playwright failure, any probe non-2xx.
- **Never silently skips**: prior version exited 0 when staging env was absent. `verify.mjs` now records `staging:gate = fail` and exits 1 instead.
- **Secret hygiene**: staging URL is printed only as a redacted `abcd…xy` fragment; Graph tokens and email API keys are never echoed.
- **Production refusal**: `verify.mjs`, `preflight.mjs`, `migrate-fresh-replay.mjs`, `migrate-forward.mjs`, `seed.mjs`, `run-pgtap.mjs`, and `cleanup.mjs` all refuse the ref `apxzuslwhjujgrcsfzqw`.

## Cross-platform note

`scripts/rc5/verify.sh` is now a thin wrapper that `exec`s the Node orchestrator. The verification works on Linux, macOS, and Windows Git Bash / PowerShell because `verify.mjs` uses `spawnSync` without shell interpolation. Operators without bash can call `node scripts/rc5/verify.mjs` directly.

## Required operator secrets (names only)

Local: none beyond repo checkout. Staging:
`RC5_ALLOW_STAGING_TESTS`, `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `STAGING_SUPABASE_SERVICE_ROLE_KEY`, `STAGING_DATABASE_URL`, `STAGING_APP_URL`, `STAGING_CRON_SECRET`, `RC5_DISPOSABLE_DATABASE_URL`, `RC5_TEST_{FOUNDER,CONSULTANT,MENTOR,ADMIN,BACKOFFICE}_{EMAIL,PASSWORD}`, `RC5_GRAPH_TENANT_ID`, `RC5_GRAPH_CLIENT_ID`, `RC5_GRAPH_CLIENT_SECRET`, `RC5_EMAIL_SANDBOX_API_KEY`, `RC5_EMAIL_SANDBOX_FROM`, `RC5_EMAIL_SANDBOX_TO` (must be `rc5-e2e-…` inbox).

## Remaining placeholders / manual steps

These are **not silently skipped** — each step exits non-zero until the operator supplies the required environment. They are placeholders in the sense that the values live outside the repo, not that the harness fakes success.

1. **`RC5_DISPOSABLE_DATABASE_URL`** — the operator must provision an ephemeral Postgres (Docker `postgres:15` or Neon branch). No hosted fixture is committed.
2. **`STAGING_DATABASE_URL`** — direct DB connection string used by `supabase db push` and `pg_prove`; not derivable from the anon key alone.
3. **`supabase` CLI, `psql`, and `pg_prove` on `PATH`** — the harness detects and fails cleanly if any tool is missing. `pg_prove` (from `TAP::Parser::SourceHandler::pgTAP`) is not in most sandbox images.
4. **Persona users seeded in staging Auth** — the seed script only writes public-schema rows; the five persona identities (`RC5_TEST_*_EMAIL`) must exist in staging `auth.users`. This is intentional (Auth admin API side effects belong to the operator's one-time bootstrap).
5. **`e2e/failure-injection.spec.ts` mentor duplicate-booking assertion** skips when `STAGING_APP_URL` is unset — expected in local runs, always executed under staging because `staging:gate` enforces the variable.
6. **Graph tenant** must be a dedicated non-production tenant. The harness refuses only if `RC5_PROD_GRAPH_TENANT_ID` is set to compare against; operators without that guard rely on the naming discipline.

Any of the above being absent when the orchestrator runs produces `overall: "fail"` in `results.json` — never `pass`.
