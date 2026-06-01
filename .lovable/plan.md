# Cleanup plan: Signup, Backoffice & Contract Signing

Audit surfaced ~17 concrete issues across the three flows. Below is a focused, low‑risk plan that ships in three passes. No schema changes, no behavior regressions — only clarity, consistency and error‑handling improvements.

## Pass 1 — Signup & onboarding entry

**Goal:** remove dead ends and stale state in the auth funnel.

1. `src/pages/Login.tsx`
   - Split `email`/`password`/`fullName`/`error` into separate state per tab so switching tabs no longer carries stale values or error messages.
   - Add a small inline hint when the consultor auto‑detection kicks in (`@startupleiria.com`) instead of silently hiding the role picker.
2. `src/pages/PendingApproval.tsx`
   - Poll account status every 30 s (or on tab focus) and auto‑redirect to `/` when approved.
   - Add a secondary "Check status now" button next to "Sign out".
3. `src/pages/AcceptInvite.tsx`
   - Remove dead `sessionStorage` write (token is always re‑read from URL).
   - When redirecting to login, embed the full `/accept-invite?token=…` path in `returnTo` and also pass it through Supabase `emailRedirectTo` in `AuthContext.signUp` so invite tokens survive email verification.
4. `src/components/founder/FounderWelcomeWizard.tsx`
   - Visually mark contextual actions as "done" after click (check icon + muted style) instead of immediately closing the wizard.
   - Make the contextual action open in a new tab (or keep wizard open) so users can still hit "Next".
   - Add missing EN translation keys for step labels.

## Pass 2 — Backoffice contract creation

**Goal:** make the create flow predictable and surface errors.

1. `src/components/backoffice/contracts/ContractUploadDropzone.tsx`
   - Add an `onCancel` callback wired to a visible "← Back" button.
2. `src/pages/BackofficeContractsTab.tsx` (or wherever the flow state lives)
   - Wire `onCancel` to return to `idle`.
   - Read `isError` from `useContracts` and render an inline error card with retry.
   - Move the bulk‑create panel behind a collapsed `<details>` / accordion so it stops dominating the page.
3. `src/components/backoffice/contracts/ContractReviewForm.tsx`
   - Replace hardcoded `(opcional)` with a `t()` key.
   - When incubation type auto‑fills `monthly_fee`, show a small "Auto‑filled from {type}" badge next to the field and only overwrite if the field is empty or untouched (use `form.formState.dirtyFields`).
   - Guarantee PT/EN parity for `contractStatus.*` keys; fall back to a human label, never raw snake_case.
   - Replace the disabled empty `contract_number` field with a muted helper line ("Será atribuído ao guardar — INC‑YYYY‑NNN") so it doesn't look like a broken input.

## Pass 3 — Public contract signing

**Goal:** consistent i18n, clear document requirements, no full‑page reloads.

1. `src/pages/PublicContractSigning.tsx`
   - Move all `isPt ? 'a' : 'b'` strings into `t()` keys under a new `publicContract.*` namespace (PT + EN). Drop the custom `lang` state; use `i18n` directly.
   - Add "Optional" / "Required" badges per document upload row driven by a single config array.
   - Replace `window.location.reload()` after digital signing with a success screen + explicit "Voltar ao início" button.
   - Pre‑fetch the contract PDF when the user enters Step 2 (Review), not Step 3 (Signing), so the preview is ready.
   - Add inline error display (not just toast) on signing failure.
2. `supabase/functions/public-contract-onboarding/index.ts`
   - Add a small dispatch map at the top (`{ action: handler }`) and return `404 Unknown action` for typos.
   - Add length cap (e.g. 200 chars) and trim on `project_name` in `validateIntakeForm`.

## Out of scope (call out, do not change)

- The duplicate `PublicContractIntake.tsx` page and the two token systems (`onboarding_token` vs `intake_token_hash`) — consolidating these is a separate, larger refactor with migration implications. Will document in `mem://` and flag for a follow‑up.
- No DB schema changes.
- No changes to pricing/discount logic (contract immutability rules).

## Technical notes

- All work is UI + edge function ergonomics. No migrations.
- All new copy goes through `react-i18next` with PT + EN keys to satisfy the bilingual parity rule.
- React Query keys, RLS, and `invokeWithAuth` patterns are preserved.
- Will verify by viewing the affected screens in preview after each pass.

## Suggested order

Pass 1 → Pass 2 → Pass 3 (independent, can ship one at a time if you prefer to review between passes). If you want me to start with just one pass, tell me which; otherwise I'll proceed in order.
