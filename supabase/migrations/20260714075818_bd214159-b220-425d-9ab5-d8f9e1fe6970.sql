
-- ---- 1. data_import_jobs -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_hash TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  counts_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  prepared_at TIMESTAMPTZ,
  committed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_data_import_jobs_status ON public.data_import_jobs(status);
CREATE INDEX IF NOT EXISTS idx_data_import_jobs_created_by ON public.data_import_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_data_import_jobs_file_hash ON public.data_import_jobs(file_hash);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_import_jobs TO authenticated;
GRANT ALL ON public.data_import_jobs TO service_role;
ALTER TABLE public.data_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY dij_staff_read ON public.data_import_jobs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice') OR public.has_role(auth.uid(),'consultor'));
CREATE POLICY dij_staff_insert ON public.data_import_jobs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'));
CREATE POLICY dij_staff_update ON public.data_import_jobs
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'));
CREATE POLICY dij_admin_delete ON public.data_import_jobs
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public._touch_data_import_jobs()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_touch_data_import_jobs ON public.data_import_jobs;
CREATE TRIGGER trg_touch_data_import_jobs BEFORE UPDATE ON public.data_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public._touch_data_import_jobs();

-- ---- 2. data_import_rows -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.data_import_jobs(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_json JSONB NOT NULL,
  normalized_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  row_hash TEXT NOT NULL,
  proposed_action TEXT NOT NULL DEFAULT 'insert',
  match_entity_type TEXT,
  match_entity_id UUID,
  match_method TEXT,
  match_confidence NUMERIC(4,3),
  match_snapshot_updated_at TIMESTAMPTZ,
  validation_errors_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  approval_state TEXT NOT NULL DEFAULT 'pending',
  approve_toggles_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  commit_result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, row_number)
);
CREATE INDEX IF NOT EXISTS idx_dir_job ON public.data_import_rows(job_id);
CREATE INDEX IF NOT EXISTS idx_dir_state ON public.data_import_rows(approval_state);
CREATE INDEX IF NOT EXISTS idx_dir_action ON public.data_import_rows(proposed_action);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.data_import_rows TO authenticated;
GRANT ALL ON public.data_import_rows TO service_role;
ALTER TABLE public.data_import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY dir_staff_read ON public.data_import_rows
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice') OR public.has_role(auth.uid(),'consultor'));
CREATE POLICY dir_staff_insert ON public.data_import_rows
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'));
CREATE POLICY dir_staff_update ON public.data_import_rows
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'));
CREATE POLICY dir_admin_delete ON public.data_import_rows
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public._touch_data_import_rows()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_touch_data_import_rows ON public.data_import_rows;
CREATE TRIGGER trg_touch_data_import_rows BEFORE UPDATE ON public.data_import_rows
  FOR EACH ROW EXECUTE FUNCTION public._touch_data_import_rows();

-- ---- 3. external_entity_refs --------------------------------------------
CREATE TABLE IF NOT EXISTS public.external_entity_refs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  object_type TEXT NOT NULL,
  external_id TEXT NOT NULL,
  internal_entity_type TEXT NOT NULL,
  internal_entity_id UUID NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, object_type, external_id)
);
CREATE INDEX IF NOT EXISTS idx_eer_internal ON public.external_entity_refs(internal_entity_type, internal_entity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_entity_refs TO authenticated;
GRANT ALL ON public.external_entity_refs TO service_role;
ALTER TABLE public.external_entity_refs ENABLE ROW LEVEL SECURITY;

CREATE POLICY eer_auth_read ON public.external_entity_refs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY eer_staff_insert ON public.external_entity_refs
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'));
CREATE POLICY eer_staff_update ON public.external_entity_refs
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'backoffice'));
CREATE POLICY eer_admin_delete ON public.external_entity_refs
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public._touch_external_entity_refs()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_touch_external_entity_refs ON public.external_entity_refs;
CREATE TRIGGER trg_touch_external_entity_refs BEFORE UPDATE ON public.external_entity_refs
  FOR EACH ROW EXECUTE FUNCTION public._touch_external_entity_refs();

-- ---- 4. Feature flag -----------------------------------------------------
INSERT INTO public.feature_flags (key, enabled, scope, description)
SELECT 'hubspot_importer_v2', false, 'global', 'Enable HubSpot Importer v2 (staged, server-side, idempotent).'
WHERE NOT EXISTS (
  SELECT 1 FROM public.feature_flags WHERE key = 'hubspot_importer_v2' AND scope = 'global'
);

-- ---- 5. Best-effort backfill of external_entity_refs --------------------
DO $$
DECLARE r RECORD; deal TEXT; company TEXT; contact TEXT;
BEGIN
  FOR r IN
    SELECT id, notes FROM public.funnel_items
    WHERE notes ILIKE '%HubSpot Deal ID%' OR notes ILIKE '%HubSpot Company ID%' OR notes ILIKE '%HubSpot Contact ID%'
  LOOP
    deal    := (regexp_match(r.notes, 'HubSpot Deal ID:\s*([0-9A-Za-z_-]+)'))[1];
    company := (regexp_match(r.notes, 'HubSpot Company ID:\s*([0-9A-Za-z_-]+)'))[1];
    contact := (regexp_match(r.notes, 'HubSpot Contact ID:\s*([0-9A-Za-z_-]+)'))[1];
    IF deal IS NOT NULL THEN
      INSERT INTO public.external_entity_refs(provider,object_type,external_id,internal_entity_type,internal_entity_id)
      VALUES ('hubspot','deal',deal,'funnel_item',r.id) ON CONFLICT DO NOTHING;
    END IF;
    IF company IS NOT NULL THEN
      INSERT INTO public.external_entity_refs(provider,object_type,external_id,internal_entity_type,internal_entity_id)
      VALUES ('hubspot','company',company,'funnel_item',r.id) ON CONFLICT DO NOTHING;
    END IF;
    IF contact IS NOT NULL THEN
      INSERT INTO public.external_entity_refs(provider,object_type,external_id,internal_entity_type,internal_entity_id)
      VALUES ('hubspot','contact',contact,'funnel_item',r.id) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;
