-- P0A: tighten template_requests insert policy (membership + safe defaults)
DROP POLICY IF EXISTS "requester can insert own template requests" ON public.template_requests;
CREATE POLICY "requester can insert own template requests"
  ON public.template_requests FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND (workspace_id IS NULL OR public.has_workspace_access(workspace_id))
    AND status = 'pending'
    AND fulfilled_template_id IS NULL
    AND resolved_by IS NULL
    AND resolved_at IS NULL
  );

-- P0B: fix workspace-members SELECT (has_workspace_access takes one arg here — workspace_id; auth.uid() implicit)
DROP POLICY IF EXISTS "workspace members can read template requests" ON public.template_requests;
CREATE POLICY "workspace members can read template requests"
  ON public.template_requests FOR SELECT TO authenticated
  USING (workspace_id IS NOT NULL AND public.has_workspace_access(workspace_id));

-- P0C: fix workspace_engagement_events policies (same has_workspace_access signature)
DROP POLICY IF EXISTS "Workspace members and staff can read engagement events" ON public.workspace_engagement_events;
CREATE POLICY "Workspace members and staff can read engagement events"
  ON public.workspace_engagement_events FOR SELECT TO authenticated
  USING (
    public.has_workspace_access(workspace_id)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'consultor'::app_role)
  );

DROP POLICY IF EXISTS "Authenticated users can insert their own engagement events" ON public.workspace_engagement_events;
CREATE POLICY "Authenticated users can insert their own engagement events"
  ON public.workspace_engagement_events FOR INSERT TO authenticated
  WITH CHECK (
    actor_id = auth.uid()
    AND public.has_workspace_access(workspace_id)
  );

-- P0E: make materialize RPC concurrency-safe via ON CONFLICT DO NOTHING
CREATE OR REPLACE FUNCTION public.materialize_acceleration_deliverables(p_workspace_id uuid, p_program_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_program_start date;
  v_gate record;
  v_week record;
  v_deliverable jsonb;
  v_milestone_id uuid;
  v_action_id uuid;
  v_template_id uuid;
  v_template_name text;
  v_instance_id uuid;
  v_milestones_created int := 0;
  v_actions_created int := 0;
  v_doc_links_created int := 0;
  v_deliverable_key text;
BEGIN
  v_user_id := auth.uid();

  IF NOT has_workspace_access(p_workspace_id) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT COALESCE(start_date::date, CURRENT_DATE)
  INTO v_program_start
  FROM programs
  WHERE id = p_program_id;

  FOR v_gate IN
    SELECT id, name, description, sort_order, target_start_week, target_end_week
    FROM program_gates
    WHERE program_id = p_program_id
    ORDER BY sort_order
  LOOP
    v_milestone_id := NULL;

    INSERT INTO milestones (
      workspace_id, title, description, status, target_date,
      created_by, source_gate_id, position
    ) VALUES (
      p_workspace_id, v_gate.name, v_gate.description, 'not_started',
      v_program_start + (COALESCE(v_gate.target_end_week, 0) * 7),
      v_user_id, v_gate.id, v_gate.sort_order
    )
    ON CONFLICT ON CONSTRAINT milestones_workspace_source_gate_uniq DO NOTHING
    RETURNING id INTO v_milestone_id;

    IF v_milestone_id IS NULL THEN
      SELECT id INTO v_milestone_id
      FROM milestones
      WHERE workspace_id = p_workspace_id AND source_gate_id = v_gate.id
      LIMIT 1;
    ELSE
      v_milestones_created := v_milestones_created + 1;
    END IF;

    FOR v_week IN
      SELECT id, week_number, title, deliverables_json
      FROM program_weeks
      WHERE program_id = p_program_id
        AND (
          gate_id = v_gate.id
          OR (
            gate_id IS NULL
            AND v_gate.target_start_week IS NOT NULL
            AND v_gate.target_end_week IS NOT NULL
            AND week_number BETWEEN v_gate.target_start_week AND v_gate.target_end_week
          )
        )
      ORDER BY week_number
    LOOP
      IF v_week.deliverables_json IS NOT NULL AND jsonb_typeof(v_week.deliverables_json::jsonb) = 'array' THEN
        FOR v_deliverable IN SELECT * FROM jsonb_array_elements(v_week.deliverables_json::jsonb)
        LOOP
          v_deliverable_key := p_program_id || ':' || v_week.id || ':' || (v_deliverable->>'title');
          v_action_id := NULL;

          INSERT INTO action_items (
            workspace_id, title, description, status,
            due_date, milestone_id, created_by, source_deliverable_key
          ) VALUES (
            p_workspace_id,
            v_deliverable->>'title',
            'S' || v_week.week_number || ' — ' || v_week.title || E'\n' || COALESCE(v_deliverable->>'description', ''),
            'pending',
            (v_program_start + (v_week.week_number * 7))::date,
            v_milestone_id,
            v_user_id,
            v_deliverable_key
          )
          ON CONFLICT ON CONSTRAINT action_items_workspace_source_deliverable_uniq DO NOTHING
          RETURNING id INTO v_action_id;

          IF v_action_id IS NULL THEN
            SELECT id INTO v_action_id
            FROM action_items
            WHERE workspace_id = p_workspace_id AND source_deliverable_key = v_deliverable_key
            LIMIT 1;
          ELSE
            v_actions_created := v_actions_created + 1;
          END IF;

          v_template_id := NULLIF(v_deliverable->>'template_id', '')::uuid;
          IF v_template_id IS NOT NULL AND v_action_id IS NOT NULL THEN
            SELECT id INTO v_instance_id
            FROM template_instances
            WHERE workspace_id = p_workspace_id AND template_id = v_template_id
            LIMIT 1;

            IF v_instance_id IS NULL THEN
              INSERT INTO template_instances (workspace_id, template_id, status, created_by)
              VALUES (p_workspace_id, v_template_id, 'draft', v_user_id)
              RETURNING id INTO v_instance_id;
            END IF;

            SELECT name INTO v_template_name FROM templates WHERE id = v_template_id;

            IF NOT EXISTS (
              SELECT 1 FROM action_deliverables
              WHERE action_id = v_action_id
                AND type = 'platform_document'
                AND document_id::text = v_instance_id::text
            ) THEN
              INSERT INTO action_deliverables (
                action_id, title, type, document_id
              ) VALUES (
                v_action_id,
                COALESCE(v_template_name, v_deliverable->>'title'),
                'platform_document',
                v_instance_id
              );
              v_doc_links_created := v_doc_links_created + 1;
            END IF;
          END IF;
        END LOOP;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'milestones_created', v_milestones_created,
    'actions_created', v_actions_created,
    'doc_links_created', v_doc_links_created
  );
END;
$function$;