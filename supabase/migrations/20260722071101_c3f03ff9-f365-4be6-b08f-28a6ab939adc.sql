CREATE OR REPLACE FUNCTION public.has_workspace_access(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Admins always have access
    public.is_admin(_user_id)
    -- Consultors have access to all workspaces
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = 'consultor'
    )
    -- Regular users: approved account + active membership + not blocked + NDA gate for mentors
    OR (
      public.is_account_active(_user_id)
      AND EXISTS (
        SELECT 1
        FROM public.workspace_users wu
        JOIN public.workspaces w ON w.id = wu.workspace_id
        WHERE wu.user_id = _user_id
          AND wu.workspace_id = _workspace_id
          AND wu.active = true
          AND (
            w.status <> 'blocked'
            OR EXISTS (
              SELECT 1 FROM public.user_roles ur
              WHERE ur.user_id = _user_id AND ur.role IN ('admin', 'consultor')
            )
          )
      )
      AND (
        NOT EXISTS (
          SELECT 1 FROM public.user_roles
          WHERE user_id = _user_id AND role = 'mentor_externo'
        )
        OR public.has_accepted_nda(_user_id)
      )
    );
$$;

COMMENT ON FUNCTION public.has_workspace_access(uuid, uuid)
  IS 'Two-arg workspace access check. Parity with single-arg version: enforces account_status + blocked-workspace + mentor NDA gate. RC5 Batch D.';
