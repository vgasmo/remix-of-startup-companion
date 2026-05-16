# Template Data-Loss Hotfix — Status Plan

## TL;DR

Across the previous incident turns the full hotfix from your brief has already landed. This plan is a **verification + close-out plan**, not a re-implementation. I want your approval before I run the verification scripts and do the browser smoke pass, because that's the only remaining work.

## What is already in place (verified by file/DB inspection)

1. **Autosave hook** — `src/hooks/useTemplateDraftAutosave.ts`
   - 850ms debounce, server save via `useUpsertTemplateInstance`.
   - `localStorage` fallback key `template-draft:${workspaceId}:${templateId}:${userId}`.
   - Flush on `visibilitychange`, `pagehide`, `beforeunload`, unmount, manual `flush()`.
   - Canonical `instanceId` cached in a `ref` — kills the canvas duplicate-insert bug regardless of stale `existingId` prop.
   - State machine: `idle | saving | saved | local_only | error` + `lastSavedAt`, with telemetry (`logger.info/warn/error` on every transition incl. `templateId`/`workspaceId`/`instanceId`).
   - `restoredFromLocal` + dismiss flag for the "Rascunho recuperado" banner.

2. **Regular template editor** (`TemplateEditorDialog` in `TemplatesTab.tsx`)
   - Every field change → `autosave.setField` (no explicit-save-only path).
   - `guardedClose()` shared by `DialogOnOpenChange` and footer Close button → flushes first, confirms if `local_only`.
   - "Submit for review" / "Mark complete" `await flush()` and bail on failure.
   - Sticky `AutosaveStatus` pill in header + footer.
   - "Precisa de ajuda?" CTA dispatches `open-ai-assistant`.
   - Sticky section nav (added previously for the persona/journey/script disambiguation).

3. **Canvas wrapper** (`CanvasTemplateWrapper` + `CanvasTemplate.tsx`)
   - `editValue` propagates up via `onChange` on every keystroke (line 456) → autosaved live, not only on the section Save button.
   - Flush on `editingSection` change + unmount.

4. **DB migration — dedupe + unique index** (already shipped)
   - `supabase/migrations/20260516141410_*.sql` backs up duplicate rows, merges `data_json` (newest wins; older fills gaps), preserves status precedence `completed > submitted > in_review > draft`, then creates `template_instances_workspace_template_unique` unique index on `(workspace_id, template_id)`.

5. **Scroll & layout**
   - Editor dialog: `w-[95vw] max-w-3xl max-h-[90vh] flex flex-col p-0`, body `flex-1 min-h-0 overflow-y-auto`, footer `shrink-0`.
   - Canvas: outer `ScrollArea max-h-[calc(100vh-16rem)]`, long checklist fields `max-h-40 overflow-y-auto`.

6. **i18n**
   - `crm.linkCopyFailed` present in `en.json` and `pt.json` (line 3214 in both).
   - All new autosave strings under `templates.autosave.*` with PT/EN parity.

## Remaining work (this loop)

A. **Run quality gates**, fix anything they flag:
   - `bunx tsc --noEmit -p tsconfig.typecheck.json`
   - `bunx vitest run` (unit)
   - `node scripts/i18n-check.cjs`
   - `node scripts/i18n-lint.mjs`
   - `node scripts/secret-scan.cjs`

B. **Browser smoke pass** of the 8 acceptance scenarios from your brief (tab switch, dialog close/reopen, route switch, simulated network failure, canvas rapid type → single instance via SQL count, mobile 360px scroll, submit-for-review awaits flush, refresh recovery).

C. **DB sanity check** post-migration: confirm `template_instances` has zero duplicate `(workspace_id, template_id)` pairs and the unique index exists.

D. If any gate fails: scope the fix narrowly to the failing surface — no unrelated refactors.

## Out of scope

- No new tables, no destructive deletes (the dedupe migration already keeps a backup table `template_instances_dedup_backup_20260516`).
- No changes to programs/cohorts/contracts/CRM beyond the already-shipped `crm.linkCopyFailed` key.
- No additional UX surface area beyond what's already wired.

## Risk

Low. All code paths already shipped; this loop only verifies and runs the existing gates. If a gate is red I will surface the exact failure before patching.

Approve and I'll run the verification suite + DB sanity check, then report back with a green/red table.
