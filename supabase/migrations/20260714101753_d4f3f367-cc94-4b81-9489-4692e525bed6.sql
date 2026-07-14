-- G0: extend checkin_instances UPDATE access to backoffice staff so review
-- actions from the staff Work Queue actually persist reviewed_at. Previously
-- backoffice hit RLS silently, the queue item got marked done, and the
-- check-in stayed pending forever.
CREATE POLICY "Backoffice can update checkin instances"
ON public.checkin_instances
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'backoffice'::app_role
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
      AND user_roles.role = 'backoffice'::app_role
  )
);