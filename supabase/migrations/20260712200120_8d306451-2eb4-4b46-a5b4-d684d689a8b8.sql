-- Storage bypass fix (workspace_documents_private_staff_bypass)
-- Two permissive SELECT policies were OR'd together. The stricter one filters
-- private_staff visibility; the redundant one didn't. Drop the redundant one.
DROP POLICY IF EXISTS "Users can view documents in their workspaces" ON storage.objects;