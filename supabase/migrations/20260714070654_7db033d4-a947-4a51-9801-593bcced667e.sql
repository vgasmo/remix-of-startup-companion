
-- Batch B — Guided Financial Plan builder foundation

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='financial_plan_scenario') THEN
    CREATE TYPE public.financial_plan_scenario AS ENUM ('base','conservative','optimistic');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='financial_assumption_source') THEN
    CREATE TYPE public.financial_assumption_source AS ENUM (
      'founder','prefill_profile','prefill_kpi','prefill_ai','imported_xlsm'
    );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname='financial_prefill_status') THEN
    CREATE TYPE public.financial_prefill_status AS ENUM ('pending','accepted','rejected');
  END IF;
END $$;

CREATE TABLE public.financial_plan_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  active_version_id UUID REFERENCES public.financial_model_versions(id) ON DELETE SET NULL,
  scenario public.financial_plan_scenario NOT NULL DEFAULT 'base',
  current_step TEXT NOT NULL DEFAULT 'diagnostic',
  diagnostic_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_packs TEXT[] NOT NULL DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, scenario)
);
CREATE INDEX idx_fps_workspace ON public.financial_plan_sessions(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_plan_sessions TO authenticated;
GRANT ALL ON public.financial_plan_sessions TO service_role;
ALTER TABLE public.financial_plan_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fps_read" ON public.financial_plan_sessions FOR SELECT TO authenticated
  USING (public.has_workspace_access(workspace_id, auth.uid()));
CREATE POLICY "fps_insert" ON public.financial_plan_sessions FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_access(workspace_id, auth.uid()));
CREATE POLICY "fps_update" ON public.financial_plan_sessions FOR UPDATE TO authenticated
  USING (public.has_workspace_access(workspace_id, auth.uid()))
  WITH CHECK (public.has_workspace_access(workspace_id, auth.uid()));
CREATE POLICY "fps_delete" ON public.financial_plan_sessions FOR DELETE TO authenticated
  USING (public.has_workspace_access(workspace_id, auth.uid()));
CREATE TRIGGER trg_fps_updated_at BEFORE UPDATE ON public.financial_plan_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.financial_assumptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.financial_model_versions(id) ON DELETE SET NULL,
  scenario public.financial_plan_scenario NOT NULL DEFAULT 'base',
  key TEXT NOT NULL,
  period_index INTEGER,
  value_numeric NUMERIC,
  value_json JSONB,
  unit TEXT,
  source public.financial_assumption_source NOT NULL DEFAULT 'founder',
  confidence NUMERIC CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  rationale TEXT,
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, scenario, key, period_index)
);
CREATE INDEX idx_fa_workspace ON public.financial_assumptions(workspace_id);
CREATE INDEX idx_fa_key ON public.financial_assumptions(workspace_id, scenario, key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_assumptions TO authenticated;
GRANT ALL ON public.financial_assumptions TO service_role;
ALTER TABLE public.financial_assumptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fa_read" ON public.financial_assumptions FOR SELECT TO authenticated
  USING (public.has_workspace_access(workspace_id, auth.uid()));
CREATE POLICY "fa_insert" ON public.financial_assumptions FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_access(workspace_id, auth.uid()));
CREATE POLICY "fa_update" ON public.financial_assumptions FOR UPDATE TO authenticated
  USING (public.has_workspace_access(workspace_id, auth.uid()))
  WITH CHECK (public.has_workspace_access(workspace_id, auth.uid()));
CREATE POLICY "fa_delete" ON public.financial_assumptions FOR DELETE TO authenticated
  USING (public.has_workspace_access(workspace_id, auth.uid()));
CREATE TRIGGER trg_fa_updated_at BEFORE UPDATE ON public.financial_assumptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.financial_prefill_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scenario public.financial_plan_scenario NOT NULL DEFAULT 'base',
  key TEXT NOT NULL,
  period_index INTEGER,
  proposed_value_numeric NUMERIC,
  proposed_value_json JSONB,
  unit TEXT,
  source public.financial_assumption_source NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  status public.financial_prefill_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_fpp_workspace_status ON public.financial_prefill_proposals(workspace_id, status);
CREATE INDEX idx_fpp_key ON public.financial_prefill_proposals(workspace_id, scenario, key);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.financial_prefill_proposals TO authenticated;
GRANT ALL ON public.financial_prefill_proposals TO service_role;
ALTER TABLE public.financial_prefill_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fpp_read" ON public.financial_prefill_proposals FOR SELECT TO authenticated
  USING (public.has_workspace_access(workspace_id, auth.uid()));
CREATE POLICY "fpp_insert" ON public.financial_prefill_proposals FOR INSERT TO authenticated
  WITH CHECK (public.has_workspace_access(workspace_id, auth.uid()));
CREATE POLICY "fpp_update" ON public.financial_prefill_proposals FOR UPDATE TO authenticated
  USING (public.has_workspace_access(workspace_id, auth.uid()))
  WITH CHECK (public.has_workspace_access(workspace_id, auth.uid()));
CREATE POLICY "fpp_delete" ON public.financial_prefill_proposals FOR DELETE TO authenticated
  USING (public.has_workspace_access(workspace_id, auth.uid()));
CREATE TRIGGER trg_fpp_updated_at BEFORE UPDATE ON public.financial_prefill_proposals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.feature_flags (key, enabled, scope, description)
VALUES ('financial_business_plan_coach_v1', false, 'global', 'Enables the guided Financial + Business Plan Coach experience.')
ON CONFLICT (key) DO NOTHING;
