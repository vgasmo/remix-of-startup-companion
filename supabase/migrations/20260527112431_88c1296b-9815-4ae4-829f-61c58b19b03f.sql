CREATE OR REPLACE FUNCTION public.ensure_outlook_calendar_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.outlook_calendar_settings (workspace_id, enabled, sync_mode, use_custom_calendar_email)
  VALUES (NEW.id, true, 'graph', false)
  ON CONFLICT (workspace_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_outlook_calendar_settings ON public.workspaces;
CREATE TRIGGER trg_ensure_outlook_calendar_settings
AFTER INSERT ON public.workspaces
FOR EACH ROW
EXECUTE FUNCTION public.ensure_outlook_calendar_settings();