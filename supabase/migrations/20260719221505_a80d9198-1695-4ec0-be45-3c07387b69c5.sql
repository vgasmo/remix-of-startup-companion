CREATE TABLE IF NOT EXISTS public.user_calendar_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  token_hash text UNIQUE,
  expires_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.user_calendar_tokens TO service_role;

ALTER TABLE public.user_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_user_calendar_tokens_expires_at
  ON public.user_calendar_tokens(expires_at) WHERE expires_at IS NOT NULL;

INSERT INTO public.user_calendar_tokens (user_id, token_hash, expires_at)
SELECT id, calendar_feed_token, calendar_token_expires_at
FROM public.profiles
WHERE calendar_feed_token IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_my_calendar_token_status()
RETURNS TABLE(has_token boolean, expires_at timestamptz)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (t.token_hash IS NOT NULL) AS has_token,
         t.expires_at
  FROM public.user_calendar_tokens t
  WHERE t.user_id = auth.uid();
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
  INSERT INTO public.user_calendar_tokens (user_id, token_hash, expires_at, updated_at)
  VALUES (auth.uid(), _token_hash, _expires_at, now())
  ON CONFLICT (user_id) DO UPDATE
    SET token_hash = EXCLUDED.token_hash,
        expires_at = EXCLUDED.expires_at,
        updated_at = now();
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_calendar_token(text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_calendar_token(text, timestamptz) TO authenticated;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS calendar_feed_token;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS calendar_token_expires_at;