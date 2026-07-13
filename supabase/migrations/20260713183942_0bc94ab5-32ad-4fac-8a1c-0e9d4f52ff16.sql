
CREATE TABLE public.template_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('xlsm_financial','docx_business_plan_pt','docx_business_plan_en')),
  language TEXT NOT NULL CHECK (language IN ('pt','en','xx')),
  schema_version INTEGER NOT NULL DEFAULT 1,
  sha256 TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT false,
  uploaded_by UUID REFERENCES auth.users(id),
  notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX template_assets_active_uniq
  ON public.template_assets(kind, language) WHERE active;
CREATE UNIQUE INDEX template_assets_sha_uniq
  ON public.template_assets(kind, sha256);

GRANT SELECT ON public.template_assets TO authenticated;
GRANT ALL ON public.template_assets TO service_role;
ALTER TABLE public.template_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read template assets"
  ON public.template_assets FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can manage template assets"
  ON public.template_assets FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'consultor'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'consultor'::app_role));

CREATE TRIGGER update_template_assets_updated_at
  BEFORE UPDATE ON public.template_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


CREATE TABLE public.financial_cell_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  sheet TEXT NOT NULL,
  address TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  unit TEXT,
  period_kind TEXT CHECK (period_kind IN ('year','month','quarter','point','range')),
  period_index INTEGER,
  direction TEXT NOT NULL CHECK (direction IN ('input','output')),
  notes JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX financial_cell_map_lookup
  ON public.financial_cell_map(schema_version, sheet, address);
CREATE INDEX financial_cell_map_metric
  ON public.financial_cell_map(schema_version, metric_key, period_index);

GRANT SELECT ON public.financial_cell_map TO authenticated;
GRANT ALL ON public.financial_cell_map TO service_role;
ALTER TABLE public.financial_cell_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read cell map"
  ON public.financial_cell_map FOR SELECT TO authenticated USING (true);

CREATE POLICY "Staff can manage cell map"
  ON public.financial_cell_map FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'consultor'::app_role))
  WITH CHECK (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'consultor'::app_role));

CREATE TRIGGER update_financial_cell_map_updated_at
  BEFORE UPDATE ON public.financial_cell_map
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


ALTER TABLE public.financial_model_versions
  ADD COLUMN IF NOT EXISTS template_schema_version INTEGER,
  ADD COLUMN IF NOT EXISTS parse_status TEXT
    CHECK (parse_status IN ('pending','ok','partial','stale_cache','template_mismatch','failed')),
  ADD COLUMN IF NOT EXISTS coverage_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS parse_warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source_asset_id UUID REFERENCES public.template_assets(id),
  ADD COLUMN IF NOT EXISTS content_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS formula_cache_stale BOOLEAN NOT NULL DEFAULT false;


CREATE POLICY "Auth can read template asset objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'template_assets');

CREATE POLICY "Staff can write template asset objects"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'template_assets'
    AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'consultor'::app_role))
  );

CREATE POLICY "Staff can update template asset objects"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'template_assets'
    AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'consultor'::app_role))
  );

CREATE POLICY "Staff can delete template asset objects"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'template_assets'
    AND (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'consultor'::app_role))
  );
