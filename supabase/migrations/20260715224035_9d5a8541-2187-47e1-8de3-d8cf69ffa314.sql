
CREATE TABLE public.startup_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  startup_id uuid REFERENCES public.startups(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text NOT NULL,
  current_value_json jsonb,
  requested_value_json jsonb NOT NULL,
  justification text,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_notes text,
  applied_at timestamptz,
  applied_automatically boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT startup_change_requests_target_chk CHECK (workspace_id IS NOT NULL OR startup_id IS NOT NULL),
  CONSTRAINT startup_change_requests_status_chk CHECK (status IN ('pending','approved','rejected','cancelled')),
  CONSTRAINT startup_change_requests_field_chk CHECK (field_key IN (
    'name','website','phone','address','nif',
    'main_contact_name','main_contact_email','main_contact_phone',
    'iban','bank_name','swift_bic',
    'legal_representative','shareholders','cap_table','other'
  ))
);

CREATE INDEX idx_scr_workspace ON public.startup_change_requests(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX idx_scr_startup ON public.startup_change_requests(startup_id) WHERE startup_id IS NOT NULL;
CREATE INDEX idx_scr_status_pending ON public.startup_change_requests(status) WHERE status = 'pending';
CREATE INDEX idx_scr_requested_by ON public.startup_change_requests(requested_by);

GRANT SELECT, INSERT, UPDATE ON public.startup_change_requests TO authenticated;
GRANT ALL ON public.startup_change_requests TO service_role;

ALTER TABLE public.startup_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "scr_select_workspace_or_staff"
ON public.startup_change_requests
FOR SELECT TO authenticated
USING (
  is_admin()
  OR has_role(auth.uid(), 'consultor'::app_role)
  OR has_role(auth.uid(), 'backoffice'::app_role)
  OR (workspace_id IS NOT NULL AND has_workspace_access(workspace_id))
  OR requested_by = auth.uid()
);

CREATE POLICY "scr_insert_by_founder"
ON public.startup_change_requests
FOR INSERT TO authenticated
WITH CHECK (
  requested_by = auth.uid()
  AND (
    (workspace_id IS NOT NULL AND has_workspace_access(workspace_id))
    OR is_admin()
  )
);

CREATE POLICY "scr_update_owner_cancel"
ON public.startup_change_requests
FOR UPDATE TO authenticated
USING (requested_by = auth.uid() AND status = 'pending')
WITH CHECK (requested_by = auth.uid() AND status IN ('pending','cancelled'));

CREATE POLICY "scr_update_admin"
ON public.startup_change_requests
FOR UPDATE TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

CREATE TRIGGER trg_scr_updated_at
BEFORE UPDATE ON public.startup_change_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.approve_startup_change_request(_request_id uuid, _notes text DEFAULT NULL)
RETURNS public.startup_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.startup_change_requests;
  target_startup uuid;
  new_val text;
  applied boolean := false;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can approve change requests';
  END IF;

  SELECT * INTO req FROM public.startup_change_requests WHERE id = _request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF req.status <> 'pending' THEN RAISE EXCEPTION 'Request is not pending (status=%)', req.status; END IF;

  target_startup := req.startup_id;
  IF target_startup IS NULL AND req.workspace_id IS NOT NULL THEN
    SELECT startup_id INTO target_startup FROM public.workspaces WHERE id = req.workspace_id;
  END IF;

  new_val := CASE
    WHEN jsonb_typeof(req.requested_value_json) = 'string' THEN req.requested_value_json #>> '{}'
    ELSE req.requested_value_json::text
  END;

  IF target_startup IS NOT NULL AND req.field_key IN (
    'name','website','phone','address','nif',
    'main_contact_name','main_contact_email','main_contact_phone'
  ) THEN
    EXECUTE format('UPDATE public.startups SET %I = $1, updated_at = now() WHERE id = $2', req.field_key)
    USING new_val, target_startup;
    applied := true;
  END IF;

  UPDATE public.startup_change_requests
  SET status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = COALESCE(_notes, review_notes),
      applied_at = CASE WHEN applied THEN now() ELSE applied_at END,
      applied_automatically = applied
  WHERE id = _request_id
  RETURNING * INTO req;

  INSERT INTO public.activity_log (workspace_id, user_id, action, entity_type, entity_id, details)
  VALUES (
    req.workspace_id,
    auth.uid(),
    'startup_change_request.approved',
    'startup_change_request',
    req.id,
    jsonb_build_object('field_key', req.field_key, 'applied_automatically', applied)
  );

  RETURN req;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_startup_change_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_startup_change_request(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_startup_change_request(_request_id uuid, _notes text DEFAULT NULL)
RETURNS public.startup_change_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req public.startup_change_requests;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can reject change requests';
  END IF;

  UPDATE public.startup_change_requests
  SET status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      review_notes = COALESCE(_notes, review_notes)
  WHERE id = _request_id AND status = 'pending'
  RETURNING * INTO req;

  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found or not pending'; END IF;

  INSERT INTO public.activity_log (workspace_id, user_id, action, entity_type, entity_id, details)
  VALUES (
    req.workspace_id,
    auth.uid(),
    'startup_change_request.rejected',
    'startup_change_request',
    req.id,
    jsonb_build_object('field_key', req.field_key, 'notes', _notes)
  );

  RETURN req;
END;
$$;

REVOKE ALL ON FUNCTION public.reject_startup_change_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_startup_change_request(uuid, text) TO authenticated;
