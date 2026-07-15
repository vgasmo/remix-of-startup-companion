
-- =========================================================================
-- Phase 0: system_settings kill switch, service_programme_map, census_reports
-- =========================================================================

-- ---------- system_settings ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  description text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system_settings_admin_all" ON public.system_settings;
CREATE POLICY "system_settings_admin_all"
  ON public.system_settings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "system_settings_staff_read" ON public.system_settings;
CREATE POLICY "system_settings_staff_read"
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'consultor'));

CREATE OR REPLACE FUNCTION public.system_settings_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.updated_by IS NULL THEN
    NEW.updated_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_system_settings_touch ON public.system_settings;
CREATE TRIGGER trg_system_settings_touch
  BEFORE INSERT OR UPDATE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.system_settings_touch_updated_at();

-- Seed the reconciler kill switch as read-only.
INSERT INTO public.system_settings (key, value, description)
VALUES (
  'reconciler.write_mode',
  jsonb_build_object('enabled', false, 'reason', 'phase_0_freeze'),
  'When enabled=true, reconciler-run may accept commit calls. Absent/false locks writes.'
)
ON CONFLICT (key) DO NOTHING;

-- ---------- service_programme_map ---------------------------------------
CREATE TABLE IF NOT EXISTS public.service_programme_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL UNIQUE,
  service_name_normalized text GENERATED ALWAYS AS (lower(btrim(service_name))) STORED,
  service_classification text NOT NULL
    CHECK (service_classification IN ('founder_journey','domiciliacao','mixed','service_only')),
  programme_id uuid REFERENCES public.programs(id) ON DELETE RESTRICT,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Founder-journey and mixed customers require an explicit programme.
  CONSTRAINT service_programme_required
    CHECK (
      service_classification NOT IN ('founder_journey','mixed')
      OR programme_id IS NOT NULL
    )
);

CREATE INDEX IF NOT EXISTS idx_service_programme_map_normalized
  ON public.service_programme_map (service_name_normalized);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_programme_map TO authenticated;
GRANT ALL ON public.service_programme_map TO service_role;

ALTER TABLE public.service_programme_map ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_programme_map_admin_all" ON public.service_programme_map;
CREATE POLICY "service_programme_map_admin_all"
  ON public.service_programme_map
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "service_programme_map_staff_read" ON public.service_programme_map;
CREATE POLICY "service_programme_map_staff_read"
  ON public.service_programme_map
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'consultor'));

-- History table (audit)
CREATE TABLE IF NOT EXISTS public.service_programme_map_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  map_id uuid,
  service_name text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  before_snapshot jsonb,
  after_snapshot jsonb,
  actor uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_programme_map_history_map_id
  ON public.service_programme_map_history (map_id, changed_at DESC);

GRANT SELECT, INSERT ON public.service_programme_map_history TO authenticated;
GRANT ALL ON public.service_programme_map_history TO service_role;

ALTER TABLE public.service_programme_map_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_programme_map_history_admin_read" ON public.service_programme_map_history;
CREATE POLICY "service_programme_map_history_admin_read"
  ON public.service_programme_map_history
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "service_programme_map_history_service_insert" ON public.service_programme_map_history;
CREATE POLICY "service_programme_map_history_service_insert"
  ON public.service_programme_map_history
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.service_programme_map_audit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.service_programme_map_history (map_id, service_name, operation, after_snapshot, actor)
    VALUES (NEW.id, NEW.service_name, 'INSERT', to_jsonb(NEW), auth.uid());
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
    NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.service_programme_map_history (map_id, service_name, operation, before_snapshot, after_snapshot, actor)
    VALUES (NEW.id, NEW.service_name, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW), auth.uid());
    NEW.updated_by := auth.uid();
    NEW.updated_at := now();
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.service_programme_map_history (map_id, service_name, operation, before_snapshot, actor)
    VALUES (OLD.id, OLD.service_name, 'DELETE', to_jsonb(OLD), auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_service_programme_map_audit_ins ON public.service_programme_map;
CREATE TRIGGER trg_service_programme_map_audit_ins
  BEFORE INSERT ON public.service_programme_map
  FOR EACH ROW EXECUTE FUNCTION public.service_programme_map_audit();

DROP TRIGGER IF EXISTS trg_service_programme_map_audit_upd ON public.service_programme_map;
CREATE TRIGGER trg_service_programme_map_audit_upd
  BEFORE UPDATE ON public.service_programme_map
  FOR EACH ROW EXECUTE FUNCTION public.service_programme_map_audit();

DROP TRIGGER IF EXISTS trg_service_programme_map_audit_del ON public.service_programme_map;
CREATE TRIGGER trg_service_programme_map_audit_del
  AFTER DELETE ON public.service_programme_map
  FOR EACH ROW EXECUTE FUNCTION public.service_programme_map_audit();

-- ---------- census_reports ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.census_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at timestamptz NOT NULL DEFAULT now(),
  phc_extract_object_path text,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  duplicates jsonb NOT NULL DEFAULT '{}'::jsonb,
  service_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  workspace_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  csv_object_path text,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_census_reports_generated_at
  ON public.census_reports (generated_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.census_reports TO authenticated;
GRANT ALL ON public.census_reports TO service_role;

ALTER TABLE public.census_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "census_reports_admin_all" ON public.census_reports;
CREATE POLICY "census_reports_admin_all"
  ON public.census_reports
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ---------- helper: check reconciler write mode from the DB -------------
CREATE OR REPLACE FUNCTION public.reconciler_write_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (value->>'enabled')::boolean
       FROM public.system_settings
       WHERE key = 'reconciler.write_mode'),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.reconciler_write_enabled() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconciler_write_enabled() TO authenticated, service_role;
