
# Hardening Plan — Verified Baseline First

## Ground truth I re-verified before writing this plan

- `bunx tsc --noEmit -p tsconfig.typecheck.json` → **0 errors** (the brief's "19 TS errors" is stale).
- `node scripts/i18n-check.cjs` → **8460 keys in sync, no missing keys** (the brief's "8 missing" is stale).
- `deno check supabase/functions/pandadoc-webhook/index.ts` → **6 errors** (real, blocks deploy).
- `deno check supabase/functions/docusign-webhook/index.ts` → **2 errors** (real, blocks deploy).

So the only real *release blocker* right now is the two webhook Edge Functions failing static compile. Everything else in Phases 1–5 is real hardening work but not blocking a green build.

## Phase 0 — Release blockers (shipping in this turn)

**pandadoc-webhook/index.ts**
- Delete the obsolete second verification block (lines 159–168) that redeclares `authResult` and calls the verifier synchronously on the already-parsed body.
- Delete the duplicate `canonicalStatus` declaration at line 279 (keep the one at 261).
- Replace the `markInboxProcessed(..., { status: 'received', ... })` backfill (line 258) with a direct `webhook_inbox` update of `contract_id` only — `'received'` is not a valid terminal status for that helper.
- Narrow the top-level `catch (err)` to `err instanceof Error ? err.message : String(err)`.

**docusign-webhook/index.ts**
- Same two shape errors: illegal `'received'` inbox status and untyped `err.message`. Fix identically.

**Verification:** `deno check` both functions; `bunx tsc --noEmit`; `bun run build`.

## Phase 0 (remaining) — stop for review before shipping

The rest of Phase 0 (raw-body-only reads already done; ordering guard already done via `TERMINAL_SIGNATURE_STATUSES`; PII scrubbing of `raw_payload_preview`; checked writes on every `.update()/.insert()`; publishing RPC refactor; ProgramSetupWizard single-flight autosave) touches production data paths and RLS. I'll ship those as a second batch after you confirm this one landed cleanly.

## Phases 1–5 — batched follow-ups

Each is a separate reviewable batch with its own verification:

1. **Canonical autosave engine** — single hook (`useSingleFlightDraft`) with monotonic revisions, coalescing queue, hashed-token storage keys, dirty-safe hydration, deferred-promise race tests. Migrate contract/template/survey/program-setup surfaces one at a time.
2. **Survey reliability** — archive-not-delete, server-side campaign snapshot validation, respondent-role check inside `submit_survey_responses`, autosave, mobile scroll safety.
3. **RLS & role hardening** — additive migration flipping `TO public` → `TO authenticated` on private policies, `REVOKE EXECUTE ... FROM anon, PUBLIC` on role/staff helpers, backoffice↔staff reconciliation, pgTAP role matrix.
4. **Data/journey defects** — ecosystem cursor fix, mentor impact metrics, chat newest-first + atomic get-or-create, smart-import transactional RPC, CRM blob cleanup on failure.
5. **Quality/a11y/perf** — route-level lazy loading only (no manualChunks), version.json generated in `dist/`, language-selector aria-label, remaining a11y sweeps.

## What I will not do

- Touch already-applied migrations.
- Change the acceleration (weeks/gates) vs incubation (stages/playbooks) split.
- Run destructive SQL against production.
- Claim "done" without the exact verification output.

## After Phase 0 lands

I'll report: files changed, `deno check`/`tsc`/`bun run build` output, and a GO/NO-GO for Phase 0 only, then ask before starting Phase 1.
