-- Phase 4 — atomic get-or-create for 1:1 conversations.
--
-- Before: every call to create_conversation() inserted a new conversation
-- row, so rapid double-clicks / two tabs / stale UI produced duplicate
-- direct-message threads between the same two users. Users complained they
-- "lost" earlier messages when a second thread was created.
--
-- After: for a strict 1:1 (exactly one other participant), we first look
-- up an existing non-group conversation with the exact participant set
-- {caller, other} scoped to the same workspace_id (NULL matches NULL).
-- If found, return its id. Otherwise insert as before.
-- Groups (>=2 other participants) always create fresh rows.

CREATE OR REPLACE FUNCTION public.create_conversation(
  participant_ids uuid[],
  _title text DEFAULT NULL,
  _workspace_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_conv_id uuid;
  v_is_group boolean;
  v_participant uuid;
  v_other_id uuid;
  v_other_count int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Count distinct non-null non-self participants to decide 1:1 vs group.
  SELECT COUNT(DISTINCT p)::int
    INTO v_other_count
    FROM unnest(COALESCE(participant_ids, ARRAY[]::uuid[])) AS p
   WHERE p IS NOT NULL AND p <> v_user_id;

  v_is_group := v_other_count > 1;

  -- ─── 1:1 get-or-create ───
  -- If exactly one other participant, try to find an existing 1:1
  -- conversation between {caller, other} in the same workspace scope.
  IF v_other_count = 1 THEN
    SELECT DISTINCT p
      INTO v_other_id
      FROM unnest(participant_ids) AS p
     WHERE p IS NOT NULL AND p <> v_user_id
     LIMIT 1;

    SELECT c.id
      INTO v_conv_id
      FROM public.conversations c
     WHERE COALESCE(c.is_group, false) = false
       AND c.workspace_id IS NOT DISTINCT FROM _workspace_id
       AND EXISTS (
         SELECT 1 FROM public.conversation_participants cp
          WHERE cp.conversation_id = c.id AND cp.user_id = v_user_id
       )
       AND EXISTS (
         SELECT 1 FROM public.conversation_participants cp
          WHERE cp.conversation_id = c.id AND cp.user_id = v_other_id
       )
       AND (
         SELECT COUNT(*) FROM public.conversation_participants cp
          WHERE cp.conversation_id = c.id
       ) = 2
     ORDER BY c.created_at ASC
     LIMIT 1;

    IF v_conv_id IS NOT NULL THEN
      RETURN v_conv_id;
    END IF;
  END IF;

  -- ─── Fresh insert path ───
  INSERT INTO public.conversations (title, workspace_id, is_group)
  VALUES (_title, _workspace_id, v_is_group)
  RETURNING id INTO v_conv_id;

  -- Always add creator.
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES (v_conv_id, v_user_id)
  ON CONFLICT DO NOTHING;

  -- Add other participants (dedupe + exclude creator).
  IF participant_ids IS NOT NULL THEN
    FOREACH v_participant IN ARRAY participant_ids LOOP
      IF v_participant IS NULL OR v_participant = v_user_id THEN
        CONTINUE;
      END IF;
      INSERT INTO public.conversation_participants (conversation_id, user_id)
      VALUES (v_conv_id, v_participant)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;

  RETURN v_conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_conversation(uuid[], text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_conversation(uuid[], text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_conversation(uuid[], text, uuid) TO authenticated;