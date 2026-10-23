CREATE OR REPLACE FUNCTION public.can_write_workspace(_workspace_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.is_account_active(auth.uid()) AND (
   public.is_admin()
   OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role='consultor'::public.app_role)
   OR EXISTS (SELECT 1 FROM public.workspace_users wu JOIN public.workspaces w ON w.id=wu.workspace_id
     WHERE wu.workspace_id=_workspace_id AND wu.user_id=auth.uid() AND wu.active=true
       AND wu.role IN ('founder'::public.app_role,'consultor'::public.app_role) AND w.blocked_at IS NULL)
 );
$$;
ALTER POLICY "Authenticated users can create conversations" ON public.conversations WITH CHECK (false);
DO $guard$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO definition FROM pg_proc p WHERE p.oid='public.create_conversation(uuid[],text,uuid)'::regprocedure;
 IF position('v_user_id := auth.uid();' in definition)=0 THEN RAISE EXCEPTION 'conversation guard insertion point missing'; END IF;
 definition := replace(definition, 'v_user_id := auth.uid();', 'v_user_id := auth.uid(); IF NOT public.is_account_active(v_user_id) THEN RAISE EXCEPTION ''account_access_denied'' USING ERRCODE = ''42501''; END IF;');
 EXECUTE definition;
END $guard$;
REVOKE EXECUTE ON FUNCTION public.create_conversation(uuid[],text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_conversation(uuid[],text,uuid) TO authenticated, service_role;
COMMENT ON POLICY "Authenticated users can create conversations" ON public.conversations IS 'Direct INSERT disabled: use authorized create_conversation or get_or_create_workspace_conversation commands.';