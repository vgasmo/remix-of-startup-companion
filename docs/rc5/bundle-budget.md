# RC5 — Bundle Budget

**Initial JS budget:** 900 KB (gzip, first-load of `/`).

## Rationale

Historical baseline: ~1.4 MB initial JS with pdf/chart/import all in the main
chunk. Target reduction to 900 KB unlocks TTI < 3.5s on mid-range 4G.

## Lazy-loaded routes / modules (target)

- `pdf`, `pdf-lib`, `@react-pdf/renderer` — only via `/**/*.pdf.ts` dynamic imports
- `recharts` — chart pages only
- CSV/Excel importers (`papaparse`, `xlsx`) — admin data-import routes only
- Persona-only surfaces:
  - `/mentors/*` → mentor persona only
  - `/admin/*` → admin persona only
  - `/backoffice/*` → backoffice persona only
- Long-tail dialogs: `SendProposalDialog`, `ContractDetailDrawer`, financial
  scenario editor

## How to profile

```bash
bun run build -- --mode production
bunx vite-bundle-visualizer  # or: bunx source-map-explorer dist/assets/*.js
```

Fail the release if the primary entry chunk exceeds 900 KB gzip. Track by
committing the visualizer HTML to `docs/rc5/bundle-report.html` on each RC.

## Status

**Enforced via `size-limit`** — config at `.size-limit.json`, wired into
`.github/workflows/ci.yml` (`bunx size-limit` step after build). CI fails
when initial JS exceeds 900 KB gzip or CSS exceeds 120 KB gzip. Run
`bun run size` locally after `bun run build` to check.

Lazy-loading is enforced at the route level in `src/App.tsx` via
`lazyWithRetry` — heavy recharts-using pages (Analytics, KPIs, Funding,
Backoffice) are already isolated in their route chunks. `pdf-lib`,
`@react-pdf/renderer`, `papaparse`, and `xlsx` are **not** current
dependencies; if reintroduced, gate them behind dynamic `import()` and
re-run `bun run size`.
