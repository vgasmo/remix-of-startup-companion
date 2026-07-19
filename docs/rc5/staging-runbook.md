# RC5 Staging Runbook

**Audience:** release lead executing verification on a staging clone.
**Prerequisites:** a staging Supabase project that is **not** the production project ID (`apxzuslwhjujgrcsfzqw`). Scripts refuse to run against production.

## 0. Required secrets

Configure these via the platform secret manager (Lovable Cloud → Secrets or your CI vault). **Never paste values in chat, source files, or `.env` committed to git.**

| Env var | Purpose |
|---|---|
| `STAGING_SUPABASE_URL` | Staging project URL. |
| `STAGING_SUPABASE_ANON_KEY` | Anon key for public/founder personas. |
| `STAGING_SUPABASE_SERVICE_ROLE_KEY` | Service-role key for seed/cleanup only. Never logged. |
| `STAGING_APP_URL` | Base URL used by Playwright (`/book`, `/admin`, etc.). |
| `RC5_TEST_FOUNDER_EMAIL` / `_PASSWORD` | Seeded founder persona. |
| `RC5_TEST_CONSULTANT_EMAIL` / `_PASSWORD` | Seeded consultant persona. |
| `RC5_TEST_MENTOR_EMAIL` / `_PASSWORD` | Seeded mentor persona. |
| `RC5_TEST_ADMIN_EMAIL` / `_PASSWORD` | Seeded admin persona. |
| `RC5_TEST_BACKOFFICE_EMAIL` / `_PASSWORD` | Seeded backoffice persona. |
| `STAGING_GRAPH_TENANT_ID` / `_CLIENT_ID` / `_CLIENT_SECRET` | MS Graph app registration for staging tenant. |
| `STAGING_GRAPH_TEST_CALENDAR_UPN` | Dedicated calendar UPN — must not be a real user. |
| `STAGING_EMAIL_SANDBOX_API_KEY` | Sandbox email provider key (Mailtrap / Resend test). |
| `STAGING_CRON_SECRET` | `x-cron-secret` for scheduled edge functions. |
| `RC5_ALLOW_STAGING_TESTS` | Must be literally `true`; explicit opt-in guard. |

## 1. Preflight guards

```bash
export RC5_ALLOW_STAGING_TESTS=true
node scripts/rc5/preflight.mjs
```

Preflight refuses to continue if:

- `STAGING_SUPABASE_URL` resolves to the production project ref;
- `RC5_ALLOW_STAGING_TESTS` is not exactly `true`;
- any required env var is missing;
- the DB already contains rows outside the `rc5-e2e-` namespace touched by the seed.

## 2. Migration verification

**Path A — fresh replay** (disposable Postgres):

```bash
node scripts/rc5/migrate-fresh.mjs
```

Boots an ephemeral Postgres via `docker run --rm postgres:15`, applies every file under `supabase/migrations/` in timestamp order, then runs `supabase/tests/rls_policies.test.sql` via `pg_prove`. Prints a summary and exits non-zero on the first failure.

**Path B — forward apply** (staging clone):

```bash
node scripts/rc5/migrate-forward.mjs
```

Captures preflight counts (see `docs/rc5/queries/preflight-counts.sql`), applies only the new migrations, captures postflight counts, and diffs. Non-zero on unexpected row-count deltas outside the `rc5-e2e-` namespace.

## 3. Deterministic seed

```bash
node scripts/rc5/seed.mjs
```

Idempotent. All rows carry the `rc5-e2e-` prefix in their business identifiers (workspace names, emails, contract numbers, funnel-item titles). Re-running is a no-op.

## 4. Role-matrix pgTAP

```bash
psql "$STAGING_DB_URL" -f supabase/tests/rls_policies.test.sql
```

Covers anonymous / founder-in-workspace / founder-out-of-workspace / consultant / mentor / admin / service-role for: transcripts, workspace membership, invitations, booking links, contracts, cohort data, mentor assignments, CRM funnel, notification ledger, transcript containment audit.

Both permitted and forbidden access is asserted. Zero-row selects on RLS-forbidden queries are treated as evidence **only** when the same query returns rows under `set_config('request.jwt.claims', …)` for a permitted role.

## 5. Seeded Playwright E2E

```bash
bun run test:e2e -- --project=staging
```

Runs the persona specs against `STAGING_APP_URL` at four viewports: 320×568, 390×844, tablet (768×1024), desktop (1280×800). Failure-injection specs (Graph 401 / 429 / 500 / timeout, email rejection, DB failure after provider ack) live in `e2e/failure-injection/`.

## 6. External service failure tests

`e2e/failure-injection/` uses Playwright's `route.fulfill` to inject provider errors at the network boundary and asserts:

- UI banner is truthful (`disponibilidade não pode ser confirmada`);
- retry after ambiguous Graph result creates **exactly one** DB booking and **exactly one** calendar event (idempotency key + ledger);
- duplicate commercial-proposal submission returns `skipped_duplicate`;
- concurrent invitation acceptance produces one membership row.

## 7. Cleanup

```bash
node scripts/rc5/cleanup.mjs
```

Deletes only rows whose business identifier starts with `rc5-e2e-`. Refuses to run if any deletion would touch a row outside that namespace (verified with `SELECT count(*) … WHERE key NOT LIKE 'rc5-e2e-%' FOR UPDATE`).

## 8. Canonical verification command

```bash
RC5_ALLOW_STAGING_TESTS=true bun run rc5:verify
```

Runs, in order and short-circuiting on the first failure: preflight → migrate-forward → seed → pgTAP → vitest ×3 → e2e → failure-injection → cleanup. Writes machine-readable results to `docs/rc5/results.json` and a human report to `docs/rc5/results.md`. Non-zero exit on any failure.
