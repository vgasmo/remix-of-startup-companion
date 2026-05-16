# Founder UX Audit & Surgical Gap-Fill Plan

The brief says "do not change anything yet — first audit and plan." I read the live founder surfaces and almost every item is **already implemented**. Below: what exists, what's actually missing, and the minimal changes I propose.

## 1. Audit — what's already there

`src/components/dashboard/FounderDashboard.tsx` (490 lines) already implements the calm founder view the brief asks for:

| Brief item | Status | Existing implementation |
|---|---|---|
| 2. Next Best Action focus area | ✅ Shipped | `<OneThingToday>` renders a single primary CTA above the fold; `NextBestActionPanels` exists for power users |
| 3. "Feeling stuck?" help nudge | ✅ Shipped | `<FounderHelpNudge>` (168 lines): non-intrusive, per-user/path dismissal, opens search / AI copilot / quick guide / book session, respects `hasConsultant` |
| 4. Progressive disclosure | ✅ Shipped | `<Collapsible>` "Mostrar mais detalhes de progresso" wrapping Journey Map, Progress Rings, Stage/Investor/Calendar, Streak, QuickGuide. Driven by `useFounderMaturity` (`isBeginner` → collapsed by default; experienced founders expand by default). User toggle is persisted in component state, but NOT to localStorage. |
| 5. Template autosave confidence | ✅ Shipped last loop | `useContractDraftAutosave` flushes on blur/visibility/pagehide; "Saved locally" + Restore draft UI present |
| 6. Programme-specific guidance | ✅ Shipped | `program_type === 'acceleration'` → `<AccelerationProgressCard>` (week/gate); else `<FounderJourneyMap>` (stage); `OneThingToday` already branches on programme type |
| 7. Lightweight empty states | ✅ Mostly | `FounderWelcomePanel` checklist appears when setup incomplete; `OneThingToday` provides "Ask for help" fallback |
| Calm hero / warm welcome | ✅ Shipped | Beginner-only gradient hero with first-name greeting |
| Pending contract priority | ✅ Shipped | `<PendingContractBanner>` rendered above everything |
| Multi-workspace switcher | ✅ Shipped | Inline pill switcher |
| Quick KPI auto-prompt | ✅ Shipped | Suppressed for `new_founder` and on first visit; per-month sessionStorage dismiss |
| Mobile QuickActionsFab | ✅ Shipped | Already present |

**What is actually overwhelming today:** very little above the fold for beginners (hero + OneThingToday + booking CTA + optional checklist = 3–4 cards). The brief's diagnosis ("founders feel overwhelmed") was largely true before recent work but is mostly addressed.

## 2. Real gaps worth fixing (small, surgical)

These are the only deltas I'd ship — no rewrites, no new systems:

### G1. Persist the "Show more" preference across sessions
`advancedOpen` lives in component state only. A founder who expands once must re-expand on every visit. Add a per-user localStorage key (`founder-advanced-open-${profile.id}`) that overrides `showAdvancedByDefault` once the user toggles. Reversible, ~10 LOC.

### G2. Re-surface help nudge after stalled sessions
`FounderHelpNudge` dismissal is sticky per path. Brief asks: "If a founder has been inactive or returns after a failed/unfinished action, allow the nudge to reappear." Add a 14-day TTL on the dismiss key so it returns silently for re-engaged founders. ~5 LOC inside `FounderHelpNudge`.

### G3. Lightweight analytics events
Brief lists 6 events. Confirm whether a tracker exists; if `@/lib/analytics` or similar is present, wire:
- `founder_next_action_clicked` in `OneThingToday`
- `founder_help_nudge_opened` / `_search_from_help_clicked` / `_ai_from_help_clicked` / `_guide_from_help_clicked` in `FounderHelpNudge`
- `founder_advanced_section_expanded` in `FounderDashboard`

If no analytics module exists, **skip** rather than invent one (brief: "If an analytics/event taxonomy exists, use it").

### G4. Empty-state polish (only if missing)
Spot-check KPI tab, templates list, sessions tab for dead-end empty states. Add CTA-bearing empty states only where missing. Do not touch tabs that already have them.

## 3. Explicitly NOT doing

- No rewrite of `FounderDashboard`, `OneThingToday`, `FounderHelpNudge`, `useFounderMaturity` — they already match the brief.
- No new "next best action" engine — `OneThingToday` is the single source.
- No new task system, social feed, LMS, or marketplace.
- No removal of existing widgets (StreakHero, JourneyMap, ProgressRings, InvestorReadiness, etc.) — they stay inside "Show more".
- No changes to admin/staff/consultor/mentor dashboards.
- No mobile redesign — current layout uses `max-w-5xl space-y-6` with responsive grids; spot-check only.

## 4. Files I expect to touch

- `src/components/dashboard/FounderDashboard.tsx` — persist advanced-open preference (G1)
- `src/components/founder/FounderHelpNudge.tsx` — TTL on dismissal + analytics hooks (G2, G3)
- `src/components/dashboard/OneThingToday.tsx` — analytics hook (G3)
- (conditional) one or two empty-state tweaks (G4)

Estimated diff: **<80 lines net**. No migrations, no edge-function changes, no schema changes, no i18n breakage.

## 5. Verification after implementation

`bun run typecheck` · `node scripts/i18n-check.cjs` · `node scripts/i18n-lint.mjs` · `node scripts/secret-scan.cjs` · manual smoke on `/dashboard` as beginner founder.

## 6. Open question for you

Should I proceed with **G1 + G2 only** (lowest risk, highest signal), or include **G3 analytics** as well? G3 depends on whether you already have an analytics taxonomy I should plug into — say the module name and I'll wire it; otherwise I'll skip G3 per the brief.
