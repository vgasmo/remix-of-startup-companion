-- Tighten workspace-documents storage policies to use can_write_workspace
-- so read-only members (e.g. mentor_externo without write rights) cannot upload/overwrite files.

DROP POLICY IF EXISTS "Users can upload documents to their workspaces" ON storage.objects;
CREATE POLICY "Users can upload documents to their workspaces"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'workspace-documents'
  AND public.can_write_workspace(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "Users can update documents in their workspaces" ON storage.objects;
CREATE POLICY "Users can update documents in their workspaces"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'workspace-documents'
  AND public.can_write_workspace(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "Workspace members can update documents" ON storage.objects;
CREATE POLICY "Workspace members can update documents"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'workspace-documents'
  AND public.can_write_workspace(((storage.foldername(name))[1])::uuid)
);

DROP POLICY IF EXISTS "Workspace members can upload documents" ON storage.objects;
CREATE POLICY "Workspace members can upload documents"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'workspace-documents'
  AND public.can_write_workspace(((storage.foldername(name))[1])::uuid)
);