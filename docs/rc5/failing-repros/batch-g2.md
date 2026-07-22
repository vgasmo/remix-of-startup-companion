# Batch G2 — UX / A11y / Clickability (FAILING REPRO)

Personas: founder, consultant, mentor, staff.
Widths: 320, 390, 768, 1440.

## Defects (evidence-backed only)

1. Some genuinely navigable cards are still `div` + `onClick`; must
   move to `ClickableCard` / semantic `<a>` / `<button>`.
2. Focus rings missing on custom cards.
3. Mobile touch targets < 44 px in several toolbars.
4. Ambiguous cards lack explicit CTA labels.
5. Dialogs/drawers overflow viewport at 320/390 with no inner scroll
   or sticky action row.
6. Unsaved state lost on dialog close.
7. Founder home lacks a dominant "One Thing Today".
8. No universal "Feeling stuck?" access to AI/search/consultant book.
9. Empty/loading/error/retry states inconsistent.

## Non-goals

Do NOT make decorative cards clickable. Do NOT remove existing
functionality.

## Next action

Playwright script `scripts/rc5/persona-widths.mjs` capturing 4 personas
× 4 widths screenshots, followed by targeted diffs per finding.
