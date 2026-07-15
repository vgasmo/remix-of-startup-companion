CREATE OR REPLACE FUNCTION public.can_edit_financial_plan(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.has_workspace_access(auth.uid(), _workspace_id)
     AND NOT EXISTS (
       SELECT 1
         FROM public.user_roles
        WHERE user_id = auth.uid()
          AND role = 'mentor_externo'
     );
$function$;

COMMENT ON FUNCTION public.can_edit_financial_plan(uuid)
  IS 'True when the caller can WRITE the financial plan for this workspace. Mentors are read-only.';

GRANT EXECUTE ON FUNCTION public.can_edit_financial_plan(uuid) TO authenticated;

DROP POLICY IF EXISTS fa_insert ON public.financial_assumptions;
DROP POLICY IF EXISTS fa_update ON public.financial_assumptions;
DROP POLICY IF EXISTS fa_delete ON public.financial_assumptions;
CREATE POLICY fa_insert ON public.financial_assumptions
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_financial_plan(workspace_id));
CREATE POLICY fa_update ON public.financial_assumptions
  FOR UPDATE TO authenticated
  USING (public.can_edit_financial_plan(workspace_id))
  WITH CHECK (public.can_edit_financial_plan(workspace_id));
CREATE POLICY fa_delete ON public.financial_assumptions
  FOR DELETE TO authenticated
  USING (public.can_edit_financial_plan(workspace_id));

DROP POLICY IF EXISTS fps_insert ON public.financial_plan_sessions;
DROP POLICY IF EXISTS fps_update ON public.financial_plan_sessions;
DROP POLICY IF EXISTS fps_delete ON public.financial_plan_sessions;
CREATE POLICY fps_insert ON public.financial_plan_sessions
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_financial_plan(workspace_id));
CREATE POLICY fps_update ON public.financial_plan_sessions
  FOR UPDATE TO authenticated
  USING (public.can_edit_financial_plan(workspace_id))
  WITH CHECK (public.can_edit_financial_plan(workspace_id));
CREATE POLICY fps_delete ON public.financial_plan_sessions
  FOR DELETE TO authenticated
  USING (public.can_edit_financial_plan(workspace_id));

DROP POLICY IF EXISTS fpp_insert ON public.financial_prefill_proposals;
DROP POLICY IF EXISTS fpp_update ON public.financial_prefill_proposals;
DROP POLICY IF EXISTS fpp_delete ON public.financial_prefill_proposals;
CREATE POLICY fpp_insert ON public.financial_prefill_proposals
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_financial_plan(workspace_id));
CREATE POLICY fpp_update ON public.financial_prefill_proposals
  FOR UPDATE TO authenticated
  USING (public.can_edit_financial_plan(workspace_id))
  WITH CHECK (public.can_edit_financial_plan(workspace_id));
CREATE POLICY fpp_delete ON public.financial_prefill_proposals
  FOR DELETE TO authenticated
  USING (public.can_edit_financial_plan(workspace_id));