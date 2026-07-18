
ALTER TABLE public.public_booking_links
  ADD COLUMN IF NOT EXISTS canonical_url text;

-- Enforce single active canonical link (defense-in-depth alongside the app-level clear)
CREATE UNIQUE INDEX IF NOT EXISTS public_booking_links_one_active_canonical
  ON public.public_booking_links ((is_canonical))
  WHERE is_canonical = true AND active = true;

-- Clear the canonical_url when a link is deactivated so /book never points to a dead link
CREATE OR REPLACE FUNCTION public.clear_canonical_url_on_deactivate()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.active = false AND OLD.active = true THEN
    NEW.canonical_url := NULL;
    NEW.is_canonical  := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_public_booking_links_deactivate ON public.public_booking_links;
CREATE TRIGGER trg_public_booking_links_deactivate
  BEFORE UPDATE ON public.public_booking_links
  FOR EACH ROW EXECUTE FUNCTION public.clear_canonical_url_on_deactivate();

-- Anonymous /book resolver needs to read (only) the canonical URL of the single
-- active canonical link. Expose that via a security-definer function rather than
-- widening RLS on the table.
CREATE OR REPLACE FUNCTION public.get_canonical_booking_url()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT canonical_url
    FROM public.public_booking_links
   WHERE is_canonical = true
     AND active = true
     AND canonical_url IS NOT NULL
     AND (expires_at IS NULL OR expires_at > now())
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_canonical_booking_url() TO anon, authenticated, service_role;
