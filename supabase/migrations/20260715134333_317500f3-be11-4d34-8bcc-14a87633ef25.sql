CREATE OR REPLACE VIEW public.profiles_safe
WITH (security_invoker = true) AS
SELECT
  id,
  full_name,
  avatar_url,
  bio,
  expertise,
  CASE
    WHEN auth.uid() IS NOT NULL AND (auth.uid() = id OR public.is_staff()) THEN email
    ELSE NULL::text
  END AS email,
  CASE
    WHEN auth.uid() IS NOT NULL AND (auth.uid() = id OR public.is_staff()) THEN phone
    ELSE NULL::text
  END AS phone,
  CASE
    WHEN auth.uid() IS NOT NULL AND (auth.uid() = id OR public.is_staff()) THEN linkedin_url
    ELSE NULL::text
  END AS linkedin_url,
  created_at,
  updated_at
FROM public.profiles
WHERE auth.uid() IS NOT NULL;

GRANT SELECT ON public.profiles_safe TO authenticated;
GRANT SELECT ON public.profiles_safe TO service_role;