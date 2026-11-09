-- Executa-se na base real (migrações + migração de recuperação RC12), dentro de uma transação descartável.
-- Valida staff_mark_funnel_item_contracted: programa obrigatório, notas/metadados/histórico preservados,
-- sem duplicados em reexecução, sem ativação forjada, e recusa de contas suspensas.
BEGIN;
SELECT plan(9);
INSERT INTO auth.users(id, email) VALUES ('c0000000-0000-4000-8000-000000000001', 'crm-staff@test.local');
INSERT INTO public.profiles(id, email, account_status) VALUES ('c0000000-0000-4000-8000-000000000001', 'crm-staff@test.local', 'approved')
  ON CONFLICT (id) DO UPDATE SET account_status = 'approved';
INSERT INTO public.user_roles(user_id, role) VALUES ('c0000000-0000-4000-8000-000000000001', 'admin') ON CONFLICT DO NOTHING;
INSERT INTO public.programs(id, name, is_active) VALUES ('c0000000-0000-4000-8000-000000000002', 'CRM Conversion Program', true);
INSERT INTO public.funnel_items(id, stage, type, organization_name, contact_name, notes, metadata_json)
VALUES ('c0000000-0000-4000-8000-000000000003', 'new', 'lead', 'External contract lead', 'Contact', 'Original notes',
        '{"project_name":"Project preserved","sector":"Technology","custom_data":"retained"}');
INSERT INTO public.communication_log(funnel_item_id, body) VALUES ('c0000000-0000-4000-8000-000000000003', 'Existing CRM meeting');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"c0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

SELECT throws_ok($$SELECT public.staff_mark_funnel_item_contracted('c0000000-0000-4000-8000-000000000003', NULL)$$, '22023', NULL, 'programa em falta é recusado');
SELECT is((SELECT stage FROM public.funnel_items WHERE id = 'c0000000-0000-4000-8000-000000000003'), 'new', 'conversão falhada não altera a fase comercial');

CREATE TEMP TABLE _conv AS SELECT public.staff_mark_funnel_item_contracted('c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', 'growth') AS r;
SELECT is((SELECT w.status FROM public.workspaces w WHERE w.id = ((SELECT r FROM _conv)->>'workspace_id')::uuid), 'pending', 'workspace não é ativado sem assinatura verificada');
SELECT is((SELECT stage FROM public.funnel_items WHERE id = 'c0000000-0000-4000-8000-000000000003'), 'contracted', 'fase contracted registada');
SELECT is((SELECT s.name FROM public.startups s JOIN public.workspaces w ON w.startup_id = s.id WHERE w.id = ((SELECT r FROM _conv)->>'workspace_id')::uuid), 'Project preserved', 'nome do projeto preservado');
SELECT is((SELECT metadata_json->>'custom_data' FROM public.funnel_items WHERE id = 'c0000000-0000-4000-8000-000000000003'), 'retained', 'metadados preservados');
SELECT is((SELECT workspace_id FROM public.communication_log WHERE funnel_item_id = 'c0000000-0000-4000-8000-000000000003'), ((SELECT r FROM _conv)->>'workspace_id')::uuid, 'histórico ligado ao workspace');
SELECT is((SELECT (public.staff_mark_funnel_item_contracted('c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002', 'growth'))->>'workspace_id'),
          ((SELECT r FROM _conv)->>'workspace_id'), 'reexecução devolve o mesmo workspace (sem duplicado)');
RESET ROLE;
UPDATE public.profiles SET account_status = 'suspended' WHERE id = 'c0000000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT throws_ok($$SELECT public.staff_mark_funnel_item_contracted('c0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000002')$$, '42501', NULL, 'conta suspensa é recusada');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
