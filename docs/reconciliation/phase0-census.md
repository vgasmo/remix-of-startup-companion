# Phase 0 — Live Read-Only Census

Ran against production (no writes). Full raw output: `/mnt/documents/reconciliation/phase0-census.txt`; per-row CSVs at `funnel_items_full.csv` and `batch_3dd77436_rows.csv`.

## Headline numbers

| Entity | Count | Notes |
|---|---:|---|
| `funnel_items` total | **214** | 202 have `phc_customer_id` |
| `funnel_items` with `linked_startup_id` | **0** | none wired |
| `funnel_items` with `linked_workspace_id` | **0** | none wired |
| `funnel_items` with `linked_contract_id` | 2 | pre-existing manual links |
| `funnel_items` orphan (no startup + no workspace) | 214 | all of them |
| `startups` total | 36 | pre-existing, unrelated to PHC import |
| `workspaces` active / archived / claimed | 31 / 2 / 1 | 34 total |
| workspaces with `program_id` set | 34 | Programa Base 18, Leiria Experience Lab 16 |

**Interpretation.** The prior bulk-import runs never reached the "link funnel → startup → workspace" step. No phantom startups, no phantom workspaces, no debris to clean up. This is a green field for the reconciler.

## Funnel stage distribution

| stage | count |
|---|---:|
| incubating | 187 |
| contracted | 17 |
| archived | 5 |
| intake_requested | 3 |
| sent_for_signature | 1 |
| rejected | 1 |

`187 incubating + 15 (contracted+intake_requested+sent_for_signature that map to active service)` aligns with the historical "187 incubation + 15 domiciliation ≈ 202" pattern, though the exact domiciliation split is not tagged on `funnel_items` and must come from PHC service.

## Duplicates

- **PHC ID:** 0 duplicates in `funnel_items`.
- **NIF (normalized):** 0 duplicates.
- **HubSpot company id:** 0 duplicates.
- **Contact email (lower/trim):** 2 collisions — `daniel@oceancapital.tech` (×2), `luiscoutf@gmail.com` (×2). Both are contact-level collisions, not organization identity; needs manual-review flag.

## Batch `3dd77436-e63e-43d7-b607-75cf9bfed953`

- Batch `status='review'`, `mapping_mode='per_service'`, **`program_id` NULL**, **`service_program_map = {}`**. No dry-run report recorded.
- 47 rows, all `status='pending'`, all `selected=true`, all `committed_at IS NULL`, all `error_message` empty.
- `commit_authorized`: **5 true** (the canary flagged last turn) / 42 false.
- Service distribution: Incubação Física 29, Incubação Virtual 12, Domiciliação 5, Incubação de Ideias 1.
- `edited_json.programme_mapping.program_id` is already populated on all 47 rows (all pointing at `55cb559a…` = "Programa Base"). This is the extractor's default and needs re-review before commit — Leiria Experience Lab (`70b25196…`) is never selected, and Domiciliação has no dedicated programme.

## Schema state vs. plan Phase 1c

Already present in prod (no migration needed):
- `funnel_items.phc_customer_id`, `hubspot_company_id`, `nif_normalized`, `verified_fields_json`.
- `bulk_import_rows.before_snapshot`, `after_snapshot`, `rollback_state`, `pdf_verified`, `pdf_sha256`, `commit_authorized`, `commit_idempotency_key`, `committed_at`, `service_group`, `tomorrow_queue`, `source_case`.
- `bulk_import_batches.mapping_mode`, `service_program_map`, `dry_run_report`.

Missing, will need additive migration:
- `workspaces.engagement_state` (enum: prospect/active/paused/churned/service_only).
- `workspaces.service_classification` (enum: founder_journey/domiciliacao/mixed).
- `startups.phc_customer_id text UNIQUE`, `startups.nif_normalized text`.
- Reconciler tables (`reconciler_batches/rows/rollbacks`) — or reuse `bulk_import_*` with an added `kind` discriminator. Recommend the latter to avoid schema sprawl; the columns are already sufficient.
- Postgres RPC `reconcile_active_customer(...)`.

## Universe derivation

**Bulk-import batch (47 signed contracts)** is a *subset* of the true target universe, not the whole thing. The 214 `funnel_items` (202 with PHC id) is the actual population. Derived split before any commit:

- Founder-journey candidates: 214 − 5 archived − 1 rejected − Domiciliação-only = **≈ 193** (final number falls out of the reconciler once service classification lands per row).
- Service-only (Domiciliação): count comes from PHC service field, not the CRM stage — the current data does not carry this on `funnel_items`.

**No forced target of 180.** We derive it.

## Blockers still open before I can proceed to Phase 1 code

1. **Source-of-truth PHC extract** — the reconciler needs a canonical PHC "active customers by service" file. The CSV under `/mnt/user-uploads/` is the malformed one. Please re-upload the original PHC XLSX/CSV, or authorize me to pull via the PHC connector.
2. **Domiciliação default** — treat all 15 as `service_only` (no founder workspace, no playbook, no members) unless flagged otherwise per row? Confirm.
3. **Programme mapping** — Leiria Experience Lab vs. Programa Base default is unclear. All 47 canary rows currently map to "Programa Base" because the extractor hardcoded it. Confirm the mapping table:
   - Incubação Física → ?
   - Incubação Virtual → ?
   - Incubação de Ideias → ?
   - Domiciliação → ? (or `service_only`, no programme)
4. **GO to proceed with Phase 1 code+migration once (1)–(3) are answered.**
