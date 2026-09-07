CREATE OR REPLACE FUNCTION public.founder_notifications_blocked(_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_disabled boolean;
BEGIN
  IF _user_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE((value #>> '{}')::boolean, false) INTO v_disabled
  FROM public.system_settings
  WHERE key = 'notifications.founders_disabled';

  IF NOT COALESCE(v_disabled, false) THEN
    RETURN false;
  END IF;

  IF public.has_role(_user_id, 'admin')
     OR public.has_role(_user_id, 'consultor')
     OR public.has_role(_user_id, 'backoffice')
     OR public.has_role(_user_id, 'mentor_externo') THEN
    RETURN false;
  END IF;

  RETURN public.has_role(_user_id, 'founder') OR public.has_role(_user_id, 'team_member');
END;
$$;

GRANT EXECUTE ON FUNCTION public.founder_notifications_blocked(uuid) TO service_role, authenticated;