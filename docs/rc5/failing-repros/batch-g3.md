# Batch G3 — Measured Performance (FAILING REPRO)

Rule: measure before optimizing. No speculative rewrites.

## Metrics to capture

- Authenticated route load (staff dashboard, founder home, consultant
  cockpit, mentor gallery).
- Query count per route.
- Duplicate requests within one navigation.
- N+1 patterns (list → per-row fetch).
- Long tasks > 50 ms.
- Mobile Web Vitals (LCP, INP, CLS) at 390 width, throttled 4G.
- Bundle/chunk use per persona.

## Deliverable

`docs/rc5/performance-baseline.md` with before-numbers, then targeted
changes:

- Parallelize confirmed-independent queries.
- Remove confirmed N+1 requests.
- Lazy-load persona-only/admin-heavy features.
- Record after-numbers.

## Next action

Playwright + Chrome perf trace harness under `scripts/rc5/perf/`.
