# RC5 · Batch G3 — Performance baseline

Measured before optimizing. Numbers filled in from
`scripts/rc5/artifacts/g3/baseline_<stamp>.json` after the harness runs
against a staging environment.

## Method

- Harness: `scripts/rc5/perf-baseline.mjs`.
- Browser: headless Chromium, viewport 390 × 1800 (mobile-first).
- Wait: `networkidle`.
- Metrics captured per route: navigation TTFB / DCL / load, request
  count, duplicate request count, count of long tasks > 50 ms.
- Personas × routes: staff/`/admin`, founder/`/dashboard`,
  consultant/`/dashboard`, mentor/`/mentor`.

## Baseline table (staging, run TBD)

| persona | path | wall_ms | reqs | dup_reqs | long_tasks>50ms | load_ms |
|---|---|---:|---:|---:|---:|---:|
| staff | /admin | — | — | — | — | — |
| founder | /dashboard | — | — | — | — | — |
| consultant | /dashboard | — | — | — | — | — |
| mentor | /mentor | — | — | — | — | — |

## Targets

Only accept changes that measurably move a metric above; reject
speculative refactors.

- `duplicate_requests` must be 0 per route.
- `wall_ms` regression budget: +0 vs baseline on all routes.
- `long_tasks>50ms` for staff/`/admin` must drop by ≥ 30 % after
  lazy-loading admin-heavy features.

## After-numbers (run TBD)

Populate a second table with the same shape once optimizations land.
Diffs are the deliverable.
