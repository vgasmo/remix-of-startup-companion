
CREATE OR REPLACE FUNCTION public.can_write_startup_data(_startup_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_admin() OR EXISTS (
    SELECT 1
    FROM public.workspace_users wu
    JOIN public.workspaces w ON w.id = wu.workspace_id
    WHERE w.startup_id = _startup_id
      AND wu.user_id = auth.uid()
      AND wu.active = true
      AND wu.role IN ('consultor', 'founder')
  )
$$;

REVOKE ALL ON FUNCTION public.can_write_startup_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_write_startup_data(uuid) TO authenticated, service_role;

-- investors: split the permissive ALL policy so external mentors only retain SELECT.
DROP POLICY IF EXISTS "Users can manage investors for their startups" ON public.investors;

CREATE POLICY "Founders and staff can insert investors"
  ON public.investors
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_write_startup_data(startup_id));

CREATE POLICY "Founders and staff can update investors"
  ON public.investors
  FOR UPDATE
  TO authenticated
  USING (public.can_write_startup_data(startup_id))
  WITH CHECK (public.can_write_startup_data(startup_id));

CREATE POLICY "Founders and staff can delete investors"
  ON public.investors
  FOR DELETE
  TO authenticated
  USING (public.can_write_startup_data(startup_id));

-- funding_rounds: same split.
DROP POLICY IF EXISTS "Users can manage funding rounds for their startups" ON public.funding_rounds;

CREATE POLICY "Founders and staff can insert funding rounds"
  ON public.funding_rounds
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_write_startup_data(startup_id));

CREATE POLICY "Founders and staff can update funding rounds"
  ON public.funding_rounds
  FOR UPDATE
  TO authenticated
  USING (public.can_write_startup_data(startup_id))
  WITH CHECK (public.can_write_startup_data(startup_id));

CREATE POLICY "Founders and staff can delete funding rounds"
  ON public.funding_rounds
  FOR DELETE
  TO authenticated
  USING (public.can_write_startup_data(startup_id));
