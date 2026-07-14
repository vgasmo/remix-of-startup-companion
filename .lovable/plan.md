# HubSpot Importer — Correction Plan

## Goal
Replace the current client-side, email-only, direct-write HubSpot importer with a staged, server-side, idempotent, feature-flagged job pipeline. The live production data is not touched during rollout; the legacy path stays behind a flag until pilot passes.

## Confirmed defects (recap, mapped to code)
- Email-only DB matching in `AdminDataImport.tsx` (`existingEmailMap`, `in('contact_email', emails)`); NIF/HubSpot IDs collected but unused.
- HubSpot IDs stored in `notes` string → no idempotency.
- `config.create_workspaces` not respected; `create_draft_contracts` defaults to true.
- Tier A/B/C/qualified auto-mapped to `contracted` in `mapHubSpotStage`.
- Existing-row updates use `config.default_stage` instead of `finalStage`.
- Owners never updated on existing rows; new sector/type tags never merged.
- Startup/workspace/link/contract writes are client-side, sequential, non-transactional; several errors are logged and ignored.
- Draft contracts get `start_date = today` and base fee with no human verification.
- UI advertises `.xls`, but `excelParser.ts` is JSZip-only (XLSX/XLSM). Reads only the first sheet; inline-string handling incomplete.
- Preview capped ~100 rows; no persistent/resumable job; no exception report.

## Target architecture

### Additive database (migrations, workspace-safe)
- `data_import_jobs` (source, filename, file_hash, status, config_json, counts_json, created_by, approved_by, timestamps).
- `data_import_rows` (job_id, row_number, raw_json, normalized_json, row_hash, proposed_action, match_entity_type, match_entity_id, match_method, confidence, validation_errors_json, approval_state, commit_result_json).
- `external_entity_refs` (provider, object_type, external_id, internal_entity_type, internal_entity_id, UNIQUE(provider,object_type,external_id)).
- All tables: GRANTs to authenticated + service_role; RLS: staff-read/insert; admin-only approve/commit; row-level `has_role`.
- Backfill helper migration to populate `external_entity_refs` from any HubSpot IDs already in `funnel_items.notes` (best-effort, non-destructive).

### Edge functions
- `prepare-hubspot-import` — staff-only; validates extension/MIME/magic bytes/size/row count; parses CSV or real XLSX; accepts explicit column mapping; normalizes NIF/email/phone/company/HubSpot IDs; runs canonical match engine; persists every row and outcome; NEVER writes to `funnel_items`/`startups`/`workspaces`/`startup_contracts`.
- `commit-hubspot-import` — admin-only; iterates `approved` rows in bounded batches (e.g. 50); each row atomic via `rpc` (SQL function that INSERT/UPDATE + external_ref upsert in one transaction, with row_hash check for staleness); records committed result; safe to resume; never overwrites non-empty authoritative fields unless the approved diff says so.
- `export-import-exceptions` — full CSV/XLSX of all rows for the job.

### Canonical matching engine (shared by prepare + commit)
Order, stop on deterministic:
1. Exact `hubspot_deal_id` via `external_entity_refs` → auto.
2. `hubspot_company_id` + program → auto only if exactly one candidate.
3. Normalized NIF + program → auto only if exactly one.
4. Normalized email + program → suggested (needs preview).
5. Normalized company name → suggestion only, never auto.
Multiple candidates → `conflict/manual_review`. Match records the target `updated_at`; commit re-checks it and marks row `stale` if changed.

### Entity rules
- CRM/funnel imported first.
- Startup creation only when `create_startups=true` AND no safe match; workspace only when `create_workspaces=true` AND program valid AND no existing startup+program workspace.
- Defaults: `create_workspaces=false`, `create_draft_contracts=false`.
- Contracts: no auto-creation from HubSpot data; produce `contract_import_proposal` row (stored in `data_import_rows.commit_result_json` and a lightweight review queue) with `status=needs_review`. Never infer signed/start/end/fee/rep/office. Never duplicate existing draft/active/signed contract for same startup+program.
- Configurable stage mapping (JSON in job config). Remove hard-coded Tier→contracted.
- Consultants resolved via HubSpot owner ID → email → `profiles.email` (exact). No first-name fuzzy.
- Buildings/services resolved through explicit mapping tables (reuse existing `buildings`, add `hubspot_import_mappings` name→id per program); unresolved → review.
- Fix existing-record updates: use `finalStage`; merge tags via set union with approved additions; update owner when approved mapping resolves it.

### Parser fixes (`src/lib/excelParser.ts`)
- Remove `.xls` from accepted MIME/extension list in UI (keep CSV + XLSX/XLSM).
- Read all sheets; user selects sheet during column mapping.
- Correct inline-string (`<is><t>`) and rich-text handling; keep shared-strings path.
- Stream large files where possible; hard row cap with clear error.

### UX (5 steps, preserving four visual anchors + new mapping)
`Upload → Column Mapping → Reconciliation → Approval/Commit → Results`.
- Row cards show match reason + confidence + before/after diff.
- Filter chips: insert / update / conflict / invalid / skipped.
- Independent toggles per row: CRM item, startup, workspace, contract-proposal.
- Downloadable exception report (CSV+XLSX).
- Persistent banner: "No contracts are activated or signed by this import".
- Batch rollback: for a job, reverse inserts (delete) and revert updates using `commit_result_json.before` snapshot; only where safe (no downstream references).

### Permissions
- Prepare: `staff` or new `data_steward` role.
- Commit / approve / rollback: `admin` only.
- Contract proposals, consultant assignment, office occupation: require staff approval flag.
- RLS matrix tests: admin, backoffice, consultor, founder, mentor, anon.

## Feature-flag rollout
- Flag: `hubspot_importer_v2` (global, default off).
- Route `/admin/data-import` renders v2 UI when flag on; else legacy component untouched.
- Legacy direct-write path stays intact for rollback.

## Tests
Vitest for parser + matching engine + normalizers; edge-function tests (Deno) for prepare/commit idempotency; RLS tests via SQL role-switching.
Test cases: reimport same file → 0 duplicates; changed email but same deal ID → same match; NIF-only match; same email across two companies → conflict; one company, many deals → all preserved; unknown owner/stage/building/service → review; concurrent prepare → no duplicates (rely on `external_entity_refs` UNIQUE); row failure → row-level rollback; existing contracts never duplicated/overwritten; CSV quoting/accents/localized headers/inline strings/large/malformed files.
Dry-run counts must equal commit decisions when no data changed between prepare and commit.

## Rollout
1. Ship migrations + edge functions + v2 UI behind flag (default off).
2. Enable flag for one admin in an isolated workspace; import a small sample; compare manually.
3. Pilot on 10–20 startups; review exception report; check DB diffs.
4. Only after pilot GO: enable flag globally.
5. Real production HubSpot import is **NOT** executed in this implementation.

## Deliverables at end
- Migration list, files changed, test evidence (typecheck, lint, vitest, i18n parity, RLS tests, desktop/mobile smoke).
- Pilot instructions.
- Residual risks.
- Explicit IMPORTER GO / NO-GO verdict.

## Technical notes
- Row hash: SHA-256 of canonical JSON of normalized payload; used for idempotency + stale detection.
- File hash: SHA-256 of upload; reject re-upload with same hash within a job unless `force=true`.
- All prepare/commit writes via `service_role` inside edge functions (never client-side supabase mutations for import).
- i18n: add `dataImport.v2.*` keys in en.json + pt.json with parity.
- Preserve `notify.*` toast conventions and workspace query keys.

## Scope boundaries
- Not touching legacy `AdminDataImport.tsx` behavior when flag is off.
- Not implementing a real binary XLS parser now — UI drops `.xls`.
- Not exposing importer to non-staff roles.
- Not auto-activating any contract, ever.
