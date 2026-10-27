CREATE OR REPLACE FUNCTION public.staff_mark_funnel_item_contracted(p_funnel_item_id uuid, p_program_id uuid, p_stage text DEFAULT 'ideation')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_item public.funnel_items%ROWTYPE;
  v_result jsonb;
  v_workspace uuid;
  v_description text;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.is_staff() OR public.is_backoffice())
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'approved') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_item FROM public.funnel_items WHERE id = p_funnel_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'funnel_item_not_found' USING ERRCODE = 'P0002'; END IF;
  IF p_program_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.programs WHERE id = p_program_id AND is_active = true) THEN
    RAISE EXCEPTION 'active_program_required' USING ERRCODE = '22023';
  END IF;
  IF p_stage NOT IN ('ideation','validation','mvp','growth','scale') OR p_stage IS NULL THEN
    RAISE EXCEPTION 'invalid_startup_stage' USING ERRCODE = '22023';
  END IF;
  -- An existing contract/workspace is authoritative: do not mint a duplicate.
  IF v_item.linked_workspace_id IS NULL THEN
    SELECT workspace_id INTO v_workspace FROM public.startup_contracts
    WHERE workspace_id IS NOT NULL AND archived_at IS NULL
      AND (id = v_item.linked_contract_id OR funnel_item_id = v_item.id)
    ORDER BY (id IS NOT DISTINCT FROM v_item.linked_contract_id) DESC, created_at DESC LIMIT 1;
    IF v_workspace IS NOT NULL THEN
      UPDATE public.funnel_items SET linked_workspace_id = v_workspace,
        linked_startup_id = (SELECT startup_id FROM public.workspaces WHERE id = v_workspace)
      WHERE id = v_item.id;
    END IF;
  END IF;
  v_description := concat_ws(E'\n\n', NULLIF(v_item.notes, ''),
    CASE WHEN v_item.metadata_json->>'sector' IS NOT NULL THEN 'Sector: ' || (v_item.metadata_json->>'sector') END,
    CASE WHEN v_item.metadata_json->>'vertical' IS NOT NULL THEN 'Vertical: ' || (v_item.metadata_json->>'vertical') END,
    NULLIF(v_item.metadata_json->>'help_expectation',''), NULLIF(v_item.metadata_json->>'personal_intro',''));
  v_result := public.staff_convert_funnel_item_to_startup(
    p_funnel_item_id => p_funnel_item_id, p_program_id => p_program_id, p_stage => p_stage,
    p_project_name => NULLIF(v_item.metadata_json->>'project_name',''),
    p_description => NULLIF(v_description,''),
    p_health_notes => concat_ws(E'\n\n', NULLIF(v_item.source,''), NULLIF(v_description,'')),
    p_inferred_stage => p_stage);
  v_workspace := (v_result->>'workspace_id')::uuid;
  -- Commercial attestation is NOT signature evidence. Do not activate or sign any contract.
  UPDATE public.funnel_items SET stage = 'contracted', type = 'startup_active',
    program_id = (SELECT program_id FROM public.workspaces WHERE id = v_workspace),
    converted_at = COALESCE(converted_at, now()), updated_at = now() WHERE id = v_item.id;
  -- Link, rather than copy, history so the CRM record and workspace see the same records.
  UPDATE public.communication_log SET workspace_id = v_workspace
    WHERE funnel_item_id = v_item.id AND workspace_id IS NULL;
  INSERT INTO public.funnel_events(funnel_item_id,event_type,from_stage,to_stage,performed_by,metadata)
    SELECT v_item.id,'stage_changed',v_item.stage,'contracted',auth.uid(),
      jsonb_build_object('workspace_id',v_workspace,'conversion_source','staff_contracted')
    WHERE v_item.stage IS DISTINCT FROM 'contracted';
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.staff_mark_funnel_item_contracted(uuid,uuid,text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.staff_mark_funnel_item_contracted(uuid,uuid,text) TO authenticated;