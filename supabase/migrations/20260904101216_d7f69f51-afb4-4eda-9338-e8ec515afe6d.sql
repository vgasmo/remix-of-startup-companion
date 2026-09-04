-- Global kill-switch: when system_settings key 'notifications.founders_disabled'
-- is true, no notification rows are created for users whose only relevant role
-- is founder. Enforced at DB level so edge functions (service_role) are covered too.

CREATE OR REPLACE FUNCTION public.block_founder_notifications()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_disabled boolean;
BEGIN
  SELECT COALESCE((value #>> '{}')::boolean, false) INTO v_disabled
  FROM public.system_settings
  WHERE key = 'notifications.founders_disabled';

  IF NOT COALESCE(v_disabled, false) THEN
    RETURN NEW;
  END IF;

  -- Staff/mentors keep receiving notifications
  IF public.has_role(NEW.user_id, 'admin')
     OR public.has_role(NEW.user_id, 'consultor')
     OR public.has_role(NEW.user_id, 'backoffice')
     OR public.has_role(NEW.user_id, 'mentor_externo') THEN
    RETURN NEW;
  END IF;

  IF public.has_role(NEW.user_id, 'founder') OR public.has_role(NEW.user_id, 'team_member') THEN
    RETURN NULL; -- silently drop
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_founder_notifications ON public.notifications;
CREATE TRIGGER trg_block_founder_notifications
BEFORE INSERT ON public.notifications
FOR EACH ROW
EXECUTE FUNCTION public.block_founder_notifications();

INSERT INTO public.system_settings (key, value, description)
VALUES ('notifications.founders_disabled', 'false'::jsonb, 'When true, blocks all in-app notifications for founders/team members')
ON CONFLICT (key) DO NOTHING;