
-- Transactional convert-to-startup RPC.
-- Wraps startup + workspace + membership + optional contract + funnel update + event
-- in a single Postgres transaction (function bodies run in one implicit tx).
-- Any exception rolls back the entire set, so browser crashes mid-flight cannot leave orphans.
CREATE OR REPLACE FUNCTION public.staff_convert_funnel_item_to_startup(
  p_funnel_item_id uuid,
  p_program_id uuid,
  p_stage text,
  p_incubation_type_id uuid DEFAULT NULL,
  p_building_id uuid DEFAULT NULL,
  p_square_meters numeric DEFAULT NULL,
  p_monthly_fee numeric DEFAULT NULL,
  p_project_name text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_health_notes text DEFAULT NULL,
  p_inferred_stage text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_item public.funnel_items%ROWTYPE;
  v_startup_id uuid;
  v_workspace_id uuid;
  v_contract_id uuid;
  v_final_stage text;
  v_project_name text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT public.is_staff() THEN
    RAISE EXCEPTION 'staff_only' USING ERRCODE = '42501';
  END IF;

  -- Lock the funnel row for the duration of this transaction so a concurrent
  -- conversion attempt on the same lead serialises behind us.
  SELECT * INTO v_item
  FROM public.funnel_items
  WHERE id = p_funnel_item_id
  FOR UPDATE;

  IF v_item.id IS NULL THEN
    RAISE EXCEPTION 'funnel_item_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency: if this lead already resolved to a workspace, return it unchanged.
  IF v_item.linked_workspace_id IS NOT NULL THEN
    SELECT linked_contract_id INTO v_contract_id
    FROM public.funnel_items WHERE id = p_funnel_item_id;
    RETURN jsonb_build_object(
      'startup_id', v_item.linked_startup_id,
      'workspace_id', v_item.linked_workspace_id,
      'contract_id', v_contract_id,
      'was_existing', true
    );
  END IF;

  v_project_name := COALESCE(NULLIF(trim(p_project_name), ''),
                             v_item.organization_name,
                             v_item.contact_name,
                             'New Startup');
  v_final_stage := COALESCE(NULLIF(trim(p_inferred_stage), ''), p_stage);

  -- 1. Startup
  INSERT INTO public.startups (name, description, main_contact_name, main_contact_email, main_contact_phone)
  VALUES (v_project_name, p_description, v_item.contact_name, v_item.contact_email, v_item.contact_phone)
  RETURNING id INTO v_startup_id;

  -- 2. Workspace (pending — activation happens on contract signing)
  INSERT INTO public.workspaces (
    startup_id, program_id, stage, status, assigned_consultor_id, health_notes, created_by
  )
  VALUES (
    v_startup_id, p_program_id, v_final_stage::public.startup_stage,
    'pending', v_item.owner_consultant_id, p_health_notes, v_user
  )
  RETURNING id INTO v_workspace_id;

  -- 3. Staff membership so the workspace has an operational owner
  INSERT INTO public.workspace_users (workspace_id, user_id, role, active)
  VALUES (v_workspace_id, v_user, 'consultor'::public.app_role, true)
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET active = true, role = 'consultor';

  -- 4. Optional contract stub
  IF p_incubation_type_id IS NOT NULL THEN
    INSERT INTO public.startup_contracts (
      workspace_id, incubation_type_id, building_id, square_meters, monthly_fee,
      start_date, status, funnel_item_id, created_by
    )
    VALUES (
      v_workspace_id, p_incubation_type_id, p_building_id, p_square_meters, COALESCE(p_monthly_fee, 0),
      CURRENT_DATE, 'draft', p_funnel_item_id, v_user
    )
    RETURNING id INTO v_contract_id;
  END IF;

  -- 5. Update the funnel item to reflect the conversion
  UPDATE public.funnel_items
  SET stage = CASE WHEN p_stage = 'ideation' THEN 'incubating' ELSE 'accelerating' END,
      type = 'startup_active',
      linked_startup_id = v_startup_id,
      linked_workspace_id = v_workspace_id,
      linked_contract_id = v_contract_id,
      converted_at = now(),
      updated_at = now()
  WHERE id = p_funnel_item_id;

  -- 6. Event log
  INSERT INTO public.funnel_events (funnel_item_id, event_type, performed_by, metadata)
  VALUES (
    p_funnel_item_id, 'converted_to_startup', v_user,
    jsonb_build_object('startup_id', v_startup_id, 'workspace_id', v_workspace_id, 'contract_id', v_contract_id)
  );

  RETURN jsonb_build_object(
    'startup_id', v_startup_id,
    'workspace_id', v_workspace_id,
    'contract_id', v_contract_id,
    'was_existing', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.staff_convert_funnel_item_to_startup(
  uuid, uuid, text, uuid, uuid, numeric, numeric, text, text, text, text
) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.staff_convert_funnel_item_to_startup(
  uuid, uuid, text, uuid, uuid, numeric, numeric, text, text, text, text
) FROM anon;

-- Patch create_startup_application to stamp workspaces.created_by so provenance
-- is preserved for founder-initiated workspaces the same way it is for staff-initiated ones.
CREATE OR REPLACE FUNCTION public.create_startup_application(
  p_name text,
  p_stage text,
  p_program_id uuid,
  p_description text DEFAULT NULL::text,
  p_website text DEFAULT NULL::text,
  p_nif text DEFAULT NULL::text,
  p_main_contact_name text DEFAULT NULL::text,
  p_main_contact_email text DEFAULT NULL::text,
  p_main_contact_phone text DEFAULT NULL::text,
  p_has_startup_portugal_status boolean DEFAULT false
)
RETURNS TABLE(startup_id uuid, workspace_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_startup_id uuid;
  v_workspace_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  PERFORM public.ensure_founder_role();

  IF NOT public.is_founder_user() THEN
    RAISE EXCEPTION 'Founder role required';
  END IF;

  INSERT INTO public.startups (
    name, description, website, nif,
    main_contact_name, main_contact_email, main_contact_phone,
    has_startup_portugal_status
  ) VALUES (
    p_name, p_description, p_website, p_nif,
    p_main_contact_name, p_main_contact_email, p_main_contact_phone,
    COALESCE(p_has_startup_portugal_status, false)
  )
  RETURNING id INTO v_startup_id;

  INSERT INTO public.workspaces (
    startup_id, program_id, stage, status, created_by
  ) VALUES (
    v_startup_id, p_program_id, p_stage::public.startup_stage, 'pending', v_user_id
  )
  RETURNING id INTO v_workspace_id;

  INSERT INTO public.workspace_users (
    workspace_id, user_id, role, active
  ) VALUES (
    v_workspace_id, v_user_id, 'founder'::public.app_role, true
  );

  startup_id := v_startup_id;
  workspace_id := v_workspace_id;
  RETURN NEXT;
END;
$function$;
