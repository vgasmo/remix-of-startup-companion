-- Phase 4 batch 2 — atomic get-or-create for workspace chat conversations.
--
-- Before: ChatTab did SELECT then INSERT client-side. Two users opening the
-- workspace chat concurrently could each miss the row and each create a new
-- conversation, splitting messages across duplicate threads.
--
-- After: a single SECURITY DEFINER RPC that (a) takes an advisory lock keyed
-- on the workspace id, (b) returns the existing shared workspace conversation
-- if one exists (is_group=true, title IS NULL), (c) otherwise inserts a new
-- row, and (d) syncs all active workspace members as participants.

-- ─── Deduplicate any pre-existing duplicates before enforcing uniqueness ───
-- Keep the oldest shared workspace conversation per workspace; move any
-- messages from duplicates onto the keeper, then delete the duplicates.
DO $$
DECLARE
  r record;
  keeper_id uuid;
BEGIN
  FOR r IN
    SELECT workspace_id
      FROM public.conversations
     WHERE workspace_id IS NOT NULL
       AND COALESCE(is_group, false) = true
       AND title IS NULL
     GROUP BY workspace_id
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO keeper_id
      FROM public.conversations
     WHERE workspace_id = r.workspace_id
       AND COALESCE(is_group, false) = true
       AND title IS NULL
     ORDER BY created_at ASC
     LIMIT 1;

    -- Repoint messages and participants to the keeper, ignoring conflicts.
    UPDATE public.messages m
       SET conversation_id = keeper_id
     WHERE m.conversation_id IN (
       SELECT id FROM public.conversations
        WHERE workspace_id = r.workspace_id
          AND COALESCE(is_group, false) = true
          AND title IS NULL
          AND id <> keeper_id
     );

    INSERT INTO public.conversation_participants (conversation_id, user_id)
    SELECT keeper_id, cp.user_id
      FROM public.conversation_participants cp
      JOIN public.conversations c ON c.id = cp.conversation_id
     WHERE c.workspace_id = r.workspace_id
       AND COALESCE(c.is_group, false) = true
       AND c.title IS NULL
       AND c.id <> keeper_id
    ON CONFLICT DO NOTHING;

    DELETE FROM public.conversation_participants
     WHERE conversation_id IN (
       SELECT id FROM public.conversations
        WHERE workspace_id = r.workspace_id
          AND COALESCE(is_group, false) = true
          AND title IS NULL
          AND id <> keeper_id
     );

    DELETE FROM public.conversations
     WHERE workspace_id = r.workspace_id
       AND COALESCE(is_group, false) = true
       AND title IS NULL
       AND id <> keeper_id;
  END LOOP;
END $$;

-- ─── Enforce single shared workspace chat per workspace ───
CREATE UNIQUE INDEX IF NOT EXISTS conversations_workspace_shared_uniq
  ON public.conversations (workspace_id)
  WHERE workspace_id IS NOT NULL
    AND COALESCE(is_group, false) = true
    AND title IS NULL;

-- ─── Atomic RPC ───
CREATE OR REPLACE FUNCTION public.get_or_create_workspace_conversation(
  _workspace_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Caller must have workspace access (staff-or-member).
  IF NOT public.has_workspace_access(v_user_id, _workspace_id) THEN
    RAISE EXCEPTION 'Forbidden' USING ERRCODE = '42501';
  END IF;

  -- Serialize concurrent get-or-create on the same workspace.
  PERFORM pg_advisory_xact_lock(
    hashtextextended('workspace_conv:' || _workspace_id::text, 0)
  );

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

  -- Sync active workspace members as participants (idempotent).
  INSERT INTO public.conversation_participants (conversation_id, user_id)
  SELECT v_conv_id, wu.user_id
    FROM public.workspace_users wu
   WHERE wu.workspace_id = _workspace_id
     AND wu.active = true
  ON CONFLICT DO NOTHING;

  RETURN v_conv_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_or_create_workspace_conversation(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_or_create_workspace_conversation(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_or_create_workspace_conversation(uuid) TO authenticated;