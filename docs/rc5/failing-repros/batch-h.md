# Batch H — Release Engineering (FIXED IN SOURCE / RUNTIME NOT PROVEN)

## Status: source-safe closure applied 2026-07-22

## Gates

- [x] CI pinned to `packageManager` Bun version. All `setup-bun@v2`
      steps in `.github/workflows/*.yml` now use `bun-version: 1.2.0`
      (matches `packageManager: bun@1.2.0` in `package.json`).
- [x] Deno check on every changed edge function. New
      `scripts/rc5/deno-check-changed.mjs` diffs against
      `origin/main` merge-base, runs `deno check` per changed
      `supabase/functions/**/index.ts`. Wired into
      `scripts/rc5/verify.mjs` (local gate `deno:check-changed`) and
      a dedicated `deno-check-edge` CI job using
      `denoland/setup-deno@v2`.
- [ ] Zero ESLint errors — inherits existing `bun run lint` gate;
      current status: warnings only, no errors.
- [ ] Zero strict i18n findings — `i18n:parity` + `i18n:lint` gates
      enforced; 5 previously-documented PT/EN gaps require content
      review (owner: content team).
- [x] Zero unapproved migration-scan findings — `migration-scan` CI
      gate + `scripts/ci/scan-migrations.mjs` unchanged and green.
- [x] Test harness functions removed / dropped via forward cleanup —
      drafts in `docs/rc5/drafts/` never registered as numbered
      migrations.
- [x] Fixtures never live in numbered production migrations — Batch
      A/B/C/D/E/F pgTAP suites live under `supabase/tests/`.
- [x] All canonical tests wired into `rc5:verify` and CI — local
      gates run typecheck, lint, build, vitest x3, i18n parity,
      i18n lint, secret scan, deno-check-changed; staging gates
      remain behind `RC5_ALLOW_STAGING_TESTS=true`.
- [x] Single truthful evidence ledger — `docs/rc5/release-rescue-plan.md`
      is canonical; contradictory earlier RC5 notes remain marked
      SUPERSEDED.

## Runtime proof outstanding

- CI must complete a green run on `main` after this change to prove
  the pinned Bun version resolves and the new `deno-check-edge` job
  passes on a change that touches `supabase/functions/`.
- Content-owned i18n gaps require translation work; not a code
  change.

## Files touched (source-safe)

- `.github/workflows/ci.yml` — pinned bun, added `deno-check-edge`
  job.
- `.github/workflows/i18n-sync-pr.yml` — pinned bun.
- `.github/workflows/lockfile-sync-pr.yml` — pinned bun.
- `scripts/rc5/deno-check-changed.mjs` — new script.
- `scripts/rc5/verify.mjs` — wired `deno:check-changed` local gate.
