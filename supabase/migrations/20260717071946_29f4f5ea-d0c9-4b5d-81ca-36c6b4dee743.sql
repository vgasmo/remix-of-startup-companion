
-- ============ Phase 5: communication_log external tracking ============
ALTER TABLE public.communication_log
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS original_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS staff_only boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_communication_log_external
  ON public.communication_log(external_source, external_id)
  WHERE external_source IS NOT NULL AND external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_communication_log_original_ts
  ON public.communication_log(original_timestamp)
  WHERE original_timestamp IS NOT NULL;

-- ============ Phase 4: transfer RPC ============
CREATE OR REPLACE FUNCTION public.staff_transfer_workspace_program(
  p_workspace_id uuid,
  p_target_program_id uuid,
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_staff boolean;
  v_ws record;
  v_target record;
  v_source record;
  v_result jsonb;
  v_sessions_count int;
  v_milestones_kept int;
  v_milestones_archived int;
  v_actions_count int;
  v_kpis_count int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT (public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'consultant')) INTO v_is_staff;
  IF NOT v_is_staff THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Lock workspace row
  SELECT * INTO v_ws FROM public.workspaces WHERE id = p_workspace_id FOR UPDATE;
  IF v_ws IS NULL THEN
    RAISE EXCEPTION 'workspace_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_target FROM public.programs WHERE id = p_target_program_id;
  IF v_target IS NULL THEN
    RAISE EXCEPTION 'target_program_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_target.is_active = false THEN
    RAISE EXCEPTION 'target_program_inactive' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_source FROM public.programs WHERE id = v_ws.program_id;

  IF v_ws.program_id = p_target_program_id THEN
    RETURN jsonb_build_object(
      'action', 'noop',
      'reason', 'already_in_target_program',
      'workspace_id', p_workspace_id,
      'program_id', p_target_program_id
    );
  END IF;

  -- Count impacted rows (best effort; tables may not exist on all envs)
  SELECT COUNT(*) INTO v_sessions_count FROM public.sessions WHERE workspace_id = p_workspace_id;
  SELECT COUNT(*) INTO v_actions_count FROM public.action_items WHERE workspace_id = p_workspace_id;
  SELECT COUNT(*) INTO v_kpis_count FROM public.workspace_kpis WHERE workspace_id = p_workspace_id;

  -- Milestones: those linked to source program-specific keys we'd archive vs generic ones we'd keep.
  -- Heuristic: milestones with `program_id = source` are program-scoped; others generic.
  SELECT COUNT(*) INTO v_milestones_archived
    FROM public.milestones
    WHERE workspace_id = p_workspace_id AND program_id IS NOT NULL AND program_id = v_ws.program_id;
  SELECT COUNT(*) INTO v_milestones_kept
    FROM public.milestones
    WHERE workspace_id = p_workspace_id AND (program_id IS NULL OR program_id <> v_ws.program_id);

  v_result := jsonb_build_object(
    'workspace_id', p_workspace_id,
    'from_program', jsonb_build_object('id', v_ws.program_id, 'name', v_source.name, 'type', v_source.program_type),
    'to_program',   jsonb_build_object('id', p_target_program_id, 'name', v_target.name, 'type', v_target.program_type),
    'impact', jsonb_build_object(
      'sessions_preserved', v_sessions_count,
      'actions_preserved', v_actions_count,
      'kpis_preserved', v_kpis_count,
      'milestones_kept', v_milestones_kept,
      'milestones_archived', v_milestones_archived
    ),
    'stage_reset', true,
    'current_week_reset', (v_target.program_type = 'acceleration')
  );

  IF p_dry_run THEN
    RETURN v_result || jsonb_build_object('action', 'preview');
  END IF;

  -- Commit path
  UPDATE public.workspaces
     SET program_id = p_target_program_id,
         stage_id = NULL,
         current_week = CASE WHEN v_target.program_type = 'acceleration' THEN 1 ELSE NULL END,
         updated_at = now()
   WHERE id = p_workspace_id;

  -- Soft-archive program-specific milestones from source program (only if program_id column present)
  BEGIN
    UPDATE public.milestones
       SET archived_at = now()
     WHERE workspace_id = p_workspace_id
       AND program_id IS NOT NULL
       AND program_id = v_ws.program_id
       AND archived_at IS NULL;
  EXCEPTION WHEN undefined_column THEN
    NULL;
  END;

  INSERT INTO public.activity_log(workspace_id, user_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_workspace_id, v_uid, 'workspace.program_transferred', 'workspace', p_workspace_id,
    v_result
  );

  RETURN v_result || jsonb_build_object('action', 'committed');
END;
$$;

REVOKE ALL ON FUNCTION public.staff_transfer_workspace_program(uuid, uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.staff_transfer_workspace_program(uuid, uuid, boolean) TO authenticated;

-- ============ Phase 4: diagnose mismatches ============
CREATE OR REPLACE FUNCTION public.staff_diagnose_program_mismatches()
RETURNS TABLE (
  workspace_id uuid,
  startup_id uuid,
  startup_name text,
  current_program_id uuid,
  current_program_name text,
  contract_program_id uuid,
  contract_program_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'consultant')) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    w.id,
    w.startup_id,
    s.name,
    w.program_id,
    p_curr.name,
    sc.program_id,
    p_contract.name
  FROM public.workspaces w
  LEFT JOIN public.startups s ON s.id = w.startup_id
  LEFT JOIN public.programs p_curr ON p_curr.id = w.program_id
  LEFT JOIN public.startup_contracts sc
    ON sc.startup_id = w.startup_id
   AND sc.status = 'active'
   AND sc.terminated_at IS NULL
  LEFT JOIN public.programs p_contract ON p_contract.id = sc.program_id
  WHERE sc.program_id IS NOT NULL
    AND sc.program_id <> w.program_id
    AND (w.archived_at IS NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.staff_diagnose_program_mismatches() FROM public;
GRANT EXECUTE ON FUNCTION public.staff_diagnose_program_mismatches() TO authenticated;
