
CREATE OR REPLACE FUNCTION public.approve_startup_change_request(_request_id uuid, _notes text DEFAULT NULL::text)
 RETURNS startup_change_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.activity_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (
    req.workspace_id,
    auth.uid(),
    'startup_change_request.approved',
    'startup_change_request',
    req.id,
    jsonb_build_object('field_key', req.field_key, 'applied_automatically', applied, 'notes', _notes)
  );

  RETURN req;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_startup_change_request(_request_id uuid, _notes text DEFAULT NULL::text)
 RETURNS startup_change_requests
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.activity_log (workspace_id, user_id, action, entity_type, entity_id, metadata)
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
$function$;
