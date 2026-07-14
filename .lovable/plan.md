
# PHC + HubSpot CRM Reconciliation Import — Plan

## Scope

CRM-only import. Extends the existing v2 importer infrastructure (`data_import_jobs`, `data_import_rows`, `external_entity_refs`, `prepare-hubspot-import`, `commit-hubspot-import`, `AdminDataImportV2`) to accept the PHC "Clientes por Tipologia" XLSX as a second source alongside HubSpot, using the same staged dry-run → approve → commit pipeline. No workspace / contract / user / invite / notification / automation / playbook / programme side-effects.

## Audit of what exists today

- `data_import_jobs` supports arbitrary `source` (text) — reusable for `'phc'`.
- `data_import_rows` already holds `raw_json`, `normalized_json`, `row_hash`, `proposed_action`, `match_*`, `approval_state`, `commit_result_json`. Idempotency infra is in place.
- `external_entity_refs` unique on `(provider, object_type, external_id)` — reusable for `phc/customer`, `hubspot/deal`, `hubspot/company`.
- `commit_import_funnel_item` RPC upserts funnel items keyed by external refs. Currently HubSpot-specific in shape (writes `hubspot_*` under `metadata_json`); must be widened for PHC identifiers.
- `funnel_items` stores structured IDs only inside `metadata_json`. Per spec these must become first-class columns.
- `prepare-hubspot-import` is HubSpot-only (headers, stage mapping, matcher).
- No PHC parsing or matcher exists.
- No formula-injection sanitisation on preview exports.

## Deliverables

### 1. Schema (single migration)

Add first-class structured identifiers + partial unique indexes on `funnel_items`:

- `phc_customer_id text`
- `hubspot_company_id text`
- `hubspot_deal_id text`
- `nif_normalized text`
- `source_system text` (values: `phc`, `hubspot`, `manual`, `mixed`)
- `source_updated_at timestamptz`
- `verified_fields_json jsonb default '{}'` — records which fields are staff-verified and must not be overwritten.

Partial unique indexes (all `WHERE ... IS NOT NULL`):

- `funnel_items(phc_customer_id)`
- `funnel_items(hubspot_deal_id)`
- `funnel_items(hubspot_company_id)`
- `funnel_items(nif_normalized)`

Backfill: copy existing `metadata_json->>'hubspot_deal_id'`, `->>'hubspot_company_id'`, `->>'nif'` into the new columns; conflicts logged into `import_backfill_conflicts` (temp table dropped after review — reported in migration output).

RLS/GRANT unchanged (columns inherit table policies).

### 2. RPC changes

Replace `commit_import_funnel_item` with a source-agnostic `commit_import_funnel_item_v2(source, payload, external_ids, verified_fields, expected_updated_at, …)` that:

- Never overwrites a non-empty column listed in `verified_fields_json` unless the approved row diff explicitly sets `override: true`.
- Writes structured `phc_customer_id` / `hubspot_*_id` / `nif_normalized` / `source_system` / `source_updated_at`.
- Upserts one `external_entity_refs` row per supplied external ID inside the same transaction.
- Returns `{action: insert|update|noop, before, after, diff}`.
- Raises `P0003` on stale `expected_updated_at`.

Legacy RPC kept as a thin wrapper for one release cycle.

### 3. Normalisation library

`src/lib/phcNormalize.ts` + mirror in `supabase/functions/_shared/phcImport.ts`:

- `normNifPT` — 9-digit Portuguese NIF with checksum. Foreign identifiers (non-PT country) bypass checksum but are still trimmed/uppercased and stored in `nif_normalized` with a `foreign:` prefix so they can't collide with PT NIFs.
- `normPhone`, `normEmail`, `normCompany` (reuse existing).
- `parsePhcRow` — maps the 15 PHC columns to a canonical payload; preserves original values in `raw_json`; never invents defaults.
- `sanitizePreviewCell` — prefix `'` on any string starting with `= + - @ TAB CR` before writing to XLSX/CSV export (formula-injection guard).

Stage/programme heuristics from PHC are explicitly **not** inferred:

- `Departamento` stored as `phc_department` string tag only.
- `Edifício` stored as `phc_building_hint` string; no mapping to `buildings` table.
- `Serviço` stored as `phc_service_hint` string.
- `Preço a usar em documentos` stored as `phc_price_list_id` — never treated as monthly fee.

### 4. Matching engine (shared, deterministic, stop-on-first)

1. `phc_customer_id` exact → `auto` (confidence 1.0).
2. `nif_normalized` exact → `auto` if exactly one candidate, else `conflict`.
3. `hubspot_deal_id` exact via `external_entity_refs` → `auto`.
4. `hubspot_company_id` exact → `auto` if exactly one candidate.
5. `contact_email` exact normalised → `suggested` (needs approval).
6. `organization_name` normalised exact → `suggested` only, never auto.

Multiple deterministic candidates → `proposed_action = 'conflict'`. Row records match target's `updated_at` for stale-check at commit.

### 5. Edge functions

- **`prepare-phc-import`** — new. Staff/admin/backoffice only (`has_role admin` OR `backoffice`). Accepts XLSX/CSV upload + column mapping + `import_mode` (default `crm_only`, only value accepted for now — other modes rejected 400). Parses PHC sheet, normalises, matches, writes one `data_import_rows` per PHC customer. Rejects rows with duplicate PHC ID inside the same file. **Never** writes to `funnel_items`.
- **`prepare-hubspot-import`** — extended: adopts the new matching engine + widened normalised payload (writes structured IDs), same `crm_only` guard.
- **`commit-hubspot-import`** → renamed logically to **`commit-crm-import`** (kept as an alias route for the HubSpot path). Guards:
  - Reject if `job.config_json.import_mode !== 'crm_only'`.
  - Reject any row whose `commit_result_json.side_effects` is non-empty.
  - Uses `commit_import_funnel_item_v2`; only touches `funnel_items` + `external_entity_refs`.
  - Never enqueues notifications / automations / playbooks / workspace creation.
- **`export-import-exceptions`** — reused, with `sanitizePreviewCell` applied.

All edge functions: admin/backoffice role check via `has_role`; return 403 otherwise. `verify_jwt=false` already the project standard, in-code `getClaims()` validation.

### 6. UI (`AdminDataImportV2`)

- Source picker: **HubSpot** | **PHC (Clientes por Tipologia)**.
- Explicit non-negotiable defaults panel (read-only, shows `crm_only`, all side-effect toggles off, `overwrite_verified_fields=false`). Toggles hidden entirely — spec forbids them.
- Column-mapping step with a preset for the 15 PHC headers.
- Dry-run table with filters: `insert / update / no-change / ambiguous / conflict / invalid`, field-level before/after diff, provenance chip (`phc` / `hubspot`).
- Per-row approve; bulk approve only within a single filter view.
- "Convert validated CRM record to workspace" is a **separate later action** — surfaced as a link that opens a placeholder page explicitly out of scope for this ticket.
- Preview/export CSV/XLSX pass through `sanitizePreviewCell`.

### 7. Tests

- `src/lib/phcNormalize.test.ts` — NIF PT checksum, foreign identifier passthrough, phone/email/whitespace, formula-injection sanitiser, PHC row parser (nulls preserved).
- `src/lib/hubspotNormalize.test.ts` — extended for structured IDs.
- `supabase/functions/_shared/matchEngine.test.ts` (Deno) — priority order, ambiguity → conflict, single-candidate auto, stale detection.
- Idempotency: re-run prepare on same file hash → same row set, zero net changes at commit.
- RLS test: non-admin/non-backoffice call to `prepare-phc-import` returns 403; call to `commit-crm-import` with `import_mode != crm_only` returns 400.
- Side-effect assertion test: after full commit of a sample file, assert `select count(*)` on `workspaces`, `startup_contracts`, `auth.users`, `notifications`, `workspace_invitations`, `staff_tasks`, `workflow_executions`, `workspace_playbook_instances` unchanged versus pre-run snapshot.
- Blank source values do not overwrite non-empty funnel_items columns.
- Partial row failure: one row raises inside the RPC; other rows in batch still commit; failed row marked `failed`.

### 8. Reporting at completion

- Files/migrations changed list.
- Architecture diagram (ASCII) of prepare → dry-run → approve → commit.
- Source-to-field mapping table (PHC column → `funnel_items` column / metadata).
- Dry-run totals by action for a sample of the provided XLSX (run against a scratch job — no commit).
- Conflicts requiring human review, exported as CSV.
- `bun test`, `tsgo`, `vitest`, i18n parity, RLS regression results.
- Explicit statement: zero rows written outside `data_import_jobs`, `data_import_rows`, `external_entity_refs`, `funnel_items` (committed rows only).

## Technical notes

- File hash = SHA-256 of upload; reject re-upload of the same hash in a non-terminal job unless `force=true`.
- Row hash = SHA-256 of canonical JSON of normalised payload; used for idempotency and stale detection.
- All prepare/commit writes via service role inside edge functions; no client-side supabase mutations for import.
- i18n keys under `dataImport.v2.phc.*` in `en.json` + `pt.json` with parity, enforced by existing parity test.
- Feature flag `hubspot_importer_v2` already gates the UI; PHC lives under the same flag (no separate flag).

## Explicit non-goals in this ticket

- No workspace creation, no `startup_contracts` writes, no user provisioning, no invites, no notifications, no automations, no playbook seeding, no programme enrolment.
- No mapping of PHC `Edifício` → `buildings`.
- No interpretation of `Preço a usar em documentos` as fee.
- No fuzzy company-name auto-merge.
- No legacy XLS binary support.

## Rollout

1. Ship migration + edge functions + UI behind existing `hubspot_importer_v2` flag.
2. Run a dry-run against the provided PHC XLSX in a scratch job; export reconciliation report; **do not commit**.
3. Human review of dry-run and conflict CSV.
4. Only after explicit GO from the user, admin approves rows and commits. Even then the commit only touches `funnel_items` + `external_entity_refs`.
