-- Restrict pricing rate card visibility to staff/backoffice only.
DROP POLICY IF EXISTS "Authenticated users can read pricing lines" ON public.pricing_lines;
DROP POLICY IF EXISTS "Authenticated users can read complementary services" ON public.complementary_services;
DROP POLICY IF EXISTS "Authenticated users can read pricing versions" ON public.pricing_table_versions;

CREATE POLICY "Staff can read pricing lines"
  ON public.pricing_lines FOR SELECT
  TO authenticated
  USING (is_staff() OR is_backoffice());

CREATE POLICY "Staff can read complementary services"
  ON public.complementary_services FOR SELECT
  TO authenticated
  USING (is_staff() OR is_backoffice());

CREATE POLICY "Staff can read pricing versions"
  ON public.pricing_table_versions FOR SELECT
  TO authenticated
  USING (is_staff() OR is_backoffice());