# Linear-style System Refresh

Goal: a quieter, sharper product. Less color noise, tighter type, denser-but-calmer tables, consistent empty/loading states, sharper navigation chrome. No business-logic changes. No new dependencies beyond fonts.

## 1. Design tokens (`src/index.css`, `tailwind.config.ts`)

Tighten the existing semantic system — do not rename tokens, just retune values so every screen inherits the change.

- **Neutrals**: shift `--background` / `--card` / `--muted` to cooler, lower-saturation greys (Linear-style `hsl(220 14% …)`). Raise `--border` contrast slightly so 1px lines read on white without grey blocks.
- **Primary**: keep Startup Leiria hue, drop saturation ~8%, brighten `--ring` for crisp focus.
- **Status colors** (`--health-*`, `--priority-*`, destructive, warning): desaturate ~15% so badges stop competing with content. Add matching `-soft` background tokens already referenced by badges.
- **Radii**: `--radius` 0.75rem → 0.5rem (cards, inputs, buttons). Pills stay full.
- **Shadows**: replace heavy `shadow-md/lg` defaults with a layered `--shadow-elegant` (1px hairline + soft ambient). Cards use it on hover only.
- **Typography**: install `@fontsource-variable/inter` + `@fontsource/geist-mono` (mono for numbers/IDs). Set `font-sans` = Inter, tabular-nums on tables. Tighten `tracking-tight` on h1/h2.
- Add utility classes: `.surface`, `.surface-muted`, `.hairline`, `.num` (tabular).

## 2. Global shell

- **AppSidebar**: reduce width 16rem → 14rem; remove section background fills; group labels become 11px uppercase muted; active item = left 2px primary bar + subtle `bg-primary/5` (no full pill); collapsed mini-rail keeps icon + tooltip.
- **TopBar**: 56px → 48px; flatten background to `--background`; single hairline bottom border; search becomes a `⌘K` trigger pill; notification + avatar icons unified at 36px hit area, 16px glyph.
- **Breadcrumbs**: muted, `/` separator, last crumb foreground; hide on mobile.
- **Page headers**: standardize `PageHeader` component (title 20px semibold, optional subtitle 13px muted, right-aligned actions). Apply on top 6 pages.

## 3. Tables & data density (everywhere)

Single shared treatment via lightweight wrapper around shadcn `Table`:

- Row height 44px, header 36px, 13px body / 12px header uppercase tracked.
- Hairline row dividers (`border-border/60`), no zebra. Hover = `bg-muted/40`. Selected = `bg-primary/5` + left primary bar.
- Right-align numeric columns, tabular-nums.
- Sticky header inside scroll container, sticky first column on mobile where useful.
- Standardized empty state (`EmptyState` component: icon + title + 1-line hint + primary action) and skeleton rows.
- Apply to: `WorkspaceTable`, `EcosystemTable`, `PortfolioPerformanceTable`, CRM pipeline list, `TriageWorkspaceList`, `AdminUsersManager`, `AdminStartupsManager`, `AdminWorkspacesManager`, contracts list, intakes list.

## 4. Founder dashboard & workspace detail

- **FounderDashboard / TransitionalFounderDashboard**: collapse stat cards into a single 1-row metric strip (label above number, 24px number, hairline separators — no boxes). Promote "Next action" to a hero card with clear CTA; demote secondary widgets into a two-column grid with consistent card chrome.
- **Workspace detail tabs**: tab bar becomes underline-style (no pill background); badge counts inline; sticky on scroll. Reduce per-tab top padding.
- **MilestonesActionsTab**: list rows over cards; status dot + title + due chip + assignee avatar; group headers as muted labels.
- **Quick actions FAB**: smaller (48px), neutral surface, primary icon only.

## 5. Staff cockpit

- **My Workspaces** (`/my-workspaces`): replace the 4 stat cards with the metric strip; filter chips become a single segmented control + search; table uses the shared treatment.
- **Ecosystem**: same metric strip + table treatment; inline consultor select gets a quieter trigger (text + chevron, no full select chrome).
- **CRM**: pipeline column headers gain count + value in muted mono; cards drop heavy borders, use hairline + hover lift; drawer header gets a tighter identity block.
- **Admin Mission Control**: tighten cards, unify icon size, swap any remaining colored backgrounds for neutral surfaces with colored icons.

## 6. Component-level polish

- `Button`: default height 36 → 32 (sm 28); ghost = no border, hover `bg-muted`; destructive uses desaturated red.
- `Badge`: 11px, 18px height, soft tokens; status badges use dot + label.
- `Card`: default = hairline border, no shadow; `interactive` adds hover shadow + 1px translate.
- `Dialog/Sheet`: tighten header padding, footer uses `DialogFooterActions` everywhere (memory rule).
- Icon-only buttons standardize at 32px with 16px glyph.

## 7. Empty + loading states

- One `<EmptyState>` and one `<TableSkeleton rows n>` component.
- Audit and replace ad-hoc "No results" / spinner blocks across dashboard, workspace tabs, admin pages, CRM, ecosystem.

## 8. i18n

- New strings go through `t()` with PT + EN parity (no defaultValue).
- No copy rewrites unless required by new components (empty states); reuse existing keys where possible.

## Out of scope

- No schema/RLS changes, no edge function changes, no new features, no copy rewrites beyond what new components need, no logic refactors.
- Charts, PDFs, emails untouched.
- Mobile native gestures untouched (responsive only).

## Verification

- Visit `/`, `/my-workspaces`, a workspace detail, `/ecosystem`, `/crm`, `/admin` via Playwright; screenshot before/after at 1280×1800.
- Run `bun test` (i18n parity + existing suites).
- Confirm dark mode still passes contrast (spot check 3 screens).

## Rollout order

1. Tokens + fonts + base component variants (Button, Card, Badge, Table wrapper, EmptyState, TableSkeleton, PageHeader).
2. Global shell (Sidebar, TopBar, breadcrumbs).
3. Tables sweep.
4. Founder dashboard + workspace detail.
5. Staff cockpit screens.
6. Playwright screenshot verification + i18n parity check.
