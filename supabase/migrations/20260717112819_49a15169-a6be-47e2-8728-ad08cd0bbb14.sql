
CREATE TABLE public.workspace_hidden_canvas_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  canvas_type text NOT NULL,
  hidden_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, canvas_type)
);

GRANT SELECT, INSERT, DELETE ON public.workspace_hidden_canvas_tools TO authenticated;
GRANT ALL ON public.workspace_hidden_canvas_tools TO service_role;

ALTER TABLE public.workspace_hidden_canvas_tools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members can view hidden canvas tools"
ON public.workspace_hidden_canvas_tools FOR SELECT
TO authenticated
USING (public.has_workspace_access(workspace_id));

CREATE POLICY "Staff can hide canvas tools"
ON public.workspace_hidden_canvas_tools FOR INSERT
TO authenticated
WITH CHECK (
  public.has_workspace_access(workspace_id)
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'consultor'))
);

CREATE POLICY "Staff can unhide canvas tools"
ON public.workspace_hidden_canvas_tools FOR DELETE
TO authenticated
USING (
  public.has_workspace_access(workspace_id)
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'consultor'))
);
