CREATE OR REPLACE FUNCTION public.get_or_create_workspace_conversation(_workspace_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_conv_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id required';
  END IF;
  IF NOT public.has_workspace_access(v_user_id, _workspace_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('workspace_conv:' || _workspace_id::text, 0));

  SELECT id INTO v_conv_id
    FROM public.conversations
   WHERE workspace_id = _workspace_id
     AND COALESCE(is_group, false) = true
     AND title IS NULL
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.conversations (workspace_id, is_group, title)
    VALUES (_workspace_id, true, NULL)
    RETURNING id INTO v_conv_id;
  END IF;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  SELECT v_conv_id, wu.user_id
    FROM public.workspace_users wu
   WHERE wu.workspace_id = _workspace_id AND wu.active = true
  ON CONFLICT DO NOTHING;

  -- Staff with workspace access (consultor/admin not in workspace_users) must
  -- also be a participant, otherwise RLS blocks reading and sending messages.
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conv_id, v_user_id)
  ON CONFLICT DO NOTHING;

  RETURN v_conv_id;
END;
$function$;