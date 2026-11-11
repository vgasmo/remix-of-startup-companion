-- RC13 P00 · resíduos da RC12 que só existiam como alterações de dados feitas à mão (idempotente).
-- 1) DBP-07 / OPS-12: o monitor de saúde passa a conhecer a purga diária de logs.
INSERT INTO public.automation_health_expectations (job_name, expected_cadence_seconds, grace_seconds, severity, owner)
VALUES ('purge_operational_logs', 86400, 3600, 'low', 'ops')
ON CONFLICT (job_name) DO NOTHING;

-- 2) E2E-04: leads já contratadas que ficaram com type = 'lead' (o trigger da RC12 só trata as novas).
UPDATE public.funnel_items
   SET type = 'startup_active', converted_at = COALESCE(converted_at, updated_at, now())
 WHERE type = 'lead' AND linked_workspace_id IS NOT NULL AND stage IN ('contracted', 'incubating', 'accelerating');

-- 3) FEX-05: notificações já criadas com links para rotas ou separadores que não existem.
UPDATE public.notifications
   SET link = '/my-workspaces' || substr(link, length('/dashboard') + 1)
 WHERE link = '/dashboard' OR link LIKE '/dashboard?%';
--    avisos de intake parado: vão para a lead no CRM quando o intake a tem...
UPDATE public.notifications n
   SET link = '/crm?open=' || ci.funnel_item_id
  FROM public.contract_intakes ci
 WHERE n.link = '/admin?tab=contracts' AND n.entity_type = 'contract_intake'
   AND n.entity_id = ci.id AND ci.funnel_item_id IS NOT NULL;
--    ...e os restantes para os contratos do backoffice
UPDATE public.notifications
   SET link = '/admin?tab=backoffice&subtab=contracts'
 WHERE link = '/admin?tab=contracts';
--    avisos de lead parada: vão para a própria lead
UPDATE public.notifications
   SET link = '/crm?open=' || entity_id
 WHERE link = '/admin?tab=crm' AND entity_type = 'funnel_item' AND entity_id IS NOT NULL;

-- 4) FEB-01 (família): startups.startup_portugal_document_path é escrito pelo founder e aberto pelo staff com um clique.
--    Mesma regra das 7 colunas da RC12 (drizzle 0020): NULL, http(s):// ou valor sem ':'. Idempotente.
UPDATE public.startups
   SET startup_portugal_document_path = NULL
 WHERE startup_portugal_document_path IS NOT NULL
   AND NOT (startup_portugal_document_path ~* '^\s*https?://' OR startup_portugal_document_path !~ ':');
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'startups_startup_portugal_document_path_safe_scheme_chk'
                    AND conrelid = 'public.startups'::regclass) THEN
    ALTER TABLE public.startups
      ADD CONSTRAINT startups_startup_portugal_document_path_safe_scheme_chk
      CHECK (startup_portugal_document_path IS NULL
             OR startup_portugal_document_path ~* '^\s*https?://'
             OR startup_portugal_document_path !~ ':') NOT VALID;
  END IF;
END $$;
