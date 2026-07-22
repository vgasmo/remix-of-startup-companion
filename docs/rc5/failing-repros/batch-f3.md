# Batch F3 — CRM Import Reconciliation (FAILING REPRO)

Source: `crm_lead_import_batches`, `crm_lead_import_rows`,
`bulk_import_*`, `funnel_items`, `startups`, `workspaces`.

## Defects

1. Import RPC does not enforce role + batch ownership inside the
   function body — relies on RLS only.
2. No explicit target owner or audited routing on imported leads.
3. Atomicity is per-row; failures leave a "partially committed" batch
   with no distinguishing state.
4. Batch is labelled `committed` while some rows remain stranded.
5. Dedupe on NIF / email / company is not normalized (trim, lowercase,
   strip diacritics).
6. No human conflict-resolution queue for near-duplicates.
7. Auto-creates active workspaces and contracts from uncertain rows.

## Required outcome

- All-or-explicit-partial semantics with a distinct
  `partial_needs_review` state.
- Normalized dedupe columns + partial unique indexes.
- Conflict queue table `crm_import_conflicts` with staff resolution
  UI.
- Never auto-create active workspace/contract without staff approve.

## Next action

Draft `docs/rc5/drafts/2026-07-22_batch-f3_import_dedupe.sql`.
