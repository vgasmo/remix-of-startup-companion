
-- C2: idempotency guard on publish_program_setup.
-- If the draft is already 'published', short-circuit and return the prior result
-- instead of re-executing the destructive quarantine + rewrite path.
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
  v_draft_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(v_uid, 'admin'::app_role) OR public.has_role(v_uid, 'consultor'::app_role)) THEN
    RAISE EXCEPTION 'Insufficient permissions' USING ERRCODE = '42501';
  END IF;

  IF p_draft_id IS NULL OR p_program_id IS NULL OR p_draft_json IS NULL THEN
    RAISE EXCEPTION 'draft_id, program_id and draft_json are required';
  END IF;

  -- C2 IDEMPOTENCY: if this draft was already successfully published,
  -- return early with the recorded program. Re-executing would wipe
  -- and re-materialize live children unnecessarily and could race with
  -- a running program.
  SELECT status INTO v_draft_status
    FROM public.program_setup_drafts
   WHERE id = p_draft_id
   FOR UPDATE;
  IF v_draft_status = 'published' THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'program_id', p_program_id,
      'note', 'draft already published; no-op'
    );
  END IF;

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

  UPDATE public.programs SET
    name         = COALESCE(v_basics->>'name', name),
    description  = NULLIF(v_basics->>'description', ''),
    start_date   = NULLIF(v_basics->>'start_date','')::date,
    end_date     = NULLIF(v_basics->>'end_date','')::date,
    settings_json = v_settings,
    program_type = v_program_type,
    updated_at   = now()
  WHERE id = p_program_id;

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

  DELETE FROM public.program_weeks WHERE program_id = p_program_id;
  DELETE FROM public.program_gates WHERE program_id = p_program_id;

  IF v_is_acceleration THEN
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
      v_gates_count := v_gates_count + 1;
    END LOOP;

    FOR v_week IN SELECT * FROM jsonb_array_elements(COALESCE(p_draft_json->'weeks','[]'::jsonb))
    LOOP
      v_resolved_gate := NULL;
      IF v_week ? 'gate_id' AND (v_week->>'gate_id') IS NOT NULL THEN
        v_resolved_gate := NULLIF(v_gate_map->>(v_week->>'gate_id'), '')::uuid;
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
    FOR v_stage IN SELECT * FROM jsonb_array_elements(COALESCE(p_draft_json->'stages','[]'::jsonb))
    LOOP
      INSERT INTO public.stages (program_id, stage_key, name, description, position, is_active)
      VALUES (
        p_program_id,
        (v_stage->>'stage_key')::startup_stage,
        v_stage->>'name',
        NULLIF(v_stage->>'description',''),
        (v_stage->>'position')::int,
        COALESCE((v_stage->>'is_active')::boolean, true)
      )
      ON CONFLICT (program_id, stage_key) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        position = EXCLUDED.position,
        is_active = EXCLUDED.is_active;
      v_stages_count := v_stages_count + 1;
    END LOOP;

    DELETE FROM public.stage_kpi_defaults WHERE program_id = p_program_id;
    FOR v_stage_kpi IN SELECT * FROM jsonb_array_elements(COALESCE(p_draft_json->'kpis','[]'::jsonb))
    LOOP
      FOR v_kpi IN SELECT * FROM jsonb_array_elements(COALESCE(v_stage_kpi->'kpis','[]'::jsonb))
      LOOP
        v_kpi_def_id := NULL;
        IF v_kpi ? 'kpi_definition_id' AND (v_kpi->>'kpi_definition_id') IS NOT NULL THEN
          v_kpi_def_id := (v_kpi->>'kpi_definition_id')::uuid;
        ELSIF p_kpi_definition_map ? (v_kpi->>'name') THEN
          v_kpi_def_id := (p_kpi_definition_map->>(v_kpi->>'name'))::uuid;
        END IF;
        IF v_kpi_def_id IS NULL THEN CONTINUE; END IF;
        INSERT INTO public.stage_kpi_defaults (program_id, stage, kpi_definition_id, required, order_index, target_value)
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

    DELETE FROM public.program_core_kpis WHERE program_id = p_program_id;
    FOR v_core_kpi IN SELECT * FROM jsonb_array_elements(COALESCE(p_draft_json->'coreKpis','[]'::jsonb))
    LOOP
      v_kpi_def_id := NULL;
      IF v_core_kpi ? 'kpi_definition_id' AND (v_core_kpi->>'kpi_definition_id') IS NOT NULL THEN
        v_kpi_def_id := (v_core_kpi->>'kpi_definition_id')::uuid;
      ELSIF p_kpi_definition_map ? (v_core_kpi->>'name') THEN
        v_kpi_def_id := (p_kpi_definition_map->>(v_core_kpi->>'name'))::uuid;
      END IF;
      IF v_kpi_def_id IS NULL THEN CONTINUE; END IF;
      INSERT INTO public.program_core_kpis (program_id, kpi_definition_id, order_index)
      VALUES (p_program_id, v_kpi_def_id, COALESCE((v_core_kpi->>'order_index')::int, 0));
    END LOOP;

    DELETE FROM public.playbook_items
      WHERE playbook_id IN (SELECT id FROM public.playbooks WHERE program_id = p_program_id);
    DELETE FROM public.playbooks WHERE program_id = p_program_id;
    FOR v_playbook IN SELECT * FROM jsonb_array_elements(COALESCE(p_draft_json->'playbooks','[]'::jsonb))
    LOOP
      INSERT INTO public.playbooks (program_id, stage, title, description, is_active)
      VALUES (
        p_program_id,
        (v_playbook->>'stage_key')::startup_stage,
        v_playbook->>'title',
        NULLIF(v_playbook->>'description',''),
        true
      )
      RETURNING id INTO v_playbook_id;
      v_playbooks_count := v_playbooks_count + 1;

      FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_playbook->'items','[]'::jsonb))
      LOOP
        INSERT INTO public.playbook_items
          (playbook_id, item_type, title, description, relative_due_days, priority, order_index, default_owner_role, metadata_json)
        VALUES (
          v_playbook_id,
          (v_item->>'item_type'),
          v_item->>'title',
          NULLIF(v_item->>'description',''),
          NULLIF(v_item->>'relative_due_days','')::int,
          NULLIF(v_item->>'priority',''),
          COALESCE((v_item->>'order_index')::int, 0),
          NULLIF(v_item->>'default_owner_role',''),
          COALESCE(v_item->'metadata_json', '{}'::jsonb)
        );
      END LOOP;
    END LOOP;

    DELETE FROM public.program_alert_rules WHERE program_id = p_program_id;
    FOR v_alert IN SELECT * FROM jsonb_array_elements(COALESCE(p_draft_json->'alertRules','[]'::jsonb))
    LOOP
      INSERT INTO public.program_alert_rules (program_id, rule_type, threshold, severity, is_enabled)
      VALUES (
        p_program_id,
        v_alert->>'rule_type',
        (v_alert->>'threshold')::numeric,
        v_alert->>'severity',
        COALESCE((v_alert->>'is_enabled')::boolean, true)
      );
      v_alerts_count := v_alerts_count + 1;
    END LOOP;

    DELETE FROM public.program_health_model WHERE program_id = p_program_id;
    v_health := p_draft_json->'healthModel';
    IF v_health IS NOT NULL AND v_health <> 'null'::jsonb THEN
      INSERT INTO public.program_health_model (program_id, weights_json, thresholds_json, is_enabled)
      VALUES (
        p_program_id,
        COALESCE(v_health->'weights_json', '{}'::jsonb),
        COALESCE(v_health->'thresholds_json', '{}'::jsonb),
        COALESCE((v_health->>'is_enabled')::boolean, false)
      );
    END IF;
  END IF;

  UPDATE public.programs SET status = 'active', is_active = true, updated_at = now()
   WHERE id = p_program_id;

  UPDATE public.program_setup_drafts
     SET status = 'published',
         program_id = p_program_id,
         published_at = now(),
         published_by = v_uid,
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

REVOKE ALL ON FUNCTION public.publish_program_setup(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_program_setup(uuid, uuid, jsonb, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.publish_program_setup(uuid, uuid, jsonb, jsonb)
IS 'Atomically applies a program setup draft (stages, gates, weeks, KPI defaults, core KPIs, playbooks+items, alert rules, health model) and marks the draft published. Idempotent: a draft already in status=published short-circuits without touching the live program.';

-- C1: active_milestones view. Consumers that only need live milestones
-- (dashboards, session prep, reports, timelines, playbook progress) can
-- read this view so program-transfer archival is honoured without every
-- caller adding an ad-hoc `archived_at IS NULL` filter.
DROP VIEW IF EXISTS public.active_milestones;
CREATE VIEW public.active_milestones
WITH (security_invoker = true)
AS
SELECT * FROM public.milestones WHERE archived_at IS NULL;

GRANT SELECT ON public.active_milestones TO authenticated;
GRANT SELECT ON public.active_milestones TO service_role;

COMMENT ON VIEW public.active_milestones
IS 'Milestones where archived_at IS NULL. Used by dashboards, session prep, reports and playbook progress so that program-transfer archival is honoured.';
