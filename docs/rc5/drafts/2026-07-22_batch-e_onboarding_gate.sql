-- RC5 Batch E — tighten complete_workspace_onboarding to founder-or-staff.
--
-- Prior gate: "any active workspace_users row OR is_staff()".
-- New gate:   "founder/owner in workspace_users AND active OR is_staff()".
--
-- Forward-only. Idempotent. No data mutation.

CREATE OR REPLACE FUNCTION public.complete_workspace_onboarding(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_users wu
    WHERE wu.workspace_id = p_workspace_id
      AND wu.user_id = auth.uid()
      AND wu.active = true
      AND wu.role IN ('founder', 'owner')
  ) AND NOT public.is_staff() THEN
    RAISE EXCEPTION 'forbidden — only workspace founder/owner or staff may complete onboarding'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspaces
     SET needs_onboarding = false, updated_at = now()
   WHERE id = p_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_workspace_onboarding(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_workspace_onboarding(uuid) TO authenticated;
