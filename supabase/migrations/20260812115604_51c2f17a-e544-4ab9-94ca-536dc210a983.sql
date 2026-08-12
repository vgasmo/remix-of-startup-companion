-- user_calendar_tokens and public_booking_rate_limits are server-only tables
-- (edge functions / SECURITY DEFINER RPCs run as service_role, which bypasses
-- RLS). They had RLS enabled with zero policies, which is fail-closed but
-- flagged by the linter as "RLS enabled, no policy". Make the intent explicit
-- with deny-all policies and remove any direct grants.

REVOKE ALL ON TABLE public.user_calendar_tokens FROM anon, authenticated;
REVOKE ALL ON TABLE public.public_booking_rate_limits FROM anon, authenticated;

GRANT ALL ON TABLE public.user_calendar_tokens TO service_role;
GRANT ALL ON TABLE public.public_booking_rate_limits TO service_role;

ALTER TABLE public.user_calendar_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_booking_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Server-only: no client access to calendar tokens" ON public.user_calendar_tokens;
CREATE POLICY "Server-only: no client access to calendar tokens"
  ON public.user_calendar_tokens
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "Server-only: no client access to booking rate limits" ON public.public_booking_rate_limits;
CREATE POLICY "Server-only: no client access to booking rate limits"
  ON public.public_booking_rate_limits
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMENT ON TABLE public.user_calendar_tokens IS 'Server-only (service_role / SECURITY DEFINER). Client access denied by RLS.';
COMMENT ON TABLE public.public_booking_rate_limits IS 'Server-only (service_role / SECURITY DEFINER). Client access denied by RLS.';