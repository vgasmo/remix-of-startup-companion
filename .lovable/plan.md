
# Production Data-Loss Hardening Plan

Live incident. 7 batches, executed in priority order. Each batch is independently shippable and verifiable. I will not bundle batches that touch unrelated files; if a batch fails verification I stop and report.

---

## P0 — BATCH 1: Contract field persistence

**Files**
- `src/pages/ContractOnboarding.tsx`
- `src/pages/PublicContractIntake.tsx`
- `src/pages/PublicContractSigning.tsx`
- `supabase/functions/public-contract-onboarding/index.ts`
- new migration

**Changes**
1. Migration: add `certidao_permanente_code text`, `additional_representatives jsonb default '[]'::jsonb`, `project_name text` to `startup_contracts` (only the missing ones — verified against current schema first).
2. In each of the 3 contract pages, extract an explicit `VISIBLE_TO_PERSISTED` field map at top of file. Save mutation iterates the map, no field is dropped.
3. `ContractOnboarding`: include `legal_representative_phone`, `certidao_permanente_code`, `project_name`, `additional_representatives` in the save mutation.
4. `public-contract-onboarding` edge function: load returns + submit persists the same expanded set.
5. `PublicContractSigning.save_data`: persists `legal_representative_phone` + `project_name`.

**Acceptance:** fill every visible field → reload → all fields render with the saved values, for each of the 3 flows.

---

## P0 — BATCH 2: Autosave + local recovery for contract pages

**Files**
- new `src/hooks/useContractDraftAutosave.ts` (modeled on `useTemplateDraftAutosave` but keyed by token/contract id, no React Query coupling)
- wire into all 3 contract pages

**Behavior (mirrors existing template autosave contract)**
- `setField`/`setAll` → localStorage write on every change.
- 850ms debounce server save, flush on `blur`, `visibilitychange=hidden`, `pagehide`, `beforeunload`, route unmount.
- Restore banner: "Encontrámos dados não guardados. Restaurar / Ignorar" with i18n PT/EN keys.
- Status pill: `saving | saved | local_only | error`.
- localStorage key: `contract-draft:{flow}:{tokenOrId}` — scoped so two contracts never share a draft.
- Local draft only cleared after a confirmed server save / final submit.

**Acceptance:** the 3 manual smoke tests in the brief (refresh, tab switch, close/reopen) preserve typed data.

---

## P1 — BATCH 3: True upsert for template instances

**File:** `src/hooks/useTemplates.ts`

**Change** `useUpsertTemplateInstance` to use `.upsert(..., { onConflict: 'workspace_id,template_id' })` and `.select().single()`, returning the canonical row. If Supabase returns 23505 anyway (race), fall back to `select` by `(workspace_id, template_id)` then `update().eq('id', ...)`. Always return final id so `useTemplateDraftAutosave` cache stays correct.

**Acceptance:** two tabs editing same template never stick on `local_only`; the second tab recovers and updates the same row.

---

## P1 — BATCH 4: Booking link token hashing

**Files**
- `src/components/admin/IntakeRoutingManager.tsx`
- `src/components/admin/BookingLinksManager.tsx`
- new shared helper `src/lib/bookingTokens.ts` (`generateToken()` + `sha256Hex()` via Web Crypto)
- one-shot SQL: invalidate rows where `token_hash` looks like a plaintext token (length != 64 or non-hex), so old broken links return a clean "expired" error rather than partially working.

**Change:** `IntakeRoutingManager` stops writing plaintext to `token_hash`. Both admin UIs only render the share URL (which contains the plaintext token), never the hash column. Public edge functions already hash incoming → match — no change there.

**Acceptance:** brand-new booking link created from either admin surface works; admin UI never shows raw token after creation closes.

---

## P1 — BATCH 5: ProgramSetupWizard autosave

**File:** `src/pages/ProgramSetupWizard.tsx`

**Changes**
1. `pendingUpdatesRef.current = { ...pendingUpdatesRef.current, ...updates }` (merge, not replace).
2. `await flush()` before: step nav buttons, Back, Discard, Publish, and inside an unmount effect.
3. `visibilitychange` / `pagehide` / `beforeunload` listeners → flush + localStorage backup keyed `program-setup-draft:{programId}`.
4. On mount, if local draft newer than server `updated_at`, offer restore.

**Acceptance:** three manual smoke tests in the brief.

---

## P1 — BATCH 6: Transactional program publish

**File:** new migration with `publish_program_setup_tx(p_program_id uuid, p_payload jsonb)` SECURITY DEFINER RPC; refactor `supabase/functions/publish-program-setup/index.ts` to call the RPC.

**Strategy:** inside one transaction — insert new gates/weeks/playbooks/stages with a temporary `is_pending=true` marker (or staging temp table via CTE), validate, then in same tx swap by deleting old + clearing pending flag. Wrap in `BEGIN/EXCEPTION WHEN OTHERS THEN` → mark draft `publish_failed` with error JSON, RAISE. Existing active program rows are never deleted before replacement rows exist + validate.

**Acceptance:** forced failure mid-publish leaves prior active program fully usable.

---

## P2 — BATCH 7: Hygiene

- `.env` cannot be removed from the sandbox (release-wrapper limitation, already documented in `RELEASE_WRAPPER_MANUAL_STEPS.md`). I will re-verify the doc covers this and stop there.
- Lockfiles: same release-wrapper constraint. Doc already covers `bun.lockb` + `package-lock.json` removal post-export. No code change possible from sandbox.
- Dedupe migration: add a **read-only** verification SQL (no DDL) inside a new `supabase/tests/` file; do NOT re-run the destructive migration. Run it once via `read_query` and report counts.

---

## Verification

After each batch:
- targeted code re-read
- `node scripts/i18n-check.cjs && node scripts/i18n-lint.mjs && node scripts/secret-scan.cjs`
- DB sanity SELECTs (template dupes, contract column presence, token_hash lengths)

(Typecheck/vitest/build run automatically by the harness — I do not invoke them manually.)

---

## Risks / honest caveats

- **Batch 6 is the riskiest.** Moving publish into a single RPC means rewriting the function body server-side; if the existing edge function does many cross-table writes with dynamic shapes, the RPC may need a multi-step API instead of one call. If that's the case I will fall back to the "interim" approach (staging rows + rollback) and flag clearly.
- **Batch 7 hygiene items** (.env, lockfiles) genuinely cannot be done from the Lovable sandbox — they are post-export manual steps. I will not pretend otherwise.
- I will only touch files listed per batch. No cosmetic edits, no unrelated refactors.

Reply "go" (or name specific batches) to start. I will execute batches sequentially, reporting verification after each.
