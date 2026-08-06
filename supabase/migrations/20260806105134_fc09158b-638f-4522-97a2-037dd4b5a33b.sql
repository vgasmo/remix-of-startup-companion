CREATE OR REPLACE FUNCTION public.complete_workspace_onboarding(p_workspace_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_users wu
    WHERE wu.workspace_id = p_workspace_id
      AND wu.user_id = auth.uid()
      AND wu.active = true
      AND wu.role = 'founder'::public.app_role
  ) AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'forbidden — only workspace founder or staff may complete onboarding'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspaces
     SET needs_onboarding = false, updated_at = now()
   WHERE id = p_workspace_id;
END; $function$;