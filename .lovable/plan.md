# Template Hotfix Plan — Data Loss & Scroll Reliability

Live incident: founders lose typed template work. This plan adds a robust autosave layer, fixes canvas duplicates, repairs scroll, and closes the i18n lint gap. No destructive migration.

## 1. New autosave hook — `src/hooks/useTemplateDraftAutosave.ts`

A single reusable hook used by both the regular template editor and the canvas wrapper.

Inputs: `workspaceId`, `templateId`, `userId`, `existingInstance?`, `initialData`.

Behavior:
- Internal `data` state seeded from server instance, else from localStorage draft, else `initialData`.
- localStorage key: `template-draft:${workspaceId}:${templateId}:${userId}`. Stores `{ data, updatedAt, instanceId }`.
- On mount: if local draft is newer than server `updated_at`, restore it and expose `restoredFromLocal = true` so the UI can show a "Rascunho recuperado" banner.
- `setField(path, value)` updates state, marks dirty, writes localStorage immediately, schedules debounced server save (850ms).
- Server save uses `useUpsertTemplateInstance` (already supports `existingId`). After first successful insert we cache the returned `id` in a ref so subsequent saves update the same row — fixes the canvas duplicate bug regardless of prop staleness.
- `flush()`: cancels timer and awaits a pending save (returns success/failure).
- Flush triggers wired in the hook itself:
  - `visibilitychange` (document hidden)
  - `pagehide` / `beforeunload` (sync localStorage write + best-effort server flush)
  - unmount (`useEffect` cleanup awaits flush before clearing timer)
- Status state machine: `idle | saving | saved | local_only | error` plus `lastSavedAt`. Exposed for status pills.
- On Supabase failure: keep localStorage draft, set `local_only`, toast once with calm PT-PT copy "Guardado localmente. Vamos sincronizar quando a ligação voltar."
- After a successful server save matching the local draft, clear the local draft entry.

## 2. Regular template editor (`TemplateEditorDialog` inside `TemplatesTab.tsx`)

- Replace ad-hoc `useState` field map with the autosave hook.
- Every `onChange` calls `setField` (no explicit Save required).
- Field `onBlur` calls `flush()`.
- Dialog `onOpenChange(false)` and the footer Close button both go through one `guardedClose()` that:
  1. calls `flush()`,
  2. if `error` and dirty, opens existing `ConfirmDialog` ("Tem alterações não sincronizadas. Sair e manter cópia local?"),
  3. otherwise closes.
- Footer:
  - "Save" → "Guardar agora", calls `flush()`.
  - "Marcar como concluído" and "Submeter para revisão" are `disabled` while status is `saving` or `local_only`; they `await flush()` first and abort if it fails.
- Add an `AutosaveStatus` inline component (small text + dot) shown next to the dialog title and in the footer: `A guardar…`, `Guardado às HH:mm`, `Cópia local guardada`, `Falha ao guardar`.
- Add a "Precisa de ajuda?" ghost button in the header that opens existing AI assistant (reuse `AskAiMenu` trigger via a custom event or simple link to help — minimal: dispatch `window.dispatchEvent(new CustomEvent('open-ai-assistant'))` already used elsewhere; fall back to navigating `/help`).
- Restored-from-local banner: `Alert` with calm copy above the form.

## 3. Canvas templates (`CanvasTemplate.tsx` + `CanvasTemplateWrapper` in `TemplatesTab.tsx`)

- Wrapper switches to `useTemplateDraftAutosave` (same hook).
- Pass `setField` down so `CanvasTemplate` updates state on every keystroke of `editValue` (autosave), not only on the per-section Save button.
- Section-level Save button remains as "Confirmar secção" UX affordance but is no longer the only persistence path.
- On `editingSection` change or component unmount, the wrapper calls `flush()` so the currently edited section text is committed.
- Instance id cached in a ref inside the hook — eliminates duplicate inserts during rapid typing on a fresh canvas (the original `existingId` prop staleness bug).
- App-level dedupe safeguard: on hook init, if `instances` for this template_id has >1 row, pick newest `updated_at`, shallow-merge `data_json` from older rows where keys are missing, and remember its id. Older rows are left untouched (no destructive deletes in this hotfix).
- A separate, safe deduplication+unique-index migration is prepared **but not run** in this PR — noted as follow-up so it can be reviewed offline.

## 4. Scroll and layout

- `Dialog` content for `TemplateEditorDialog`: `max-h-[90vh]` + flex column. Header and footer `shrink-0`; middle wrapped in `<ScrollArea className="flex-1 min-h-0 pr-4">`. Mobile width `w-[95vw]`.
- `CanvasTemplate` outer container: `h-[calc(90vh-8rem)] min-h-0 flex flex-col`. Horizontal scroller wraps in `overflow-x-auto`; each section card uses `max-h-full overflow-y-auto` so vertical content inside sections scrolls independently. Long checklist fields get `max-h-64 overflow-y-auto`.
- Verified on 360px and 1280px viewports via browser tool.

## 5. i18n

- Add key `crm.linkCopyFailed` to `src/i18n/locales/pt.json` ("Falha ao gerar o link") and `en.json` ("Failed to generate link").
- Add new keys used by autosave UI under `templates.autosave.*` (PT + EN parity): `saving`, `savedAt`, `localOnly`, `failed`, `restoredBanner`, `needHelp`, `saveNow`, `unsavedExitConfirm`.
- Run `node scripts/i18n-check.cjs` and `node scripts/i18n-lint.mjs` to confirm green.

## 6. Verification

- `bun run typecheck`
- `bun run test` (if present)
- `node scripts/i18n-check.cjs`, `node scripts/i18n-lint.mjs`, `node scripts/secret-scan.cjs`
- Manual browser smoke for the 8 scenarios in the brief (tab switch, dialog close/reopen, route switch, simulated network failure via offline toggle in code path, canvas rapid type → single instance, mobile scroll, submit-for-review awaits flush).

## Out of scope (explicit)

- No changes to programs/cohorts/contracts/CRM logic beyond the one missing i18n key.
- No DB migration in this PR; dedupe handled at app level. Migration drafted separately.
- No change to review/approval semantics besides gating on flush success.

## Files touched

- New: `src/hooks/useTemplateDraftAutosave.ts`
- Edit: `src/components/workspace/TemplatesTab.tsx` (editor dialog, canvas wrapper, autosave wiring, scroll classes, help CTA, banner)
- Edit: `src/components/workspace/CanvasTemplate.tsx` (scroll classes, propagate live edits up via callback, flush on section change/unmount)
- Edit: `src/i18n/locales/pt.json`, `src/i18n/locales/en.json`

## Technical notes

- `useUpsertTemplateInstance` already accepts `existingId`; the hook owns the canonical id via `useRef` after the first insert, so prop staleness is moot.
- `beforeunload`/`pagehide` only guarantees the localStorage write; Supabase calls there are best-effort (`navigator.sendBeacon` not used because the SDK signs requests — acceptable since localStorage covers recovery).
- All new strings translated PT-PT first, EN parity required by `i18n-lint`.
