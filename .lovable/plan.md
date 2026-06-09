This is a very large multi-phase mission (10 phases, ~150+ file edits, 2 new tables, new feature surface for cross-role feedback loops, new observability stack). Before I dive in, I want to confirm scope and sequencing so we don't end up with a half-done phase or a broken build.

## What I'll do

I'll execute strictly in phase order, running typecheck/lint/build after each phase and fixing breakage before moving on. If I hit the practical limit of a single run, I'll **stop at a phase boundary** and report exactly which phases are complete, so the next run picks up cleanly.

## Realistic scope per run

Given the volume (especially Phase 2's ~154 icon buttons, Phase 3's full token sweep, Phase 8's new feature with table + RLS + UI on dashboard/timeline/KPI flows, and Phase 9's new error table + dashboard surface), one run can realistically cover **Phases 1, 4, 5, 6, 7 fully** and **start Phase 2/3** (highest-impact files first). Phases 8–10 each need their own focused run because they involve migrations + UI + i18n keys + analytics wiring that touch many files together.

Proposed run breakdown:
- **Run 1 (this one):** Phases 1, 4, 5, 6, 7 + Phase 2 top-priority files (AdminKpisManager, WizardWeeksGatesStep, admin managers, CRM drawers, workspace tabs) + Phase 3 listed files.
- **Run 2:** Phase 8 — `workspace_engagement_events` migration, view recording, MySupportTeamCard receipts, acknowledge button, submission echo, i18n.
- **Run 3:** Phase 9 + Phase 10 — `app_errors` migration, boundary wiring, admin surface, anomaly nudge, prep echo.

## Frozen-file discipline

In ClaimStartup, ContractOnboarding, PublicContractSigning, PublicContractIntake, AcceptInvite, and all RLS/claim/token/auth code: **className, aria-*, t() only**. I'll verify by diffing logic lines before committing each phase.

## GDPR discipline for new events

`workspace_engagement_events` and `app_errors` will carry IDs + timestamps + enums only. Names/emails resolved client-side from existing members data. I'll add a comment in each migration documenting the no-PII contract.

## Technical notes

- Phase 8 acknowledge notifications use the existing `notifications` table + `notify.*` helpers (per memory).
- Phase 8 debounce ("max one view per actor/workspace/day") = client-side check-then-insert against today's row, matching the existing `useWorkQueue` recomputation pattern (per memory).
- Phase 9 error capture is fire-and-forget; never throws inside the boundary.
- Phase 10 anomaly nudge is pure client-side over already-fetched KPI data — no new query.
- All new strings get pt/en parity; I'll run `node scripts/i18n-check.cjs` before declaring done.

## Question before I start

Do you want me to:

**(A)** Proceed exactly as proposed — Run 1 covers Phases 1, 4, 5, 6, 7 + the highest-impact slices of Phases 2 & 3, then stop and report; Runs 2 and 3 handle the differentiator (8) and observability (9/10) separately.

**(B)** Compress harder — attempt all 10 phases in this single run, accepting that Phase 2 (icon-button aria-labels) will be done as a scripted sweep over the most common patterns rather than 154 hand-verified edits, and Phase 8's UI polish may be minimal (functional receipts + acknowledge, but less visual flourish).

**(C)** Different split — tell me which phases you most want shipped first and I'll reorder.

I'd recommend **A** for safety (zero risk of leaving a broken phase) but **B** is doable if you want everything in one go and accept the trade-off on Phase 2 thoroughness.