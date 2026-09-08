-- 1) automation_health_summary: enforce querying user's permissions
ALTER VIEW public.automation_health_summary SET (security_invoker = true);
REVOKE ALL ON public.automation_health_summary FROM anon;
GRANT SELECT ON public.automation_health_summary TO authenticated;
GRANT ALL ON public.automation_health_summary TO service_role;

-- 2) tags: only staff may create global taxonomy entries
DROP POLICY IF EXISTS "Authenticated users can create tags" ON public.tags;
CREATE POLICY "Staff can create tags"
  ON public.tags
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff());