
-- Server-side canonical booking resolver. Extracts the routing token from the
-- canonical link's stored URL so /book can render inline without redirecting
-- the visitor to /book/<token>. Fail-closed: NULL when no active canonical
-- link exists.
CREATE OR REPLACE FUNCTION public.resolve_canonical_booking_token()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(regexp_replace(canonical_url, '^.*/book/', ''), canonical_url)
    FROM public.public_booking_links
   WHERE is_canonical = true
     AND active = true
     AND canonical_url IS NOT NULL
     AND (expires_at IS NULL OR expires_at > now())
   ORDER BY created_at DESC
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_canonical_booking_token() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_canonical_booking_token() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.resolve_canonical_booking_token() IS
  'Returns the routing token of the current canonical public_booking_link so /book can render inline without placing the token in the browser URL. Fail-closed: NULL when no active canonical link exists.';
