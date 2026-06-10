-- 1) buildings: restrict SELECT to staff only
DROP POLICY IF EXISTS "Staff can view buildings" ON public.buildings;
CREATE POLICY "Staff can view buildings"
  ON public.buildings
  FOR SELECT
  TO authenticated
  USING (public.is_staff());

-- 2) workspace_celebrations: constrain event_key shape (prevents spam/misuse)
ALTER TABLE public.workspace_celebrations
  DROP CONSTRAINT IF EXISTS workspace_celebrations_event_key_check;
ALTER TABLE public.workspace_celebrations
  ADD CONSTRAINT workspace_celebrations_event_key_check
  CHECK (event_key ~ '^[a-z0-9_:.-]{1,64}$');

-- 3) documents: block non-staff from modifying staff_only documents
DROP POLICY IF EXISTS "Block non-staff writes on staff_only documents" ON public.documents;
CREATE POLICY "Block non-staff writes on staff_only documents"
  ON public.documents
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (visibility <> 'staff_only' OR public.is_staff())
  WITH CHECK (visibility <> 'staff_only' OR public.is_staff());

-- 4) profiles.calendar_feed_token: owner-only via SECURITY DEFINER RPCs
REVOKE SELECT (calendar_feed_token), UPDATE (calendar_feed_token)
  ON public.profiles FROM authenticated;
REVOKE SELECT (calendar_feed_token), UPDATE (calendar_feed_token)
  ON public.profiles FROM anon;

CREATE OR REPLACE FUNCTION public.get_my_calendar_token_status()
RETURNS TABLE(has_token boolean, expires_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (calendar_feed_token IS NOT NULL) AS has_token,
         calendar_token_expires_at         AS expires_at
  FROM public.profiles
  WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.get_my_calendar_token_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_calendar_token_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_my_calendar_token(
  _token_hash text,
  _expires_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF _token_hash IS NULL OR length(_token_hash) <> 64 OR _token_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid token hash';
  END IF;
  UPDATE public.profiles
     SET calendar_feed_token = _token_hash,
         calendar_token_expires_at = _expires_at
   WHERE id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_calendar_token(text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_calendar_token(text, timestamptz) TO authenticated;