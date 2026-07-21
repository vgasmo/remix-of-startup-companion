
CREATE TABLE public.founder_pulse_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  period_month DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, period_month),
  CONSTRAINT founder_pulse_cycles_status_check CHECK (status IN ('open','closed'))
);
CREATE INDEX idx_founder_pulse_cycles_workspace ON public.founder_pulse_cycles(workspace_id, period_month DESC);

GRANT SELECT, INSERT, UPDATE ON public.founder_pulse_cycles TO authenticated;
GRANT ALL ON public.founder_pulse_cycles TO service_role;
ALTER TABLE public.founder_pulse_cycles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members and staff can view cycles"
  ON public.founder_pulse_cycles FOR SELECT TO authenticated
  USING (
    public.has_workspace_access(auth.uid(), workspace_id)
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'consultor')
    OR public.has_role(auth.uid(), 'backoffice')
  );

CREATE POLICY "Staff can manage cycles"
  ON public.founder_pulse_cycles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'consultor') OR public.has_role(auth.uid(), 'backoffice'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'consultor') OR public.has_role(auth.uid(), 'backoffice'));

CREATE TRIGGER update_founder_pulse_cycles_updated_at
  BEFORE UPDATE ON public.founder_pulse_cycles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.founder_pulse_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES public.founder_pulse_cycles(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  respondent_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mood SMALLINT NOT NULL,
  confidence SMALLINT NOT NULL,
  blockers TEXT,
  wins TEXT,
  ask TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, respondent_id),
  CONSTRAINT mood_range CHECK (mood BETWEEN 1 AND 5),
  CONSTRAINT confidence_range CHECK (confidence BETWEEN 1 AND 5)
);
CREATE INDEX idx_founder_pulse_responses_cycle ON public.founder_pulse_responses(cycle_id);
CREATE INDEX idx_founder_pulse_responses_workspace ON public.founder_pulse_responses(workspace_id, submitted_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.founder_pulse_responses TO authenticated;
GRANT ALL ON public.founder_pulse_responses TO service_role;
ALTER TABLE public.founder_pulse_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Founders manage own response"
  ON public.founder_pulse_responses FOR ALL TO authenticated
  USING (respondent_id = auth.uid())
  WITH CHECK (
    respondent_id = auth.uid()
    AND public.has_workspace_access(auth.uid(), workspace_id)
  );

CREATE POLICY "Staff view responses"
  ON public.founder_pulse_responses FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'consultor') OR public.has_role(auth.uid(), 'backoffice'));

CREATE TRIGGER update_founder_pulse_responses_updated_at
  BEFORE UPDATE ON public.founder_pulse_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.open_monthly_founder_pulse_cycles()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month DATE := date_trunc('month', now())::date;
  v_count INTEGER := 0;
BEGIN
  INSERT INTO public.founder_pulse_cycles (workspace_id, period_month, status)
  SELECT w.id, v_month, 'open'
  FROM public.workspaces w
  WHERE w.archived_at IS NULL
    AND COALESCE(w.status, 'active') = 'active'
  ON CONFLICT (workspace_id, period_month) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.open_monthly_founder_pulse_cycles() FROM public;
GRANT EXECUTE ON FUNCTION public.open_monthly_founder_pulse_cycles() TO service_role;
