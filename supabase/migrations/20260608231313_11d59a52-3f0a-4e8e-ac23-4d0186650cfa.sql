DROP POLICY IF EXISTS "Workspace members can view documents" ON storage.objects;

CREATE POLICY "Workspace members can view documents"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'workspace-documents'
  AND has_workspace_access(((storage.foldername(name))[1])::uuid)
  AND (
    public.is_staff()
    OR NOT EXISTS (
      SELECT 1
      FROM public.documents d
      WHERE d.file_path = storage.objects.name
        AND d.visibility = 'staff_only'
    )
  )
);