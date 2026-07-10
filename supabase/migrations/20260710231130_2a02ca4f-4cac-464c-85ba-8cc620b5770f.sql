-- Stream B: Atomic mentor assignment RPC.
-- Guarantees workspace membership + request fulfilment succeed or fail together.

CREATE OR REPLACE FUNCTION public.assign_mentor_request(
  _request_id UUID,
  _mentor_id  UUID
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID;
  v_req RECORD;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT (public.has_role(v_caller, 'admin') OR public.has_role(v_caller, 'backoffice')) THEN
    RAISE EXCEPTION 'Only staff can assign mentors' USING ERRCODE = '42501';
  END IF;

  SELECT id, workspace_id, status
    INTO v_req
    FROM mentor_requests
   WHERE id = _request_id
   FOR UPDATE;

  IF v_req.id IS NULL THEN
    RAISE EXCEPTION 'mentor_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.workspace_id IS NULL THEN
    RAISE EXCEPTION 'legacy_request_needs_manual_workspace' USING ERRCODE = 'P0001';
  END IF;
  IF v_req.status NOT IN ('pending', 'open') THEN
    RAISE EXCEPTION 'mentor_request_not_pending' USING ERRCODE = 'P0001';
  END IF;

  -- Atomic pair: both writes in one function = one transaction. Any raise rolls back both.
  INSERT INTO workspace_users (workspace_id, user_id, role, active)
  VALUES (v_req.workspace_id, _mentor_id, 'mentor_externo', true)
  ON CONFLICT (workspace_id, user_id) DO UPDATE
    SET active = true, role = 'mentor_externo';

  UPDATE mentor_requests
     SET status = 'fulfilled',
         fulfilled_by = v_caller,
         fulfilled_at = now(),
         assigned_mentor_id = _mentor_id,
         updated_at = now()
   WHERE id = _request_id;

  RETURN jsonb_build_object(
    'status', 'assigned',
    'request_id', _request_id,
    'workspace_id', v_req.workspace_id,
    'mentor_id', _mentor_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_mentor_request(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_mentor_request(UUID, UUID) TO authenticated;

COMMENT ON FUNCTION public.assign_mentor_request(UUID, UUID) IS
'Atomic mentor assignment (v4.0): staff-only. Upserts workspace_users + marks mentor_requests fulfilled in a single transaction; rolls back both on any failure.';