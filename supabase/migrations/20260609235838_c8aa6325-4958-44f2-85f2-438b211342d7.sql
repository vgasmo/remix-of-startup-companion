DROP POLICY IF EXISTS "Workspace members and staff can read engagement events" ON public.workspace_engagement_events;
DROP POLICY IF EXISTS "Authenticated users can insert their own engagement events" ON public.workspace_engagement_events;

CREATE POLICY "Workspace members and staff can read engagement events"
  ON public.workspace_engagement_events FOR SELECT TO authenticated
  USING (
    public.has_workspace_access(auth.uid(), workspace_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'consultor'::app_role)
  );

CREATE POLICY "Authenticated users can insert their own engagement events"
  ON public.workspace_engagement_events FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND (
      public.has_workspace_access(auth.uid(), workspace_id)
      OR public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'consultor'::app_role)
    )
  );