-- C0-2: fix the awaiting_validation notification trigger.
-- workspaces has no `name` column (name lives on startups). The current function
-- SELECTs workspaces.name, which raises "column does not exist" and aborts the
-- founder's status change. Also, wrap the notification INSERT in an exception
-- guard so a downstream notify failure can never block the action update again.

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
    BEGIN
      SELECT w.assigned_consultor_id, s.name
        INTO v_consultor, v_workspace_name
        FROM public.workspaces w
        LEFT JOIN public.startups s ON s.id = w.startup_id
       WHERE w.id = NEW.workspace_id;

      IF v_consultor IS NOT NULL
         AND v_consultor <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
        INSERT INTO public.notifications (
          user_id, type, title, message, link, entity_type, entity_id, metadata
        )
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
    EXCEPTION WHEN OTHERS THEN
      -- Never block the founder's status change on a notify failure.
      RAISE WARNING 'notify_action_awaiting_validation failed for action %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;
