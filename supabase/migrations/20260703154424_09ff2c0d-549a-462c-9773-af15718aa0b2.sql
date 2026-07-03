CREATE POLICY "Backoffice can view incubation types"
  ON public.incubation_types FOR SELECT TO authenticated
  USING (public.can_access_backoffice());