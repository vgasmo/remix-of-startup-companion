
DROP POLICY IF EXISTS "Users can manage their own time entries" ON public.time_entries;

CREATE POLICY "Users can manage their own time entries"
ON public.time_entries
FOR ALL
TO authenticated
USING (
  auth.uid() = user_id
  AND public.has_workspace_access(workspace_id)
)
WITH CHECK (
  auth.uid() = user_id
  AND public.has_workspace_access(workspace_id)
);
