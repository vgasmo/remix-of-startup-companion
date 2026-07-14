-- Fix arg order: existing policies call has_workspace_access(workspace_id, auth.uid())
-- but the 2-arg function is has_workspace_access(_user_id, _workspace_id).
-- Use the 1-arg overload which reads auth.uid() internally.

-- financial_plan_sessions
DROP POLICY IF EXISTS fps_read   ON public.financial_plan_sessions;
DROP POLICY IF EXISTS fps_insert ON public.financial_plan_sessions;
DROP POLICY IF EXISTS fps_update ON public.financial_plan_sessions;
DROP POLICY IF EXISTS fps_delete ON public.financial_plan_sessions;
CREATE POLICY fps_read   ON public.financial_plan_sessions FOR SELECT USING (has_workspace_access(workspace_id));
CREATE POLICY fps_insert ON public.financial_plan_sessions FOR INSERT WITH CHECK (has_workspace_access(workspace_id));
CREATE POLICY fps_update ON public.financial_plan_sessions FOR UPDATE USING (has_workspace_access(workspace_id)) WITH CHECK (has_workspace_access(workspace_id));
CREATE POLICY fps_delete ON public.financial_plan_sessions FOR DELETE USING (has_workspace_access(workspace_id));

-- financial_assumptions
DROP POLICY IF EXISTS fa_read   ON public.financial_assumptions;
DROP POLICY IF EXISTS fa_insert ON public.financial_assumptions;
DROP POLICY IF EXISTS fa_update ON public.financial_assumptions;
DROP POLICY IF EXISTS fa_delete ON public.financial_assumptions;
CREATE POLICY fa_read   ON public.financial_assumptions FOR SELECT USING (has_workspace_access(workspace_id));
CREATE POLICY fa_insert ON public.financial_assumptions FOR INSERT WITH CHECK (has_workspace_access(workspace_id));
CREATE POLICY fa_update ON public.financial_assumptions FOR UPDATE USING (has_workspace_access(workspace_id)) WITH CHECK (has_workspace_access(workspace_id));
CREATE POLICY fa_delete ON public.financial_assumptions FOR DELETE USING (has_workspace_access(workspace_id));

-- financial_prefill_proposals
DROP POLICY IF EXISTS fpp_read   ON public.financial_prefill_proposals;
DROP POLICY IF EXISTS fpp_insert ON public.financial_prefill_proposals;
DROP POLICY IF EXISTS fpp_update ON public.financial_prefill_proposals;
DROP POLICY IF EXISTS fpp_delete ON public.financial_prefill_proposals;
CREATE POLICY fpp_read   ON public.financial_prefill_proposals FOR SELECT USING (has_workspace_access(workspace_id));
CREATE POLICY fpp_insert ON public.financial_prefill_proposals FOR INSERT WITH CHECK (has_workspace_access(workspace_id));
CREATE POLICY fpp_update ON public.financial_prefill_proposals FOR UPDATE USING (has_workspace_access(workspace_id)) WITH CHECK (has_workspace_access(workspace_id));
CREATE POLICY fpp_delete ON public.financial_prefill_proposals FOR DELETE USING (has_workspace_access(workspace_id));