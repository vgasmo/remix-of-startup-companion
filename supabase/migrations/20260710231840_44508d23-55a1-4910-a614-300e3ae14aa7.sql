
-- Fix 1: Restrict document writes; drop overly permissive ALL policy
DROP POLICY IF EXISTS "Workspace members can manage documents" ON public.documents;

CREATE POLICY "Workspace writers can insert documents"
  ON public.documents FOR INSERT TO authenticated
  WITH CHECK (public.can_write_workspace(workspace_id));

CREATE POLICY "Workspace writers can update documents"
  ON public.documents FOR UPDATE TO authenticated
  USING (public.can_write_workspace(workspace_id))
  WITH CHECK (public.can_write_workspace(workspace_id));

CREATE POLICY "Workspace writers can delete documents"
  ON public.documents FOR DELETE TO authenticated
  USING (public.can_write_workspace(workspace_id));

-- Fix 2: Correct operator precedence in has_workspace_access(_user_id, _workspace_id)
-- so the NDA gate applies to non-admin/non-consultor users regardless of OR chain
CREATE OR REPLACE FUNCTION public.has_workspace_access(_user_id uuid, _workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (
    public.is_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = 'consultor'
    )
    OR EXISTS (
      SELECT 1 FROM public.workspace_users
      WHERE user_id = _user_id
        AND workspace_id = _workspace_id
        AND active = true
    )
  )
  AND (
    NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = 'mentor_externo'
    )
    OR public.has_accepted_nda(_user_id)
  );
$function$;
