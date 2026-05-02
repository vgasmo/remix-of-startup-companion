# CTO Review: Leiria Launchpad Platform

**Date:** 2026-01-15  
**Author:** CTO Review Agent  
**Version:** 1.0

---

## Executive Summary

This platform is **production-ready** with strong architecture, security, and UX foundations. The primary quality issue is **i18n inconsistency** — hardcoded strings, mixed languages, and inconsistent terminology. This review identifies targeted improvements without disrupting what's already working.

---

## A) What's Already Excellent

### Architecture Choices
- **Supabase + RLS**: Comprehensive row-level security with `SECURITY DEFINER` functions (`has_role`, `has_active_workspace_access`, `can_manage_startup`)
- **Edge Functions**: Well-structured with shared utilities (`_shared/cors.ts`, `_shared/security.ts`, `_shared/graphAuth.ts`)
- **TanStack Query**: Consistent data fetching patterns with proper cache invalidation
- **Role-based routing**: Clean separation via `ProtectedRoute` and `AuthContext`

### UX Patterns
- **Progressive disclosure**: Dashboards show role-specific content (Consultor, Founder, Mentor)
- **One Thing Today**: Founders get focused, actionable guidance
- **Cockpit View**: Consultants get work queue and triage capabilities
- **Empty states**: Most components have helpful empty states with CTAs

### Security Posture
- **Workspace approval gating**: `has_active_workspace_access` prevents premature data access
- **Graph integration hardening**: Token caching, 429 handling, structured logging (per `docs/GRAPH_HARDENING.md`)
- **Input validation**: Edge functions validate payloads with strict schemas

### Infrastructure
- **i18n lint script**: `scripts/i18n-lint.mjs` detects duplicate keys and missing namespaces
- **Error handling**: `logError` utility in `src/lib/logError.ts` for structured logging
- **Timezone handling**: Europe/Lisbon standardized across Graph functions

---

## B) Where Friction Is Happening

### P1: i18n / Translation Issues
**Impact:** Users see mixed languages, raw keys, or inconsistent terminology  
**Affected roles:** All (worst for Founders and Mentors)

| Issue | Evidence | Fix |
|-------|----------|-----|
| Hardcoded nav labels | `src/components/layout/AppLayout.tsx:105-107` — "Home", "Mentors", "Settings" | Use `t('nav.*')` keys |
| Hardcoded mobile button | `src/pages/MyWorkspaces.tsx:296` — "New" | Use `t('common.new')` |
| Hardcoded room types | `src/components/backoffice/RoomMappingTab.tsx:41-53` — "Office", "Available" | Use `t('backoffice.roomTypes.*')` |
| Hardcoded status messages | `src/components/backoffice/RoomMappingTab.tsx:117,151` — "Loading...", "Unable to load" | Use `t('common.loading')` |
| Hardcoded "/mo" currency | `src/components/workspace/LocationContractCard.tsx:118` | Use `t('common.perMonth')` |
| Mixed "Add tags..." placeholder | `src/components/workspace/WorkspaceOverview.tsx:255` | Use `t('workspace.addTags')` |

### P2: Terminology Inconsistency
**Impact:** Users confused by different terms for same concepts  
**Affected roles:** All

| Concept | Variations Found | Standardized Term |
|---------|------------------|-------------------|
| Company entity | startup, company, workspace | **Startup** |
| Growth phase | stage, phase, step | **Stage** |
| Program cohort | program, cohort, batch | **Program** |
| Consultant/Advisor | consultor, consultant, advisor | **Consultant** |

### P2: Error Message Inconsistency
**Impact:** Unclear error messages reduce user confidence  
**Affected roles:** All

| Issue | Evidence |
|-------|----------|
| Generic error fallback | `src/pages/MyWorkspaces.tsx:380` — "Failed to load workspaces. Please try again." (not translated) |
| Inconsistent toast patterns | Some use `toast.error(t('key'))`, others use hardcoded strings |

---

## C) Problems Ranked by Priority

### P0 (Critical) — None Found
The platform has no blocking security or functionality issues.

### P1 (High Priority)

1. **Hardcoded English in mobile nav** (`AppLayout.tsx`)
   - Affected: All mobile users
   - Fix: Add i18n keys for mobile bottom nav

2. **Hardcoded English/Portuguese in backoffice** (`RoomMappingTab.tsx`, `BackofficeDashboard.tsx`)
   - Affected: Admins
   - Fix: Add `backoffice.roomTypes.*` and `backoffice.status.*` keys

3. **Missing fallback for untranslated keys**
   - Current behavior: Shows raw key if translation missing
   - Fix: Configure i18next with `saveMissing` in dev mode for detection

### P2 (Medium Priority)

4. **Terminology drift across pages**
   - Fix: Create standardized glossary in `docs/I18N_TRANSLATION_GUIDE.md`

5. **Date/time formatting inconsistency**
   - Some places use `date-fns format()`, others use `Intl.DateTimeFormat`
   - Fix: Already have `src/lib/dateUtils.ts` — ensure consistent usage

6. **Error state not translated** (`MyWorkspaces.tsx:380`)
   - Fix: Use `t('common.loadError')` with interpolation

### P3 (Low Priority / Polish)

7. **Dual lockfiles** (`bun.lockb` + `package-lock.json`)
   - Fix: CI already warns about this; remove `bun.lockb` if npm is primary

8. **Large locale files** (3600+ lines each)
   - Fix: Consider splitting by namespace in future

---

## D) Improvements Shipped in This Patch

1. **Fixed hardcoded mobile nav labels** — `AppLayout.tsx`
2. **Fixed hardcoded button text** — "New" → `t('common.new')` in `MyWorkspaces.tsx`
3. **Fixed hardcoded room type/status labels** — `RoomMappingTab.tsx`
4. **Fixed hardcoded loading/error states** — `RoomMappingTab.tsx`
5. **Added missing i18n keys** — Both `en.json` and `pt.json` updated
6. **Created I18N Translation Guide** — `docs/I18N_TRANSLATION_GUIDE.md`

---

## E) Next 2–6 Weeks Roadmap

### Week 1-2: i18n Consolidation
- [ ] Audit all components for hardcoded strings (use `grep -r "\"[A-Z]" src/`)
- [ ] Run `scripts/i18n-lint.mjs` in CI pipeline
- [ ] Add `saveMissing` handler in dev mode to detect missing keys

### Week 3-4: UX Polish
- [ ] Standardize empty states across all tables/lists
- [ ] Add loading skeletons consistently (replace spinners)
- [ ] Improve mobile responsiveness on admin panels

### Week 5-6: Reliability
- [ ] Add correlation IDs to all API responses for debugging
- [ ] Implement retry UI for failed data fetches
- [ ] Add "last sync" indicators for Graph integrations

---

## Appendix: File Inventory

### Core Layout
- `src/components/layout/AppLayout.tsx` — Main layout with mobile nav
- `src/components/layout/AppSidebar.tsx` — Desktop sidebar

### Role-Specific Dashboards
- `src/components/dashboard/FounderDashboard.tsx`
- `src/components/dashboard/ConsultorDashboard.tsx`
- `src/components/dashboard/MentorDashboard.tsx`

### i18n
- `src/i18n/index.ts` — i18next configuration
- `src/i18n/locales/en.json` — English translations (3670 lines)
- `src/i18n/locales/pt.json` — Portuguese translations (3634 lines)
- `scripts/i18n-lint.mjs` — Linting script for translation files

### Graph Integration
- `supabase/functions/_shared/graphAuth.ts` — Token management
- `supabase/functions/check-consultant-availability/index.ts`
- `supabase/functions/public-get-availability/index.ts`
