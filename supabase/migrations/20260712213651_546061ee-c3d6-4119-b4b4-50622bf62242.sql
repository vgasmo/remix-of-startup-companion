DROP POLICY IF EXISTS "Users can view their workspaces" ON public.workspaces;
CREATE POLICY "Users can view their workspaces"
ON public.workspaces
FOR SELECT
USING (public.has_workspace_access(id));