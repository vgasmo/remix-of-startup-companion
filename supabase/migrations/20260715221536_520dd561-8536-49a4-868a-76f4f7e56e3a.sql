
-- 1. Tighten activity_log INSERT policy: require workspace access when workspace_id is set
DROP POLICY IF EXISTS "Authenticated users can create activity logs" ON public.activity_log;
CREATE POLICY "Authenticated users can create activity logs"
ON public.activity_log
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND (
    workspace_id IS NULL
    OR public.has_workspace_access(workspace_id)
  )
);

-- 2. Remove mentor_externo from workspace write privileges.
-- Mentors retain read access via has_workspace_access and can still write
-- session_feedback (which uses has_workspace_access, not can_write_workspace).
CREATE OR REPLACE FUNCTION public.can_write_workspace(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'consultor'::public.app_role
    )
    OR (
      public.is_account_active()
      AND EXISTS (
        SELECT 1
        FROM public.workspace_users wu
        WHERE wu.workspace_id = _workspace_id
          AND wu.user_id = auth.uid()
          AND wu.active = true
          AND wu.role IN ('founder'::public.app_role, 'consultor'::public.app_role)
      )
    );
$function$;
