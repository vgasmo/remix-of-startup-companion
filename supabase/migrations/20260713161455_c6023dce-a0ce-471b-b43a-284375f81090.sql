
CREATE OR REPLACE FUNCTION public.publish_program_setup(
  p_draft_id uuid,
  p_program_id uuid,
  p_draft_json jsonb,
  p_kpi_definition_map jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_program_type program_type;
  v_is_acceleration boolean;
  v_settings jsonb;
  v_basics jsonb;
  v_gate_map jsonb := '{}'::jsonb;
  v_gate_ranges jsonb := '[]'::jsonb;
  v_gate jsonb;
  v_new_gate_id uuid;
  v_week jsonb;
  v_resolved_gate uuid;
  v_stage jsonb;
  v_stage_kpi jsonb;
  v_kpi jsonb;
  v_core_kpi jsonb;
  v_kpi_def_id uuid;
  v_playbook jsonb;
  v_playbook_id uuid;
  v_item jsonb;
  v_alert jsonb;
  v_health jsonb;
  v_gates_count int := 0;
  v_weeks_count int := 0;
  v_stages_count int := 0;
  v_playbooks_count int := 0;
  v_alerts_count int := 0;
  v_kpi_count int := 0;
BEGIN
  -- Auth: staff-only. auth.uid() must exist and hold admin or consultor role.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'consultor'::app_role)) THEN
    RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
  END IF;

  IF p_draft_id IS NULL OR p_program_id IS NULL OR p_draft_json IS NULL THEN
    RAISE EXCEPTION 'draft_id, program_id and draft_json are required';
  END IF;

  -- Lock program row for the entire function so concurrent publishes serialize.
  PERFORM 1 FROM public.programs WHERE id = p_program_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program % not found', p_program_id;
  END IF;

  v_basics := COALESCE(p_draft_json->'basics', '{}'::jsonb);
  v_program_type := COALESCE(NULLIF(v_basics->>'program_type',''), 'incubation')::program_type;
  v_is_acceleration := (v_program_type = 'acceleration');

  v_settings := jsonb_build_object(
    'program_mode', 'standard',
    'enable_kpis', true,
    'enable_health', true,
    'enable_milestones', true,
    'enable_alerts', true,
    'enable_playbooks', true,
    'enable_financial_model', false
  ) || COALESCE(v_basics->'settings', '{}'::jsonb);

  -- Update program metadata (still 'draft' until final flip).
  UPDATE public.programs SET
    name         = COALESCE(v_basics->>'name', name),
    description  = NULLIF(v_basics->>'description', ''),
    start_date   = NULLIF(v_basics->>'start_date','')::date,
    end_date     = NULLIF(v_basics->>'end_date','')::date,
    settings_json = v_settings,
    program_type = v_program_type,
    updated_at   = now()
  WHERE id = p_program_id;

  -- === Quarantine incompatible artifacts ===
  IF v_is_acceleration THEN
    DELETE FROM public.stage_kpi_defaults WHERE program_id = p_program_id;
    DELETE FROM public.playbook_items
      WHERE playbook_id IN (SELECT id FROM public.playbooks WHERE program_id = p_program_id);
    DELETE FROM public.playbooks WHERE program_id = p_program_id;
    DELETE FROM public.stages    WHERE program_id = p_program_id;
    DELETE FROM public.program_core_kpis   WHERE program_id = p_program_id;
    DELETE FROM public.program_alert_rules WHERE program_id = p_program_id;
    DELETE FROM public.program_health_model WHERE program_id = p_program_id;
  END IF;

  -- Always wipe gates+weeks; will re-insert only if acceleration.
  DELETE FROM public.program_weeks WHERE program_id = p_program_id;
  DELETE FROM public.program_gates WHERE program_id = p_program_id;

  IF v_is_acceleration THEN
    -- === Gates ===
    FOR v_gate IN SELECT * FROM jsonb_array_elements(COALESCE(p_draft_json->'gates','[]'::jsonb))
    LOOP
      INSERT INTO public.program_gates (program_id, name, description, sort_order, target_start_week, target_end_week)
      VALUES (
        p_program_id,
        v_gate->>'name',
        NULLIF(v_gate->>'description',''),
        COALESCE((v_gate->>'sort_order')::int, 0),
        NULLIF(v_gate->>'target_start_week','')::int,
        NULLIF(v_gate->>'target_end_week','')::int
      )
      RETURNING id INTO v_new_gate_id;

      IF v_gate ? 'id' AND (v_gate->>'id') IS NOT NULL THEN
        v_gate_map := v_gate_map || jsonb_build_object(v_gate->>'id', v_new_gate_id);
      END IF;
      IF v_gate ? '__local_id' AND (v_gate->>'__local_id') IS NOT NULL THEN
        v_gate_map := v_gate_map || jsonb_build_object(v_gate->>'__local_id', v_new_gate_id);
      END IF;
      -- Legacy id: "gate-<sort_order>"
      v_gate_map := v_gate_map || jsonb_build_object(
        'gate-' || COALESCE((v_gate->>'sort_order'), '0'),
        v_new_gate_id
      );
      v_gate_ranges := v_gate_ranges || jsonb_build_array(
        jsonb_build_object(
          'id', v_new_gate_id,
          'start', NULLIF(v_gate->>'target_start_week','')::int,
          'end',   NULLIF(v_gate->>'target_end_week','')::int
        )
      );
      v_gates_count := v_gates_count + 1;
    END LOOP;

    -- === Weeks ===
    FOR v_week IN SELECT * FROM jsonb_array_elements(COALESCE(p_draft_json->'weeks','[]'::jsonb))
    LOOP
      v_resolved_gate := NULL;
      IF v_week ? 'gate_id' AND (v_week->>'gate_id') IS NOT NULL THEN
        v_resolved_gate := NULLIF(v_gate_map->>(v_week->>'gate_id'), '')::uuid;
      END IF;
      IF v_resolved_gate IS NULL THEN
        SELECT (r->>'id')::uuid INTO v_resolved_gate
        FROM jsonb_array_elements(v_gate_ranges) AS r
        WHERE (r->>'start') IS NOT NULL AND (r->>'end') IS NOT NULL
          AND (v_week->>'week_number')::int BETWEEN (r->>'start')::int AND (r->>'end')::int
        LIMIT 1;
      END IF;

      INSERT INTO public.program_weeks (program_id, gate_id, week_number, title, description, deliverables_json)
      VALUES (
        p_program_id,
        v_resolved_gate,
        (v_week->>'week_number')::int,
        v_week->>'title',
        NULLIF(v_week->>'description',''),
        COALESCE(v_week->'deliverables_json', '[]'::jsonb)
      );
      v_weeks_count := v_weeks_count + 1;
    END LOOP;

  ELSE
    -- ============ INCUBATION ============
    -- Stages: upsert by (program_id, stage_key)
    FOR v_stage IN SELECT * FROM jsonb_array_elements(COALESCE(p_draft_json->'stages','[]'::jsonb))
    LOOP
      UPDATE public.stages SET
        name = v_stage->>'name',
        description = NULLIF(v_stage->>'description',''),
        position = COALESCE((v_stage->>'position')::int, 0),
        is_active = COALESCE((v_stage->>'is_active')::boolean, true)
      WHERE program_id = p_program_id AND stage_key = v_stage->>'stage_key';
      IF NOT FOUND THEN
        INSERT INTO public.stages (program_id, stage_key, name, description, position, is_active)
        VALUES (
          p_program_id,
          v_stage->>'stage_key',
          v_stage->>'name',
          NULLIF(v_stage->>'description',''),
          COALESCE((v_stage->>'position')::int, 0),
          COALESCE((v_stage->>'is_active')::boolean, true)
        );
      END IF;
      v_stages_count := v_stages_count + 1;
    END LOOP;

    -- Stage KPI defaults: clear + insert. Resolve kpi_definition_id from map or embedded id.
    DELETE FROM public.stage_kpi_defaults WHERE program_id = p_program_id;
    FOR v_stage_kpi IN SELECT * FROM jsonb_array_elements(COALESCE(p_draft_json->'kpis','[]'::jsonb))
    LOOP
      FOR v_kpi IN SELECT * FROM jsonb_array_elements(COALESCE(v_stage_kpi->'kpis','[]'::jsonb))
      LOOP
        v_kpi_def_id := COALESCE(
          NULLIF(v_kpi->>'kpi_definition_id','')::uuid,
          NULLIF(p_kpi_definition_map->>(v_kpi->>'name'),'')::uuid
        );
        IF v_kpi_def_id IS NULL THEN
          CONTINUE;
        END IF;
        INSERT INTO public.stage_kpi_defaults
          (program_id, stage, kpi_definition_id, required, order_index, target_value)
        VALUES (
          p_program_id,
          (v_stage_kpi->>'stage_key')::startup_stage,
          v_kpi_def_id,
          COALESCE((v_kpi->>'is_required')::boolean, false),
          COALESCE((v_kpi->>'order_index')::int, 0),
          NULLIF(v_kpi->>'target_value','')::numeric
        );
        v_kpi_count := v_kpi_count + 1;
      END LOOP;
    END LOOP;

    -- Core KPIs: clear + insert.
    DELETE FROM public.program_core_kpis WHERE program_id = p_program_id;
    FOR v_core_kpi IN SELECT * FROM jsonb_array_elements(COALESCE(p_draft_json->'coreKpis','[]'::jsonb))
    LOOP
      v_kpi_def_id := COALESCE(
        NULLIF(v_core_kpi->>'kpi_definition_id','')::uuid,
        NULLIF(p_kpi_definition_map->>(v_core_kpi->>'name'),'')::uuid
      );
      IF v_kpi_def_id IS NULL THEN
        CONTINUE;
      END IF;
      INSERT INTO public.program_core_kpis (program_id, kpi_definition_id, order_index)
      VALUES (p_program_id, v_kpi_def_id, COALESCE((v_core_kpi->>'order_index')::int, 0));
    END LOOP;

    -- Playbooks + items: upsert by (program_id, stage); wipe items and re-insert.
    FOR v_playbook IN SELECT * FROM jsonb_array_elements(COALESCE(p_draft_json->'playbooks','[]'::jsonb))
    LOOP
      SELECT id INTO v_playbook_id
      FROM public.playbooks
      WHERE program_id = p_program_id AND stage = (v_playbook->>'stage_key')::startup_stage;

      IF v_playbook_id IS NULL THEN
        INSERT INTO public.playbooks (program_id, stage, title, description, is_active)
        VALUES (
          p_program_id,
          (v_playbook->>'stage_key')::startup_stage,
          v_playbook->>'title',
          NULLIF(v_playbook->>'description',''),
          true
        ) RETURNING id INTO v_playbook_id;
      ELSE
        UPDATE public.playbooks SET
          title = v_playbook->>'title',
          description = NULLIF(v_playbook->>'description',''),
          is_active = true,
          updated_at = now()
        WHERE id = v_playbook_id;
        DELETE FROM public.playbook_items WHERE playbook_id = v_playbook_id;
      END IF;

      FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_playbook->'items','[]'::jsonb))
      LOOP
        INSERT INTO public.playbook_items
          (playbook_id, item_type, title, description, relative_due_days,
           priority, order_index, default_owner_role, metadata_json)
        VALUES (
          v_playbook_id,
          v_item->>'item_type',
          v_item->>'title',
          NULLIF(v_item->>'description',''),
          NULLIF(v_item->>'relative_due_days','')::int,
          NULLIF(v_item->>'priority',''),
          COALESCE((v_item->>'order_index')::int, 0),
          NULLIF(v_item->>'default_owner_role',''),
          COALESCE(v_item->'metadata_json', '{}'::jsonb)
        );
      END LOOP;
      v_playbooks_count := v_playbooks_count + 1;
    END LOOP;

    -- Alert rules: clear + insert.
    DELETE FROM public.program_alert_rules WHERE program_id = p_program_id;
    FOR v_alert IN SELECT * FROM jsonb_array_elements(COALESCE(p_draft_json->'alertRules','[]'::jsonb))
    LOOP
      INSERT INTO public.program_alert_rules (program_id, rule_type, threshold, severity, is_enabled)
      VALUES (
        p_program_id,
        v_alert->>'rule_type',
        COALESCE((v_alert->>'threshold')::numeric, 7),
        COALESCE(NULLIF(v_alert->>'severity',''), 'warning'),
        COALESCE((v_alert->>'is_enabled')::boolean, true)
      );
      v_alerts_count := v_alerts_count + 1;
    END LOOP;

    -- Health model: upsert (unique on program_id).
    v_health := p_draft_json->'healthModel';
    IF v_health IS NOT NULL AND v_health <> 'null'::jsonb THEN
      INSERT INTO public.program_health_model (program_id, weights_json, thresholds_json, is_enabled)
      VALUES (
        p_program_id,
        COALESCE(v_health->'weights_json', '{}'::jsonb),
        COALESCE(v_health->'thresholds_json', '{}'::jsonb),
        COALESCE((v_health->>'is_enabled')::boolean, true)
      )
      ON CONFLICT (program_id) DO UPDATE SET
        weights_json = EXCLUDED.weights_json,
        thresholds_json = EXCLUDED.thresholds_json,
        is_enabled = EXCLUDED.is_enabled,
        updated_at = now();
    END IF;
  END IF;

  -- === Final activation ===
  UPDATE public.programs
     SET status = 'active', is_active = true, updated_at = now()
   WHERE id = p_program_id;

  UPDATE public.program_setup_drafts
     SET status = 'published',
         program_id = p_program_id,
         program_snapshot_json = NULL,
         last_publish_rollback_status = NULL,
         last_publish_error = NULL,
         last_publish_failed_at = NULL,
         updated_at = now()
   WHERE id = p_draft_id;

  RETURN jsonb_build_object(
    'success', true,
    'program_id', p_program_id,
    'program_type', v_program_type::text,
    'gates_count', v_gates_count,
    'weeks_count', v_weeks_count,
    'stages_count', v_stages_count,
    'playbooks_count', v_playbooks_count,
    'alerts_count', v_alerts_count,
    'kpi_count', v_kpi_count,
    'health_enabled', COALESCE((v_health->>'is_enabled')::boolean, false)
  );
END;
$$;

COMMENT ON FUNCTION public.publish_program_setup(uuid, uuid, jsonb, jsonb)
IS 'Atomically applies a program setup draft to a program (stages, gates, weeks, KPI defaults, core KPIs, playbooks+items, alert rules, health model) and marks the draft published. Staff-only. Any failure rolls back the entire publish transaction.';

REVOKE ALL ON FUNCTION public.publish_program_setup(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_program_setup(uuid, uuid, jsonb, jsonb) TO authenticated, service_role;
