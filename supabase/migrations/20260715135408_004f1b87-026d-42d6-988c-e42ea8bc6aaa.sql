
-- Admin-only access to the new private buckets used by the safe-reconciliation project.

DROP POLICY IF EXISTS "phc_extracts_admin_all" ON storage.objects;
CREATE POLICY "phc_extracts_admin_all"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'phc-extracts' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'phc-extracts' AND public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin_exports_admin_all" ON storage.objects;
CREATE POLICY "admin_exports_admin_all"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (bucket_id = 'admin-exports' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'admin-exports' AND public.has_role(auth.uid(), 'admin'));
