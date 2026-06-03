
-- 1. Pricing catalog: allow authenticated users to read
CREATE POLICY "Authenticated users can read pricing versions"
  ON public.pricing_table_versions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can read pricing lines"
  ON public.pricing_lines FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can read complementary services"
  ON public.complementary_services FOR SELECT
  TO authenticated USING (true);

-- 2. contract-documents bucket: add UPDATE policy for staff
CREATE POLICY "Staff can update contract documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'contract-documents'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = ANY (ARRAY['admin'::public.app_role, 'consultor'::public.app_role, 'backoffice'::public.app_role])
    )
  )
  WITH CHECK (
    bucket_id = 'contract-documents'
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = ANY (ARRAY['admin'::public.app_role, 'consultor'::public.app_role, 'backoffice'::public.app_role])
    )
  );

-- 3. startup-documents bucket: add explicit INSERT/UPDATE/DELETE scoped to startup managers
CREATE POLICY "Startup managers can upload startup documents"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'startup-documents'
    AND public.can_manage_startup(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Startup managers can update startup documents"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'startup-documents'
    AND public.can_manage_startup(((storage.foldername(name))[1])::uuid)
  )
  WITH CHECK (
    bucket_id = 'startup-documents'
    AND public.can_manage_startup(((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "Startup managers can delete startup documents"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'startup-documents'
    AND public.can_manage_startup(((storage.foldername(name))[1])::uuid)
  );
