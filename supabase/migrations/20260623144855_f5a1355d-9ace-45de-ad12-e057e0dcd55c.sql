
CREATE TABLE public.template_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL DEFAULT 'general', -- 'action_item' | 'dataroom_item' | 'general'
  context_ref TEXT,            -- action_item_id / dataroom category / deliverable key
  context_label TEXT,          -- human label of the request
  title TEXT NOT NULL,
  description TEXT,
  attachment_url TEXT,         -- optional founder upload (file path in storage)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','fulfilled','rejected')),
  admin_note TEXT,
  fulfilled_template_id UUID REFERENCES public.templates(id) ON DELETE SET NULL,
  resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_template_requests_workspace ON public.template_requests(workspace_id);
CREATE INDEX idx_template_requests_status ON public.template_requests(status);
CREATE INDEX idx_template_requests_requested_by ON public.template_requests(requested_by);

GRANT SELECT, INSERT, UPDATE ON public.template_requests TO authenticated;
GRANT ALL ON public.template_requests TO service_role;

ALTER TABLE public.template_requests ENABLE ROW LEVEL SECURITY;

-- Requester can see and create their own requests
CREATE POLICY "requester can read own template requests"
  ON public.template_requests FOR SELECT
  TO authenticated
  USING (requested_by = auth.uid());

CREATE POLICY "requester can insert own template requests"
  ON public.template_requests FOR INSERT
  TO authenticated
  WITH CHECK (requested_by = auth.uid());

-- Workspace members can read requests for their workspace
CREATE POLICY "workspace members can read template requests"
  ON public.template_requests FOR SELECT
  TO authenticated
  USING (
    workspace_id IS NOT NULL
    AND public.has_workspace_access(workspace_id, auth.uid())
  );

-- Staff (admin or consultor) can read and update all
CREATE POLICY "staff can read all template requests"
  ON public.template_requests FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'consultor'::app_role)
  );

CREATE POLICY "staff can update template requests"
  ON public.template_requests FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'consultor'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'consultor'::app_role)
  );

CREATE TRIGGER update_template_requests_updated_at
  BEFORE UPDATE ON public.template_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
