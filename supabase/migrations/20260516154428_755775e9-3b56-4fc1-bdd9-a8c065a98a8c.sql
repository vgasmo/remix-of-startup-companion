
-- Batch 1: Add missing contract fields so the UI's visible fields actually persist
ALTER TABLE public.startup_contracts
  ADD COLUMN IF NOT EXISTS legal_representative_phone text,
  ADD COLUMN IF NOT EXISTS certidao_permanente_code text,
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS additional_representatives jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Same for the public intake table (mirrors fields collected pre-contract)
ALTER TABLE public.contract_intakes
  ADD COLUMN IF NOT EXISTS legal_representative_phone text,
  ADD COLUMN IF NOT EXISTS certidao_permanente_code text,
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS additional_representatives jsonb NOT NULL DEFAULT '[]'::jsonb;
