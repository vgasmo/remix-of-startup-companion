-- Bulk contract import hardening:
-- 1) Programme assignment at the batch level (no orphan workspaces).
-- 2) Store the canonical private storage path on contracts (not a fake public URL).
-- 3) Idempotency for re-runs of the same contract_number on the same workspace.

-- 1) Programme on batches
ALTER TABLE public.bulk_import_batches
  ADD COLUMN IF NOT EXISTS program_id UUID REFERENCES public.programs(id) ON DELETE SET NULL;

-- 2) Canonical private path on contracts
ALTER TABLE public.startup_contracts
  ADD COLUMN IF NOT EXISTS contract_pdf_path TEXT;

COMMENT ON COLUMN public.startup_contracts.contract_pdf_path IS
  'Private storage path inside the contract-documents (or contract-imports) bucket. Use createSignedUrl on demand. Never expose as a public URL.';

-- 3) Prevent duplicates on commit retries.
-- Partial unique index: same contract_number on same workspace cannot exist twice.
-- NULL contract_number is allowed multiple times (legacy / drafts).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_startup_contracts_workspace_number
  ON public.startup_contracts (workspace_id, contract_number)
  WHERE contract_number IS NOT NULL;