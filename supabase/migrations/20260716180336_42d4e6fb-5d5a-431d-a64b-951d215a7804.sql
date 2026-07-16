ALTER TABLE public.public_booking_links
  ADD COLUMN IF NOT EXISTS is_canonical boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS label text;

-- Enforce at most one active canonical link at a time (partial unique index).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_public_booking_links_canonical_active
  ON public.public_booking_links ((is_canonical))
  WHERE is_canonical = true AND active = true;