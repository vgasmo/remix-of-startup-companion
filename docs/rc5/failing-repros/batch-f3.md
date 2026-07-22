# Batch F3 — source landed 2026-07-22

Draft: `docs/rc5/drafts/2026-07-22_batch-f3_import_dedupe.sql`.
pgTAP: `supabase/tests/crm_import_dedupe.test.sql`.

- `normalize_ident(text)` IMMUTABLE: trim, lower, strip whitespace, strip
  Latin diacritics.
- `funnel_items.{nif,email,company}_normalized` STORED generated columns +
  partial unique indexes scoped to `stage <> 'archived'` — imports can no
  longer create duplicate active leads by fiddling casing/whitespace.
- `crm_import_conflicts` table + staff-only RLS + status enum
  `pending|merged|ignored|created_new` gives ops a resolvable queue instead
  of silent auto-merge.
- `crm_lead_import_batches.lifecycle_state` state machine —
  `draft → committing → committed | partial_needs_review | failed` —
  driven by `finalize_crm_import_batch(batch)` so an incomplete batch is
  no longer labelled `committed`.

Runtime proof gate: staging replay + real-CSV smoke — `NOT PROVEN`.
