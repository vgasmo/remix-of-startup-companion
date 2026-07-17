REVOKE ALL ON FUNCTION public.complete_milestone_with_actions(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_milestone_with_actions(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.complete_milestone_with_actions(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_milestone_with_actions(uuid, uuid) TO service_role;