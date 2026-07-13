-- Phase 3 batch 1 — revoke anonymous EXECUTE on SECURITY DEFINER helpers
-- that should never be callable by unauthenticated clients.
--
-- Kept public (intentionally callable by anon): check_signup_allowed
-- (used by the Login page before the user has a session).

-- Trigger-only helpers (invoked by triggers regardless of caller privilege).
REVOKE EXECUTE ON FUNCTION public.auto_activate_workspace_on_founder() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_open_reconnect_on_dead_booking() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_action_awaiting_validation() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_mentor_booking_change() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.notify_mentor_connection_change() FROM anon, PUBLIC;

-- Staff-only RPCs — clients must be authenticated.
REVOKE EXECUTE ON FUNCTION public.publish_program_version(uuid, jsonb, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_program_version(uuid, jsonb, jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.staff_convert_funnel_item_to_startup(
  uuid, uuid, text, uuid, uuid, numeric, numeric, text, text, text, text
) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_convert_funnel_item_to_startup(
  uuid, uuid, text, uuid, uuid, numeric, numeric, text, text, text, text
) TO authenticated;

-- Authenticated-only mentor analytics RPCs.
REVOKE EXECUTE ON FUNCTION public.get_mentor_busy_slots(uuid, date, date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mentor_busy_slots(uuid, date, date) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.get_mentor_impact(uuid, date, date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_mentor_impact(uuid, date, date) TO authenticated;