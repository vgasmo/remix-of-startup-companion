# Batch G3 — source landed 2026-07-22

- `scripts/rc5/perf-baseline.mjs` — Playwright + Navigation Timing +
  long-task harness. Emits `baseline_<stamp>.json` under
  `scripts/rc5/artifacts/g3/`. Refuses production hosts by default.
- `docs/rc5/performance-baseline.md` — baseline scaffold with method,
  metric table, targets, and after-numbers slot.

Rule: numbers are measured, not asserted. No optimization ships until
the baseline row exists AND the after-row shows a measurable win on
the same route + metric.

Runtime proof gate: staging harness run — `NOT PROVEN`.
