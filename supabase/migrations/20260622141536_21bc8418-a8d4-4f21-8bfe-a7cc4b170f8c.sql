DROP POLICY IF EXISTS "Workspace members can view documents" ON storage.objects;

CREATE POLICY "Workspace members can view documents"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'workspace-documents'
    AND public.has_workspace_access(((storage.foldername(name))[1])::uuid)
    AND (
      public.is_staff()
      OR public.has_role(auth.uid(), 'backoffice'::public.app_role)
      OR NOT EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.file_path = storage.objects.name
          AND d.visibility = 'private_staff'
      )
    )
  );