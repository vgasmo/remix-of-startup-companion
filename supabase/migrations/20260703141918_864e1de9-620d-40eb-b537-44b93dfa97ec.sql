
-- 1) buildings: drop redundant broad-read policy
DROP POLICY IF EXISTS "buildings_select_authenticated" ON public.buildings;

-- 2) feature_flags: drop broad-read policy; other narrower ones remain
DROP POLICY IF EXISTS "Authenticated users can read enabled feature_flags" ON public.feature_flags;

-- 3) mentor_availability: replace USING(true) with scoped policy
DROP POLICY IF EXISTS "Authenticated users can view mentor availability" ON public.mentor_availability;

CREATE POLICY "Workspace members and staff can view mentor availability"
ON public.mentor_availability
FOR SELECT
TO authenticated
USING (
  public.is_staff()
  OR mentor_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.workspace_users wu
    WHERE wu.user_id = auth.uid() AND wu.active = true
  )
);

-- 4) user_roles: restrict mentor-role enumeration to staff + workspace members
DROP POLICY IF EXISTS "Authenticated users can view mentor roles" ON public.user_roles;

CREATE POLICY "Workspace members and staff can view mentor roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  role = 'mentor_externo'::app_role
  AND (
    public.is_staff()
    OR EXISTS (
      SELECT 1 FROM public.workspace_users wu
      WHERE wu.user_id = auth.uid() AND wu.active = true
    )
  )
);

-- 5) prevent_double_convert_funnel_item: pin search_path
CREATE OR REPLACE FUNCTION public.prevent_double_convert_funnel_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.linked_workspace_id IS NOT NULL
     AND OLD.linked_workspace_id IS NOT NULL
     AND NEW.linked_workspace_id IS DISTINCT FROM OLD.linked_workspace_id THEN
    RAISE EXCEPTION 'Este lead já foi convertido num workspace (%). Não pode ser convertido novamente.', OLD.linked_workspace_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
