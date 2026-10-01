-- P4.1 guard action completion
CREATE OR REPLACE FUNCTION public.guard_action_completion()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND NOT public.is_staff()
     AND (   (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
          OR (OLD.status = 'completed' AND NEW.status IS DISTINCT FROM 'completed')) THEN
    RAISE EXCEPTION 'only_staff_can_complete_actions' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_action_completion ON public.action_items;
CREATE TRIGGER trg_guard_action_completion BEFORE UPDATE OF status ON public.action_items
  FOR EACH ROW EXECUTE FUNCTION public.guard_action_completion();

CREATE OR REPLACE FUNCTION public.complete_milestone_with_actions(_workspace_id uuid, _milestone_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_closed_count integer := 0;
BEGIN
  IF NOT public.can_write_workspace(_workspace_id) THEN
    RAISE EXCEPTION 'Not allowed to update this workspace' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.milestones WHERE id = _milestone_id AND workspace_id = _workspace_id) THEN
    RAISE EXCEPTION 'Milestone not found in workspace' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.is_staff() THEN
    WITH req AS (UPDATE public.action_items SET status = 'awaiting_validation', completed_at = NULL
                  WHERE workspace_id = _workspace_id AND milestone_id = _milestone_id
                    AND status IN ('pending','in_progress') RETURNING id)
    SELECT count(*) INTO v_closed_count FROM req;
    IF NOT EXISTS (SELECT 1 FROM public.action_items
                    WHERE milestone_id = _milestone_id
                      AND status IN ('pending','in_progress','awaiting_validation')) THEN
      UPDATE public.milestones SET status = 'completed', completed_at = now()
       WHERE id = _milestone_id AND workspace_id = _workspace_id;
    END IF;
    RETURN v_closed_count;
  END IF;
  WITH u AS (UPDATE public.action_items SET status = 'completed', completed_at = now()
              WHERE workspace_id = _workspace_id AND milestone_id = _milestone_id
                AND status NOT IN ('completed','cancelled') RETURNING id)
  SELECT count(*) INTO v_closed_count FROM u;
  UPDATE public.milestones SET status = 'completed', completed_at = now()
   WHERE id = _milestone_id AND workspace_id = _workspace_id;
  RETURN v_closed_count;
END $function$;

-- P4.2 protected startup fields
CREATE OR REPLACE FUNCTION public.startup_is_established(p_startup_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspaces w
                  WHERE w.startup_id = p_startup_id
                    AND w.status IN ('active','archived') AND w.needs_onboarding IS NOT TRUE);
$$;
REVOKE ALL ON FUNCTION public.startup_is_established(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.startup_is_established(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_startup_protected_fields()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated','anon') THEN RETURN NEW; END IF;
  IF public.is_staff() THEN RETURN NEW; END IF;
  IF NEW.phc_customer_id IS DISTINCT FROM OLD.phc_customer_id OR NEW.nif_normalized IS DISTINCT FROM OLD.nif_normalized
     OR NEW.archived_at IS DISTINCT FROM OLD.archived_at OR NEW.archived_by IS DISTINCT FROM OLD.archived_by
     OR NEW.archived_reason IS DISTINCT FROM OLD.archived_reason THEN
    RAISE EXCEPTION 'startup_field_staff_only' USING ERRCODE = '42501';
  END IF;
  IF (   nullif(btrim(NEW.name),'')               IS DISTINCT FROM nullif(btrim(OLD.name),'')
      OR nullif(btrim(NEW.nif),'')                IS DISTINCT FROM nullif(btrim(OLD.nif),'')
      OR nullif(btrim(NEW.address),'')            IS DISTINCT FROM nullif(btrim(OLD.address),'')
      OR nullif(btrim(NEW.phone),'')              IS DISTINCT FROM nullif(btrim(OLD.phone),'')
      OR nullif(btrim(NEW.website),'')            IS DISTINCT FROM nullif(btrim(OLD.website),'')
      OR nullif(btrim(NEW.main_contact_name),'')  IS DISTINCT FROM nullif(btrim(OLD.main_contact_name),'')
      OR nullif(btrim(NEW.main_contact_email),'') IS DISTINCT FROM nullif(btrim(OLD.main_contact_email),'')
      OR nullif(btrim(NEW.main_contact_phone),'') IS DISTINCT FROM nullif(btrim(OLD.main_contact_phone),''))
     AND public.startup_is_established(NEW.id) THEN
    RAISE EXCEPTION 'startup_change_requires_approval' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_startup_protected_fields ON public.startups;
CREATE TRIGGER trg_guard_startup_protected_fields BEFORE UPDATE ON public.startups
  FOR EACH ROW EXECUTE FUNCTION public.guard_startup_protected_fields();

-- P4.3 checkin
CREATE OR REPLACE FUNCTION public.mark_workspace_checkin(p_workspace_id uuid)
RETURNS timestamptz LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_now timestamptz := now();
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_write_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.workspaces SET last_checkin_at = v_now WHERE id = p_workspace_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'workspace_not_found' USING ERRCODE = 'P0002'; END IF;
  RETURN v_now;
END $$;
REVOKE ALL ON FUNCTION public.mark_workspace_checkin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_workspace_checkin(uuid) TO authenticated;

-- P4.5 financial assumption review queue
CREATE OR REPLACE FUNCTION public.enqueue_financial_assumption_review(
  p_workspace_id uuid, p_assumption_key text, p_scenario text, p_title text, p_description text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item jsonb := jsonb_build_object('assumption_key', p_assumption_key, 'scenario', p_scenario); v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_write_workspace(p_workspace_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.staff_work_queue_items (workspace_id, type, title, description, priority, status, created_by, evidence_json)
  VALUES (p_workspace_id, 'financial_assumption_skipped', left(p_title,200), left(p_description,2000), 'medium', 'open', auth.uid(),
          jsonb_build_object('source','guided_financial_plan','items', jsonb_build_array(v_item)))
  ON CONFLICT (workspace_id, type) WHERE status IN ('open','in_progress')
  DO UPDATE SET evidence_json = jsonb_set(COALESCE(staff_work_queue_items.evidence_json,'{}'::jsonb), '{items}',
       CASE WHEN COALESCE(staff_work_queue_items.evidence_json->'items','[]'::jsonb) @> jsonb_build_array(v_item)
            THEN staff_work_queue_items.evidence_json->'items'
            ELSE COALESCE(staff_work_queue_items.evidence_json->'items','[]'::jsonb) || jsonb_build_array(v_item) END),
     updated_at = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.enqueue_financial_assumption_review(uuid,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enqueue_financial_assumption_review(uuid,text,text,text,text) TO authenticated;

-- P4.7 time-off guard on sessions
CREATE OR REPLACE FUNCTION public.tg_sessions_block_participant_time_off()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  IF NEW.scheduled_at IS NULL OR NEW.status IS DISTINCT FROM 'scheduled'
     OR COALESCE(NEW.source, '') = 'off_platform' OR NEW.scheduled_at < now() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.scheduled_at IS NOT DISTINCT FROM OLD.scheduled_at
     AND NEW.duration IS NOT DISTINCT FROM OLD.duration
     AND NEW.primary_consultant_id IS NOT DISTINCT FROM OLD.primary_consultant_id
     AND NEW.primary_mentor_id IS NOT DISTINCT FROM OLD.primary_mentor_id THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR public.is_staff() OR public.is_backoffice()
     OR public.has_role(auth.uid(), 'mentor_externo') THEN
    RETURN NEW;
  END IF;
  v_owner := COALESCE(NEW.primary_mentor_id, NEW.primary_consultant_id);
  IF v_owner IS NOT NULL AND public.consultant_time_off_blocks(
       v_owner, NEW.scheduled_at, NEW.scheduled_at + make_interval(mins => COALESCE(NEW.duration, 60))) THEN
    RAISE EXCEPTION 'consultant is unavailable in this period' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.tg_sessions_block_participant_time_off() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_sessions_block_participant_time_off ON public.sessions;
CREATE TRIGGER trg_sessions_block_participant_time_off
  BEFORE INSERT OR UPDATE OF scheduled_at, duration, primary_consultant_id, primary_mentor_id ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_sessions_block_participant_time_off();

-- P4.8 member startup basics
CREATE OR REPLACE FUNCTION public.get_member_startup_basics(p_workspace_ids uuid[])
RETURNS TABLE (workspace_id uuid, id uuid, name text, description text, logo_url text, website text, has_startup_portugal_status boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id, s.id, s.name, s.description, s.logo_url, s.website, s.has_startup_portugal_status
    FROM public.workspaces w
    JOIN public.startups s ON s.id = w.startup_id
   WHERE w.id = ANY (p_workspace_ids)
     AND public.has_workspace_access(w.id);
$$;
REVOKE ALL ON FUNCTION public.get_member_startup_basics(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_startup_basics(uuid[]) TO authenticated;

-- P4.12 stage gate enqueue idempotent
CREATE OR REPLACE FUNCTION public.tg_stage_gate_review_enqueue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.staff_work_queue_items (
    workspace_id, type, title, description, priority, status, due_at, evidence_json, created_by
  ) VALUES (
    NEW.workspace_id, 'stage_gate_review',
    format('Stage Gate Review: %s → %s', NEW.from_stage, NEW.to_stage),
    'Pedido de revisão de stage gate', 'high', 'open', now() + interval '7 days',
    jsonb_build_object('review_id', NEW.id), COALESCE(auth.uid(), NEW.requested_by)
  )
  ON CONFLICT (workspace_id, type) WHERE status IN ('open','in_progress')
  DO UPDATE SET title         = EXCLUDED.title,
                evidence_json = COALESCE(staff_work_queue_items.evidence_json, '{}'::jsonb) || EXCLUDED.evidence_json,
                updated_at    = now();
  RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.tg_stage_gate_review_enqueue() FROM PUBLIC, anon, authenticated;