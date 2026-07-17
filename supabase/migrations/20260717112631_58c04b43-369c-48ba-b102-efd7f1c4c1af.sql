CREATE OR REPLACE FUNCTION public.complete_milestone_with_actions(_workspace_id uuid, _milestone_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_closed_count integer := 0;
BEGIN
  IF NOT public.can_write_workspace(_workspace_id) THEN
    RAISE EXCEPTION 'Not allowed to update this workspace' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.milestones
    WHERE id = _milestone_id
      AND workspace_id = _workspace_id
  ) THEN
    RAISE EXCEPTION 'Milestone not found in workspace' USING ERRCODE = 'P0002';
  END IF;

  WITH updated_actions AS (
    UPDATE public.action_items
    SET status = 'completed',
        completed_at = now()
    WHERE workspace_id = _workspace_id
      AND milestone_id = _milestone_id
      AND status NOT IN ('completed', 'cancelled')
    RETURNING id
  )
  SELECT count(*) INTO v_closed_count FROM updated_actions;

  UPDATE public.milestones
  SET status = 'completed',
      completed_at = now()
  WHERE id = _milestone_id
    AND workspace_id = _workspace_id;

  RETURN v_closed_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.complete_milestone_with_actions(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_milestone_with_actions(uuid, uuid) TO service_role;