
-- Bulk contract import: batches + rows + storage bucket

CREATE TABLE public.bulk_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','extracting','review','committing','completed','failed')),
  total_files INTEGER NOT NULL DEFAULT 0,
  extracted_count INTEGER NOT NULL DEFAULT 0,
  committed_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.bulk_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.bulk_import_batches(id) ON DELETE CASCADE,
  pdf_path TEXT NOT NULL,
  pdf_filename TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','extracting','extracted','will_create','will_update','committed','skipped','error')),
  extracted_json JSONB,
  edited_json JSONB,
  matched_startup_id UUID REFERENCES public.startups(id) ON DELETE SET NULL,
  matched_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  created_contract_id UUID REFERENCES public.startup_contracts(id) ON DELETE SET NULL,
  match_method TEXT,
  ai_confidence NUMERIC,
  error_message TEXT,
  selected BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bulk_import_rows_batch ON public.bulk_import_rows(batch_id);
CREATE INDEX idx_bulk_import_rows_status ON public.bulk_import_rows(status);
CREATE INDEX idx_bulk_import_batches_creator ON public.bulk_import_batches(created_by);

ALTER TABLE public.bulk_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_import_rows ENABLE ROW LEVEL SECURITY;

-- Admin-only access
CREATE POLICY "Admins manage batches"
  ON public.bulk_import_batches FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins manage rows"
  ON public.bulk_import_rows FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Auto-update timestamps
CREATE TRIGGER set_bulk_import_batches_updated_at
  BEFORE UPDATE ON public.bulk_import_batches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER set_bulk_import_rows_updated_at
  BEFORE UPDATE ON public.bulk_import_rows
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for uploaded PDFs (private, admin-only)
INSERT INTO storage.buckets (id, name, public)
VALUES ('contract-imports', 'contract-imports', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admins read contract-imports"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'contract-imports' AND public.is_admin());

CREATE POLICY "Admins write contract-imports"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'contract-imports' AND public.is_admin());

CREATE POLICY "Admins update contract-imports"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'contract-imports' AND public.is_admin());

CREATE POLICY "Admins delete contract-imports"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'contract-imports' AND public.is_admin());
