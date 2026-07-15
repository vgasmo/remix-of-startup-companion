
-- Tighten mentor_availability visibility: require an accepted mentor_connection
-- between the requester and the specific mentor whose availability is being read.
DROP POLICY IF EXISTS "Workspace members and staff can view mentor availability" ON public.mentor_availability;
CREATE POLICY "Connected users and staff can view mentor availability"
ON public.mentor_availability
FOR SELECT
TO authenticated
USING (
  public.is_staff()
  OR mentor_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.mentor_connections mc
    WHERE mc.mentor_id = public.mentor_availability.mentor_id
      AND mc.founder_id = auth.uid()
      AND mc.status = 'accepted'
  )
);

-- Tighten user_roles visibility for mentor_externo: only staff, the mentor
-- themselves, and users with an accepted connection to that specific mentor.
DROP POLICY IF EXISTS "Workspace members and staff can view mentor roles" ON public.user_roles;
CREATE POLICY "Connected users and staff can view mentor roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  role = 'mentor_externo'::public.app_role
  AND (
    public.is_staff()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.mentor_connections mc
      WHERE mc.mentor_id = public.user_roles.user_id
        AND mc.founder_id = auth.uid()
        AND mc.status = 'accepted'
    )
  )
);
