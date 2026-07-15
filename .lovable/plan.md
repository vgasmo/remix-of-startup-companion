# Startup Leiria — Tomorrow Import (Plan)

## Blocker before commit
The upload package **does not include the 47 packaged PDFs** (`PHC_*.pdf`). Only the 6 CSVs are present under `/mnt/user-uploads/`. The spec requires SHA-256 verification against `source_pdf_sha256`, upload to the private `contract-imports` bucket, and signed-URL preview during canary. **We cannot canary or commit without those 47 PDFs.** Everything else (staging, dry-run reconciliation, programme mapping UI, rollback plumbing) can be built and dry-run today; commit is gated on receiving the PDFs.

Please re-upload the `documents/` folder (47 files named `PHC_<phc_id>__<sha12>.pdf`) or a single zip.

## Current state (what I inspected)
- `src/pages/BulkContractImport.tsx` (812 LOC) + `supabase/functions/bulk-import-extract` + `bulk-import-commit` implement a **single-programme-per-batch** flow (`batch.program_id` required, applied to every row). This violates the "per-service-group mapping" requirement — must be replaced, not reused as-is.
- `bulk_import_batches` / `bulk_import_rows` tables exist; commit path already writes private storage paths, pricing snapshots, and links funnel items. RLS is admin/backoffice-only server-side via service role in the edge function.
- Existing commit is row-transactional but **does not record before/after snapshots or support rollback**; needs additive work.

## Scope of changes

### 1. Schema (additive, reversible)
Migration adds:
- `bulk_import_batches.mapping_mode` (`per_batch` | `per_service`) + `service_program_map jsonb` (`{"Incubação Física": "<uuid>", ...}`).
- `bulk_import_batches.package_manifest jsonb` (CSV rowcounts + PDF hash set) and `dry_run_report jsonb`.
- `bulk_import_rows.before_snapshot jsonb`, `after_snapshot jsonb`, `rollback_state` (`none|committed|rolled_back`), `pdf_verified bool`, `pdf_sha256 text`, `source_case text`, `tomorrow_queue text`, `commit_authorized bool default false`.
- `bulk_import_rollbacks` audit table (batch_id, row_id, actor, undo payload, executed_at).
- GRANTs to `authenticated` + `service_role`; RLS: admin/backoffice only via `has_role`.

### 2. Staging (new edge function `bulk-tomorrow-stage`)
Accepts the 6 CSVs + the 47 PDFs (base64 or pre-signed uploads). Validates:
- `00_MASTER_TOMORROW.csv` = **163** rows; groups by `tomorrow_queue`; expected split **1_READY=45, 2_HELD=25, 3_TRANSFER=2, 4_REVIEW=91** (verified against upload before commit).
- `01_workspaces_ready.csv` = **70**, `02_contracts_ready.csv` = **47**, `03_manual_review.csv` = **116**.
- **0 duplicate PHC IDs** in the auto set.
- Each PDF: recompute SHA-256, must equal `source_pdf_sha256` on the matching contract row; store into private bucket `contract-imports/tomorrow/<batch_id>/PHC_<id>__<sha12>.pdf` (upload deferred until PDFs arrive).
- Persists as a `bulk_import_batches` row with `status='prepared'`, `mapping_mode='per_service'`, `commit_authorized=false` on every child row.
- Never trusts CSV UUIDs — resolves live IDs server-side (order: PHC ID → NIF → HubSpot Company ID → org email → conflict).

### 3. Programme mapping UI (extend `BulkContractImport.tsx`)
Replace single-programme selector with a **per-service-group panel** listing:
- Incubação Física (41) → programme dropdown
- Incubação Virtual (17) → programme dropdown
- Domiciliação (11) → dropdown + explicit prompt "Is Domiciliação a dedicated services programme or should these attach to an existing one?"
- Incubação de Ideias (1) → dropdown

Programmes loaded live from `programs` table; **no auto-create, no invented IDs**. Mapping stored in `service_program_map`; commit blocked until all four groups are mapped.

### 4. Dry-run reconciliation (new function `bulk-tomorrow-dryrun`)
For each row, server-side:
- Resolve funnel item / startup / workspace / contract by canonical identity ladder.
- Compute diff (fill-only-empty, preserve verified values, detect conflicts).
- Verify PDF hash; classify: `will_create | will_fill | will_skip_verified | conflict | blocked`.
- Row-by-row output rendered in a new **Tomorrow tab** grouped by the four queues, with counts and per-row expand (before/after diff, PDF preview via signed URL).
- Report must match the expected numbers from the spec **exactly**; mismatch blocks commit.

### 5. Canary commit (new function `bulk-tomorrow-commit`)
- Accepts array of row IDs + admin idempotency key.
- Refuses rows where `commit_authorized=false` or `tomorrow_queue != 1_READY_*`.
- Each row runs in its own DB transaction: writes `before_snapshot`, performs upserts (never overwrites non-empty verified fields), writes `after_snapshot`, sets `rollback_state='committed'`.
- Never creates users, memberships, invitations, notifications, or automations. New workspaces: `status='imported_unclaimed'`, `needs_onboarding=false`, no members, no consultant.
- Storage upload is idempotent on `(bucket, path)`; re-running produces zero new rows / zero new object versions.

### 6. Rollback (new function `bulk-tomorrow-rollback`)
- Restores each row's `before_snapshot`, deletes objects it created, sets `rollback_state='rolled_back'`, writes to `bulk_import_rollbacks`.
- Verifies restoration by re-diffing against snapshot.

### 7. Founder/mentor isolation check
Automated post-canary probe: fetch canary contracts as anonymous + as a non-related founder role via the RLS-enforced client; must return 0 rows.

## Execution sequence (once PDFs arrive)
1. Run migration.
2. Deploy 3 new edge functions + updated UI.
3. Upload package → stage → dry-run.
4. Verify all expected counts and 0-side-effect assertions.
5. Admin picks 4 programme mappings (with explicit Domiciliação decision).
6. Admin selects **first 5 rows** from `1_READY_WORKSPACE_AND_CONTRACT`, reviews PDFs, sets `commit_authorized=true`.
7. Commit canary → verify in app → rollback → verify restoration → commit canary again → verify idempotent zero-delta.
8. Only then propose GO for the remaining batch (still requires per-row `commit_authorized=true`).

## What I will NOT do
- No user creation, invitations, notifications, automations, onboarding triggers, or workspace memberships.
- No auto-import of `03_manual_review.csv` or `3_RESOLVE_TRANSFER_OR_HISTORY` rows.
- No programme auto-creation, no fuzzy-name matching for commit, no overwriting verified values.
- No commit until dry-run counts match spec exactly and all 47 PDF hashes verify.

## Immediate ask
1. Confirm the plan.
2. Re-upload the 47 `PHC_*.pdf` files (zip is fine) — without them the canary cannot run.
3. Confirm whether Domiciliação should map to a **new dedicated services programme** (which you'd have me create separately, outside this import) or to an existing programme (name it).
