
CREATE TABLE public.founder_staff_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL CHECK (request_type IN ('iban_change','address_change','legal_rep_change','company_data_change','contact_change','other')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved','rejected')),
  staff_notes TEXT,
  resolved_by UUID REFERENCES auth.users(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_founder_staff_requests_workspace ON public.founder_staff_requests(workspace_id);
CREATE INDEX idx_founder_staff_requests_status ON public.founder_staff_requests(status);
CREATE INDEX idx_founder_staff_requests_created_by ON public.founder_staff_requests(created_by);

GRANT SELECT, INSERT, UPDATE ON public.founder_staff_requests TO authenticated;
GRANT ALL ON public.founder_staff_requests TO service_role;

ALTER TABLE public.founder_staff_requests ENABLE ROW LEVEL SECURITY;

-- Founders can insert requests for workspaces they belong to
CREATE POLICY "Members can create requests"
ON public.founder_staff_requests FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = created_by
  AND public.has_workspace_access(workspace_id, auth.uid())
);

-- View: creator, workspace members, or staff
CREATE POLICY "View own requests or as staff"
ON public.founder_staff_requests FOR SELECT
TO authenticated
USING (
  created_by = auth.uid()
  OR public.has_workspace_access(workspace_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'consultor')
  OR public.has_role(auth.uid(), 'backoffice')
);

-- Update: only staff
CREATE POLICY "Staff can update requests"
ON public.founder_staff_requests FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'consultor')
  OR public.has_role(auth.uid(), 'backoffice')
);

CREATE TRIGGER update_founder_staff_requests_updated_at
BEFORE UPDATE ON public.founder_staff_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
