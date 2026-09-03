-- ============================================================================
-- Survey write-back
--
-- Until now survey answers only lived in `survey_responses`: nothing reached
-- the canonical tables, so a founder could fill a survey and see no change in
-- their workspace. This migration adds the mapping layer + audit trail that
-- lets a submitted survey feed kpi_values, startups, workspaces and milestones,
-- plus a short "Baseline" template and automatic enrolment of new workspaces.
-- ============================================================================

-- 1) Mapping storage: question_id -> where the answer should be written.
ALTER TABLE public.survey_definitions
  ADD COLUMN IF NOT EXISTS write_back_mappings JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.survey_definitions.write_back_mappings IS
  'question_id -> { target: kpi|startup|workspace|milestone, key?, valueMap?, overwrite?, dateQuestionId? }. Applied by the apply-survey-responses edge function when an instance is submitted.';

-- 2) Campaign kind + automatic enrolment of newly created workspaces.
ALTER TABLE public.survey_campaigns
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'ecosystem',
  ADD COLUMN IF NOT EXISTS auto_enroll BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'survey_campaigns_kind_check'
  ) THEN
    ALTER TABLE public.survey_campaigns
      ADD CONSTRAINT survey_campaigns_kind_check
      CHECK (kind IN ('baseline', 'ecosystem', 'custom'));
  END IF;
END $$;

COMMENT ON COLUMN public.survey_campaigns.auto_enroll IS
  'When true and the campaign is active, every workspace created afterwards gets an instance automatically.';

-- 3) kpi_values must accept survey as a provenance.
ALTER TABLE public.kpi_values DROP CONSTRAINT IF EXISTS kpi_values_source_type_check;
ALTER TABLE public.kpi_values
  ADD CONSTRAINT kpi_values_source_type_check
  CHECK (source_type IN ('manual', 'financial_model', 'import', 'ai', 'survey'));

-- 4) Audit trail: what a survey actually wrote (or refused to write) and where.
CREATE TABLE IF NOT EXISTS public.survey_writebacks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id UUID NOT NULL REFERENCES public.survey_instances(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('kpi', 'startup', 'workspace', 'milestone')),
  target_key TEXT,
  target_row_id UUID,
  value_text TEXT,
  value_number NUMERIC,
  status TEXT NOT NULL CHECK (status IN ('applied', 'skipped', 'error')),
  detail TEXT,
  applied_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (instance_id, question_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.survey_writebacks TO authenticated;
GRANT ALL ON public.survey_writebacks TO service_role;

ALTER TABLE public.survey_writebacks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage survey writebacks" ON public.survey_writebacks;
CREATE POLICY "Admins can manage survey writebacks"
  ON public.survey_writebacks FOR ALL
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users can view writebacks for their workspaces" ON public.survey_writebacks;
CREATE POLICY "Users can view writebacks for their workspaces"
  ON public.survey_writebacks FOR SELECT
  USING (public.has_workspace_access(workspace_id));

CREATE INDEX IF NOT EXISTS idx_survey_writebacks_instance ON public.survey_writebacks(instance_id);
CREATE INDEX IF NOT EXISTS idx_survey_writebacks_workspace ON public.survey_writebacks(workspace_id);

-- 5) New workspaces join active auto-enrol campaigns without admin action.
CREATE OR REPLACE FUNCTION public.enroll_workspace_in_auto_campaigns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.survey_instances (campaign_id, workspace_id, auto_filled_data, status)
  SELECT
    sc.id,
    NEW.id,
    jsonb_build_object(
      'stage', NEW.stage,
      'startup_name', s.name,
      'founded_year', CASE WHEN s.founded_date IS NULL THEN NULL
                           ELSE EXTRACT(YEAR FROM s.founded_date)::int END
    ),
    'pending'
  FROM public.survey_campaigns sc
  LEFT JOIN public.startups s ON s.id = NEW.startup_id
  WHERE sc.auto_enroll = true
    AND sc.status = 'active'
    AND (sc.program_id IS NULL OR sc.program_id = NEW.program_id)
    AND sc.ends_at > now()
  ON CONFLICT (campaign_id, workspace_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enroll_workspace_in_auto_campaigns_trigger ON public.workspaces;
CREATE TRIGGER enroll_workspace_in_auto_campaigns_trigger
  AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.enroll_workspace_in_auto_campaigns();

-- 6) Baseline template: short, and every number lands somewhere canonical.
--    KPI ids below are the global definitions seeded in the initial migration.
INSERT INTO public.survey_definitions (id, name, description, questions_json, auto_fill_mappings, write_back_mappings, is_active)
VALUES (
  'ba5e1100-0000-4000-a000-000000000001',
  'Dados Base da Startup',
  'Levantamento inicial: perfil, números de partida e plano a 6-12 meses. As respostas alimentam automaticamente os KPIs, o perfil e os marcos do workspace.',
  '[
    {"id":"bl_desc","section":"Identificação","question":"Descreva a proposta de valor em 1-2 frases","type":"textarea","required":true},
    {"id":"bl_site","section":"Identificação","question":"Website","type":"text","required":false},
    {"id":"bl_contact_name","section":"Identificação","question":"Nome do contacto principal","type":"text","required":true},
    {"id":"bl_contact_email","section":"Identificação","question":"Email do contacto principal","type":"text","required":true},
    {"id":"bl_contact_phone","section":"Identificação","question":"Telefone do contacto principal","type":"text","required":false},
    {"id":"bl_stage","section":"Estado atual","question":"Em que fase está a startup?","type":"select","options":["Ideação","Validação","MVP / Produto no mercado","Crescimento","Escala"],"required":true,"autoFillKey":"stage"},
    {"id":"bl_team","section":"Estado atual","question":"Quantas pessoas trabalham a tempo inteiro na equipa?","type":"number","required":true},
    {"id":"bl_revenue","section":"Números de partida","question":"Receita do último mês fechado (€)","type":"number","required":true},
    {"id":"bl_burn","section":"Números de partida","question":"Custos operacionais do último mês fechado (€)","type":"number","required":true},
    {"id":"bl_runway","section":"Números de partida","question":"Runway estimado (meses)","type":"number","required":true},
    {"id":"bl_users","section":"Números de partida","question":"Utilizadores ou clientes ativos","type":"number","required":false},
    {"id":"bl_goal1","section":"Plano 6-12 meses","question":"Objetivo 1","type":"text","required":true},
    {"id":"bl_goal1_date","section":"Plano 6-12 meses","question":"Data-alvo do objetivo 1","type":"date","required":true},
    {"id":"bl_goal2","section":"Plano 6-12 meses","question":"Objetivo 2","type":"text","required":false},
    {"id":"bl_goal2_date","section":"Plano 6-12 meses","question":"Data-alvo do objetivo 2","type":"date","required":false},
    {"id":"bl_goal3","section":"Plano 6-12 meses","question":"Objetivo 3","type":"text","required":false},
    {"id":"bl_goal3_date","section":"Plano 6-12 meses","question":"Data-alvo do objetivo 3","type":"date","required":false},
    {"id":"bl_blockers","section":"Apoio necessário","question":"Quais são hoje os principais bloqueios?","type":"multiselect","options":["Financiamento","Vendas/Clientes","Produto/Tecnologia","Equipa/Recrutamento","Legal/IP","Internacionalização","Operações"],"required":false},
    {"id":"bl_support","section":"Apoio necessário","question":"Que apoio faria mais diferença nos próximos 3 meses?","type":"textarea","required":false}
  ]'::jsonb,
  '{"stage":"workspace.stage"}'::jsonb,
  '{
    "bl_desc":{"target":"startup","key":"description"},
    "bl_site":{"target":"startup","key":"website"},
    "bl_contact_name":{"target":"startup","key":"main_contact_name"},
    "bl_contact_email":{"target":"startup","key":"main_contact_email"},
    "bl_contact_phone":{"target":"startup","key":"main_contact_phone"},
    "bl_stage":{"target":"workspace","key":"stage","overwrite":true,"valueMap":{"Ideação":"ideation","Validação":"validation","MVP / Produto no mercado":"mvp","Crescimento":"growth","Escala":"scale"}},
    "bl_team":{"target":"kpi","key":"f47ac10b-58cc-4372-a567-0e02b2c3d487"},
    "bl_revenue":{"target":"kpi","key":"f47ac10b-58cc-4372-a567-0e02b2c3d479"},
    "bl_burn":{"target":"kpi","key":"f47ac10b-58cc-4372-a567-0e02b2c3d480"},
    "bl_runway":{"target":"kpi","key":"f47ac10b-58cc-4372-a567-0e02b2c3d481"},
    "bl_users":{"target":"kpi","key":"f47ac10b-58cc-4372-a567-0e02b2c3d482"},
    "bl_goal1":{"target":"milestone","dateQuestionId":"bl_goal1_date"},
    "bl_goal2":{"target":"milestone","dateQuestionId":"bl_goal2_date"},
    "bl_goal3":{"target":"milestone","dateQuestionId":"bl_goal3_date"}
  }'::jsonb,
  true
)
ON CONFLICT (id) DO NOTHING;

-- 7) Continuous baseline campaign, left as draft so an admin decides when the
--    existing cohort gets enrolled. Once launched, new workspaces join via the
--    trigger above.
INSERT INTO public.survey_campaigns (id, survey_definition_id, name, description, starts_at, ends_at, reminder_days, status, kind, auto_enroll)
VALUES (
  'ba5e1100-0000-4000-a000-000000000002',
  'ba5e1100-0000-4000-a000-000000000001',
  'Dados Base (contínuo)',
  'Levantamento de dados base pedido a cada startup à entrada. Lance a campanha para abranger o cohort atual; as startups criadas depois são inscritas automaticamente.',
  now(),
  now() + interval '10 years',
  '{14, 7, 3, 1}',
  'draft',
  'baseline',
  true
)
ON CONFLICT (id) DO NOTHING;