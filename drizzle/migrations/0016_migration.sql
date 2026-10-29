CREATE OR REPLACE FUNCTION public.staff_assign_or_create_workspace(p_user_id uuid, p_mode text, p_workspace_id uuid DEFAULT NULL::uuid, p_startup_name text DEFAULT NULL::text, p_program_id uuid DEFAULT NULL::uuid, p_stage text DEFAULT 'ideation'::text, p_description text DEFAULT NULL::text)
 RETURNS TABLE(workspace_id uuid, startup_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_staff_id uuid;
  v_workspace_id uuid;
  v_startup_id uuid;
BEGIN
  v_staff_id := auth.uid();
  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'Only staff can assign workspaces';
  END IF;

  IF p_mode = 'assign' THEN
    IF p_workspace_id IS NULL THEN
      RAISE EXCEPTION 'workspace_id is required for assign mode';
    END IF;
    v_workspace_id := p_workspace_id;
    SELECT w.startup_id INTO v_startup_id FROM public.workspaces w WHERE w.id = v_workspace_id;
    IF EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = v_workspace_id AND w.status IN ('archived','rejected')) THEN
      RAISE EXCEPTION 'workspace_archived_or_rejected' USING ERRCODE = '22023';
    END IF;
    IF v_startup_id IS NULL THEN
      RAISE EXCEPTION 'Workspace not found';
    END IF;
    INSERT INTO public.workspace_users AS wu (workspace_id, user_id, role, active)
    VALUES (v_workspace_id, p_user_id, 'founder', true)
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET active = true, role = 'founder';
    UPDATE public.workspaces w
    SET needs_onboarding = false, status = 'active', updated_at = now()
    WHERE w.id = v_workspace_id;
  ELSIF p_mode = 'create' THEN
    IF p_startup_name IS NULL OR trim(p_startup_name) = '' THEN
      RAISE EXCEPTION 'startup_name is required for create mode';
    END IF;
    INSERT INTO public.startups (name, description)
    VALUES (trim(p_startup_name), p_description)
    RETURNING id INTO v_startup_id;
    INSERT INTO public.workspaces (startup_id, program_id, stage, status, needs_onboarding)
    VALUES (v_startup_id, p_program_id, p_stage::public.startup_stage, 'active', false)
    RETURNING id INTO v_workspace_id;
    INSERT INTO public.workspace_users (workspace_id, user_id, role, active)
    VALUES (v_workspace_id, p_user_id, 'founder', true);
  ELSE
    RAISE EXCEPTION 'Invalid mode: %. Must be "assign" or "create"', p_mode;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (p_user_id, 'founder') ON CONFLICT DO NOTHING;
  UPDATE public.profiles p SET account_status = 'approved', updated_at = now()
  WHERE p.id = p_user_id AND p.account_status = 'pending';
  INSERT INTO public.activity_log (user_id, entity_type, entity_id, action, workspace_id, metadata)
  VALUES (v_staff_id, 'workspace', v_workspace_id, 'staff_assigned_workspace', v_workspace_id,
    jsonb_build_object('mode', p_mode, 'founder_id', p_user_id, 'startup_id', v_startup_id));

  RETURN QUERY SELECT v_workspace_id, v_startup_id;
END;
$function$;