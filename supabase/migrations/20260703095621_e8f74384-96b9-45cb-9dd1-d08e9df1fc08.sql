-- P0-B.1: widen staff_work_queue_items.type CHECK to include new founder-loop types
ALTER TABLE public.staff_work_queue_items DROP CONSTRAINT IF EXISTS staff_work_queue_items_type_check;
ALTER TABLE public.staff_work_queue_items
  ADD CONSTRAINT staff_work_queue_items_type_check
  CHECK (type IN (
    'triage','outreach','schedule_session','post_session_followup',
    'overdue_actions','missing_kpis','stage_gate_review','escalation',
    'monthly_review','quarterly_review',
    'validate_actions','review_checkin'
  ));

-- P0-B.2: SECURITY DEFINER trigger to notify assigned consultor when founder requests validation
CREATE OR REPLACE FUNCTION public.notify_action_awaiting_validation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_consultor uuid;
  v_workspace_name text;
BEGIN
  IF NEW.status = 'awaiting_validation'
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT assigned_consultor_id, name
      INTO v_consultor, v_workspace_name
      FROM public.workspaces
     WHERE id = NEW.workspace_id;
    IF v_consultor IS NOT NULL AND v_consultor <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
      INSERT INTO public.notifications (user_id, type, title, message, link, entity_type, entity_id, metadata)
      VALUES (
        v_consultor,
        'system',
        'Ação a validar',
        COALESCE(NEW.title, 'Ação') || ' — ' || COALESCE(v_workspace_name, ''),
        '/workspace/' || NEW.workspace_id::text || '?tab=milestones-actions&highlight=' || NEW.id::text,
        'action_item',
        NEW.id,
        jsonb_build_object('action_id', NEW.id, 'workspace_id', NEW.workspace_id)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_action_awaiting_validation ON public.action_items;
CREATE TRIGGER trg_notify_action_awaiting_validation
AFTER UPDATE ON public.action_items
FOR EACH ROW
EXECUTE FUNCTION public.notify_action_awaiting_validation();