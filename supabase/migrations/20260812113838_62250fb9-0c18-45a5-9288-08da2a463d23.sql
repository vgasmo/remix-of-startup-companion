-- ============================================================
-- 1) Function search_path hardening (project-owned function)
-- ============================================================
ALTER FUNCTION public.normalize_ident(text) SET search_path = public;

-- ============================================================
-- 2) Remove anonymous (public role) read access on internal config tables.
--    Equivalent 'authenticated' SELECT policies already exist, so signed-in
--    behaviour is unchanged.
-- ============================================================
DROP POLICY IF EXISTS "Anyone can view metric mappings" ON public.financial_model_metric_map;
DROP POLICY IF EXISTS "Anyone can view quality config" ON public.quality_checks_config;
DROP POLICY IF EXISTS "Everyone can view KPI definitions" ON public.kpi_definitions;
DROP POLICY IF EXISTS "Everyone can view stage KPI defaults" ON public.stage_kpi_defaults;

-- tag_categories: only anon-readable SELECT policy on that table -> re-scope to authenticated
DROP POLICY IF EXISTS tag_categories_select_all ON public.tag_categories;
CREATE POLICY tag_categories_select_all
  ON public.tag_categories FOR SELECT TO authenticated
  USING (true);

-- Re-scope management policies from the catch-all 'public' role to 'authenticated'.
-- The predicates (is_admin()/is_staff()/consultor) already evaluate false for anon;
-- this removes the misleading 'Applies to: {public}' surface.
DROP POLICY IF EXISTS "Admin and consultors can manage metric mappings" ON public.financial_model_metric_map;
CREATE POLICY "Admin and consultors can manage metric mappings"
  ON public.financial_model_metric_map FOR ALL TO authenticated
  USING (is_admin() OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'consultor'::app_role));

DROP POLICY IF EXISTS "Admin and consultors can manage readiness items" ON public.investor_readiness_items;
CREATE POLICY "Admin and consultors can manage readiness items"
  ON public.investor_readiness_items FOR ALL TO authenticated
  USING (is_admin() OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'consultor'::app_role));

DROP POLICY IF EXISTS "Admin can manage KPI definitions" ON public.kpi_definitions;
CREATE POLICY "Admin can manage KPI definitions"
  ON public.kpi_definitions FOR ALL TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Consultors can manage KPI definitions" ON public.kpi_definitions;
CREATE POLICY "Consultors can manage KPI definitions"
  ON public.kpi_definitions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'consultor'::app_role));

DROP POLICY IF EXISTS "Admins can manage quality config" ON public.quality_checks_config;
CREATE POLICY "Admins can manage quality config"
  ON public.quality_checks_config FOR ALL TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Admins can manage stage KPI defaults" ON public.stage_kpi_defaults;
CREATE POLICY "Admins can manage stage KPI defaults"
  ON public.stage_kpi_defaults FOR ALL TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Admin can manage stages" ON public.stages;
CREATE POLICY "Admin can manage stages"
  ON public.stages FOR ALL TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS tag_categories_insert_staff ON public.tag_categories;
CREATE POLICY tag_categories_insert_staff
  ON public.tag_categories FOR INSERT TO authenticated
  WITH CHECK (is_staff());

DROP POLICY IF EXISTS tag_categories_update_staff ON public.tag_categories;
CREATE POLICY tag_categories_update_staff
  ON public.tag_categories FOR UPDATE TO authenticated
  USING (is_staff());

DROP POLICY IF EXISTS tag_categories_delete_staff ON public.tag_categories;
CREATE POLICY tag_categories_delete_staff
  ON public.tag_categories FOR DELETE TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Authenticated users can create tags" ON public.tags;
CREATE POLICY "Authenticated users can create tags"
  ON public.tags FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Revoke leftover anon table grants on these config tables.
REVOKE SELECT ON public.financial_model_metric_map FROM anon;
REVOKE SELECT ON public.quality_checks_config FROM anon;
REVOKE SELECT ON public.kpi_definitions FROM anon;
REVOKE SELECT ON public.stage_kpi_defaults FROM anon;
REVOKE SELECT ON public.stages FROM anon;
REVOKE SELECT ON public.tags FROM anon;
REVOKE SELECT ON public.tag_categories FROM anon;
REVOKE SELECT ON public.investor_readiness_items FROM anon;

-- ============================================================
-- 3) template_assets storage bucket: staff-only reads.
--    Only the export-financial-model edge function (service role) reads this
--    bucket; no client path depends on broad authenticated reads.
-- ============================================================
DROP POLICY IF EXISTS "Auth can read template asset objects" ON storage.objects;
CREATE POLICY "Staff can read template asset objects"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'template_assets'
    AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'consultor'::app_role))
  );

-- ============================================================
-- 4) profiles_safe: replace the SECURITY DEFINER view with a
--    security_invoker view over a guarded SECURITY DEFINER function.
--    Visibility rules and PII masking are byte-for-byte identical.
-- ============================================================
CREATE OR REPLACE FUNCTION public.safe_profiles()
RETURNS TABLE (
  id uuid,
  full_name text,
  avatar_url text,
  bio text,
  expertise text[],
  email text,
  phone text,
  linkedin_url text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id,
         p.full_name,
         p.avatar_url,
         p.bio,
         p.expertise,
         CASE WHEN auth.uid() = p.id OR public.is_staff() THEN p.email END AS email,
         CASE WHEN auth.uid() = p.id OR public.is_staff() THEN p.phone END AS phone,
         CASE WHEN auth.uid() = p.id OR public.is_staff() THEN p.linkedin_url END AS linkedin_url,
         p.created_at,
         p.updated_at
    FROM public.profiles p
   WHERE auth.uid() IS NOT NULL
     AND (
       auth.uid() = p.id
       OR public.is_staff()
       OR EXISTS (
         SELECT 1
           FROM public.workspace_users a
           JOIN public.workspace_users b ON a.workspace_id = b.workspace_id
          WHERE a.user_id = auth.uid() AND a.active
            AND b.user_id = p.id AND b.active
       )
     );
$$;

REVOKE ALL ON FUNCTION public.safe_profiles() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.safe_profiles() TO authenticated, service_role;

CREATE OR REPLACE VIEW public.profiles_safe
WITH (security_invoker = true, security_barrier = true) AS
SELECT id, full_name, avatar_url, bio, expertise, email, phone, linkedin_url, created_at, updated_at
FROM public.safe_profiles();

REVOKE ALL ON public.profiles_safe FROM anon;
GRANT SELECT ON public.profiles_safe TO authenticated, service_role;