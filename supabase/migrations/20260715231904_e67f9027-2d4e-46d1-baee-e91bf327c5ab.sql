-- Release-hardening follow-up: distinct atomic RPCs for the two remaining
-- terminal transitions from scheduled|in_progress. Mirrors the shape and
-- guarantees of complete_session_atomic. Reuses the existing
-- sessions.completion_idempotency_key column as the terminal-transition
-- idempotency slot (a session can only reach ONE terminal state).

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

-- 1) cancel_session_atomic ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_session_atomic(
  p_session_id      uuid,
  p_workspace_id    uuid,
  p_reason          text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_status       text;
  v_workspace    uuid;
  v_existing_key uuid;
  v_is_staff     boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE = '22023';
  END IF;

  v_is_staff := public.has_role(v_uid, 'admin'::app_role)
             OR public.has_role(v_uid, 'consultor'::app_role);
  IF NOT v_is_staff THEN
    RAISE EXCEPTION 'forbidden_not_staff' USING ERRCODE = '42501';
  END IF;

  SELECT status, workspace_id, completion_idempotency_key
    INTO v_status, v_workspace, v_existing_key
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_workspace IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'workspace_mismatch' USING ERRCODE = '42501';
  END IF;

  -- Idempotent replay: same key → return current truth.
  IF v_existing_key IS NOT NULL AND v_existing_key = p_idempotency_key THEN
    RETURN jsonb_build_object(
      'session_id', p_session_id,
      'workspace_id', p_workspace_id,
      'status', v_status,
      'idempotent_replay', true
    );
  END IF;

  IF v_status IS DISTINCT FROM 'scheduled' AND v_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'invalid_transition_from_%', v_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.sessions
     SET status                     = 'cancelled',
         cancellation_reason        = COALESCE(NULLIF(trim(p_reason), ''), cancellation_reason),
         completion_idempotency_key = p_idempotency_key,
         updated_at                 = now()
   WHERE id = p_session_id;

  INSERT INTO public.activity_log (user_id, workspace_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_uid, p_workspace_id, 'cancelled', 'session', p_session_id,
    jsonb_build_object('reason', p_reason, 'idempotency_key', p_idempotency_key)
  );

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'workspace_id', p_workspace_id,
    'status', 'cancelled',
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_session_atomic(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_session_atomic(uuid, uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.cancel_session_atomic(uuid, uuid, text, uuid) IS
  'Atomic session cancellation: locks the row, validates transition + workspace + staff role, idempotent per key.';

-- 2) mark_session_no_show_atomic ---------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_session_no_show_atomic(
  p_session_id      uuid,
  p_workspace_id    uuid,
  p_notes           text,
  p_idempotency_key uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_status       text;
  v_workspace    uuid;
  v_existing_key uuid;
  v_is_staff     boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE = '22023';
  END IF;

  v_is_staff := public.has_role(v_uid, 'admin'::app_role)
             OR public.has_role(v_uid, 'consultor'::app_role);
  IF NOT v_is_staff THEN
    RAISE EXCEPTION 'forbidden_not_staff' USING ERRCODE = '42501';
  END IF;

  SELECT status, workspace_id, completion_idempotency_key
    INTO v_status, v_workspace, v_existing_key
  FROM public.sessions
  WHERE id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'session_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_workspace IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'workspace_mismatch' USING ERRCODE = '42501';
  END IF;

  IF v_existing_key IS NOT NULL AND v_existing_key = p_idempotency_key THEN
    RETURN jsonb_build_object(
      'session_id', p_session_id,
      'workspace_id', p_workspace_id,
      'status', v_status,
      'idempotent_replay', true
    );
  END IF;

  IF v_status IS DISTINCT FROM 'scheduled' AND v_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'invalid_transition_from_%', v_status USING ERRCODE = '22023';
  END IF;

  UPDATE public.sessions
     SET status                     = 'no_show',
         notes                      = COALESCE(NULLIF(trim(p_notes), ''), notes),
         completion_idempotency_key = p_idempotency_key,
         updated_at                 = now()
   WHERE id = p_session_id;

  INSERT INTO public.activity_log (user_id, workspace_id, action, entity_type, entity_id, metadata)
  VALUES (
    v_uid, p_workspace_id, 'no_show', 'session', p_session_id,
    jsonb_build_object('notes', p_notes, 'idempotency_key', p_idempotency_key)
  );

  RETURN jsonb_build_object(
    'session_id', p_session_id,
    'workspace_id', p_workspace_id,
    'status', 'no_show',
    'idempotent_replay', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mark_session_no_show_atomic(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_session_no_show_atomic(uuid, uuid, text, uuid) TO authenticated;

COMMENT ON FUNCTION public.mark_session_no_show_atomic(uuid, uuid, text, uuid) IS
  'Atomic no-show transition: locks the row, validates transition + workspace + staff role, idempotent per key.';