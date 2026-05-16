UPDATE public.public_booking_links
SET active = false
WHERE token_hash IS NOT NULL
  AND (length(token_hash) <> 64 OR token_hash !~ '^[0-9a-f]+$');