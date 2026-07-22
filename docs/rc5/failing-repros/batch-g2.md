# Batch G2 — source landed 2026-07-22

- `scripts/rc5/persona-widths.mjs` — Playwright harness that captures
  4 personas × 4 widths (320 / 390 / 768 / 1440) screenshots into
  `scripts/rc5/artifacts/g2/`. Refuses production hosts by default.

Not landed this turn (evidence-first policy; require harness screenshots
from staging before we ship UI changes):
- `div + onClick → ClickableCard` sweep.
- Focus ring audit.
- Touch-target ≥ 44 px sweep.
- CTA label audit on ambiguous cards.
- Dialog/drawer inner scroll + sticky action row at 320/390.
- Dialog "confirm before close" for unsaved state.
- Founder "One Thing Today" surface.
- Universal "Feeling stuck?" access.
- Empty/loading/error/retry state consistency.

Runtime proof gate: harness screenshots + human review — `NOT PROVEN`.
