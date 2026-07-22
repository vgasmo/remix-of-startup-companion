
-- Fix 1: Remove direct peer PII exposure on profiles. Peers must go through profiles_safe view which masks email/phone/linkedin_url.
DROP POLICY IF EXISTS "Members can view peer profiles" ON public.profiles;

-- Recreate profiles_safe as SECURITY DEFINER so peers can still read masked fields
-- without needing row-level SELECT on public.profiles. The view itself enforces:
--   * caller must be authenticated
--   * caller must be self, staff, or share an active workspace with the target
--   * PII columns (email, phone, linkedin_url) are only exposed to self or staff
DROP VIEW IF EXISTS public.profiles_safe;
CREATE VIEW public.profiles_safe
WITH (security_invoker = false, security_barrier = true) AS
SELECT
  p.id,
  p.full_name,
  p.avatar_url,
  p.bio,
  p.expertise,
  CASE WHEN auth.uid() = p.id OR public.is_staff() THEN p.email ELSE NULL::text END AS email,
  CASE WHEN auth.uid() = p.id OR public.is_staff() THEN p.phone ELSE NULL::text END AS phone,
  CASE WHEN auth.uid() = p.id OR public.is_staff() THEN p.linkedin_url ELSE NULL::text END AS linkedin_url,
  p.created_at,
  p.updated_at
FROM public.profiles p
WHERE auth.uid() IS NOT NULL
  AND (
    auth.uid() = p.id
    OR public.is_staff()
    OR EXISTS (
      SELECT 1
      FROM public.workspace_users a
      JOIN public.workspace_users b ON a.workspace_id = b.workspace_id
      WHERE a.user_id = auth.uid() AND a.active AND b.user_id = p.id AND b.active
    )
  );

ALTER VIEW public.profiles_safe OWNER TO postgres;
GRANT SELECT ON public.profiles_safe TO authenticated;

-- Fix 2: Pin search_path on the only user-defined function missing it.
ALTER FUNCTION public.jsonb_deep_merge(jsonb, jsonb) SET search_path = public;
