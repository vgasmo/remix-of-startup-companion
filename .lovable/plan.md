# Founder UX Polish — Scoped Plan

## Phase 0 — Reliability guardrail (verified, no changes)

Quick check confirms baseline is intact:
- `useContractDraftAutosave` is wired into all 3 contract surfaces.
- `useUpsertTemplateInstance` keeps onConflict + 23505 recovery.
- `BookingLinksManager` + `IntakeRoutingManager` both store only `token_hash` via shared `sha256Hex`.
- `ProgramSetupWizard` has crash recovery + flush.
- `publish-program-setup` snapshot/restore intact.

No reliability code will be touched. If any item fails during implementation, I stop and fix it first.

## What I will change (founder-facing only)

### Phase 1 — Founder dashboard hierarchy (visual only)
File: `src/components/dashboard/FounderDashboard.tsx`
- Tighten above-the-fold rhythm: `OneThingToday` becomes the single hero card (larger title, more breathing room, single primary CTA emphasis). Programme progress (`AccelerationProgressCard` or `FounderJourneyMap`) sits directly below as the secondary anchor. `FounderHelpNudge` stays as the calm tertiary entry.
- Reduce competing card weights in the "above the fold" region (downgrade secondary cards from `border-2` / heavy shadows to standard tokens).
- Preserve every existing widget; nothing removed. Streak/Journey/Rings/InvestorReadiness etc. stay inside the persisted "Show more" collapsible.
- Keep the `founder-advanced-open:${userId}` localStorage preference exactly as-is.

### Phase 2 — Programme visual language (copy/layout only)
Files: `src/components/dashboard/AccelerationProgressCard.tsx`, `src/components/founder/FounderJourneyMap.tsx` (if present)
- Acceleration card: emphasize "Semana X de 12 · Próximo gate em N dias" header line, compact week dots.
- Incubation map: emphasize current stage label + next playbook item.
- Unknown programme type already degrades; verify and fall back to generic "Próxima ação".

### Phase 3 — Help nudge polish (copy + placement)
File: `src/components/founder/FounderHelpNudge.tsx`
- Keep all dismissal/TTL logic (already in `useFounderStuckSignal`).
- Refine copy to: "Sentes-te perdido?" / "Diz-nos o que estás a tentar fazer e indicamos o sítio certo." (+ EN parity).
- Ensure it renders as inline card, never modal.

### Phase 4 — Founder empty states
Targeted audit + minimal CTA additions where dead-ends exist:
- KPI tab empty state → "Começa por um KPI simples" + CTA to add.
- Templates list empty → "Começa um template guiado" + CTA.
- Sessions empty → "Marca ou pede a tua primeira sessão" if booking enabled.
- Documents empty → "Carrega prova de progresso quando tiveres" + CTA.
Only touch components where the empty state is currently a dead-end. Skip files that already have a CTA.

### Phase 5 — Autosave status copy (visual only)
- Confirm `useContractDraftAutosave` / `useTemplateDraftAutosave` status chip wording is calm ("A guardar…", "Guardado", "Guardado localmente", "Restaurar rascunho"). Only adjust labels in the *consumers* that render status — never the hooks themselves.

### Phase 6 — Status colour + spacing consistency (founder surfaces only)
- Spot-fix obvious inconsistencies (green/amber/red/blue) on the founder dashboard cards.
- No global token redesign. No admin/staff changes.

### Phase 7 — Analytics
Skip. No canonical `@/lib/analytics` taxonomy exists in this codebase (previous audit confirmed).

## Explicitly NOT doing
- No rewrite of `useContractDraftAutosave`, `useTemplateDraftAutosave`, `useUpsertTemplateInstance`, `publish-program-setup`, booking token logic.
- No changes to admin/staff/consultor/mentor surfaces.
- No removal of any widget (StreakHero, JourneyMap, ProgressRings, InvestorReadiness, FAB, etc.).
- No new task/social/LMS systems.
- No dark-mode redesign, no purple-heavy theme.
- No new dependencies.

## Files expected to change (~6-9, all UI)
- `src/components/dashboard/FounderDashboard.tsx`
- `src/components/dashboard/OneThingToday.tsx` (typography only)
- `src/components/dashboard/AccelerationProgressCard.tsx`
- `src/components/founder/FounderJourneyMap.tsx` (if present)
- `src/components/founder/FounderHelpNudge.tsx`
- Up to 3 empty-state components for KPI / Templates / Sessions / Documents tabs (only those with dead-end states)
- `src/i18n/*` PT/EN parity additions for any new strings

## Verification
- `bun run typecheck`
- `node scripts/i18n-check.cjs` + `node scripts/i18n-lint.mjs`
- `node scripts/secret-scan.cjs`
- Manual smoke on `/dashboard` as founder (acceleration + incubation + unknown).
- Confirm "Show more" persistence still works.
- Confirm no admin/staff regressions by spot-checking `/admin`.

## Risks / follow-ups
- Empty-state additions need PT/EN parity — I will run `i18n-check` before declaring done.
- If a founder surface I touch happens to share a component with admin, I'll wrap changes in role checks rather than mutating shared code.
