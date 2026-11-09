-- Executa-se na base real (migrações + migração de recuperação RC12), dentro de uma transação descartável.
-- Regressão: ações ligadas a marcos arquivados não contam como atrasadas; o portefólio "atribuído" usa só o
-- consultor principal; awaiting_validation não conta como atraso.
BEGIN;
SELECT plan(5);
INSERT INTO auth.users(id, email) VALUES ('40000000-0000-4000-8000-000000000001', 'portfolio-admin@test.local');
INSERT INTO public.profiles(id, email, account_status) VALUES ('40000000-0000-4000-8000-000000000001', 'portfolio-admin@test.local', 'approved')
  ON CONFLICT (id) DO UPDATE SET account_status = 'approved';
INSERT INTO public.user_roles(user_id, role) VALUES ('40000000-0000-4000-8000-000000000001', 'admin') ON CONFLICT DO NOTHING;
INSERT INTO public.programs(id, name, is_active) VALUES ('30000000-0000-4000-8000-000000000001', 'Portfolio Program', true);
INSERT INTO public.startups(id, name) VALUES ('20000000-0000-4000-8000-000000000001', 'Portfolio Startup');
INSERT INTO public.workspaces(id, startup_id, program_id, status)
VALUES ('10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'active');
INSERT INTO public.milestones(id, workspace_id, title, archived_at) VALUES
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'arquivado', now()),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'ativo', NULL);
INSERT INTO public.action_items(workspace_id, milestone_id, title, status, due_date)
SELECT '10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'a' || g, 'pending', CURRENT_DATE - 1 FROM generate_series(1, 6) g;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT is((SELECT overdue_actions_count FROM public.get_workspace_stats(ARRAY['10000000-0000-4000-8000-000000000001'::uuid])), 0,
          'ações de marcos arquivados não contam como atrasadas');
SELECT is((SELECT count(*) FROM public.search_workspaces_paged(_overdue_actions => true))::int, 0, 'filtro de atrasos exclui marcos arquivados');
RESET ROLE;
INSERT INTO public.action_items(workspace_id, milestone_id, title, status, due_date) VALUES
  ('10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 'b1', 'pending', CURRENT_DATE - 1),
  ('10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000002', 'b2', 'awaiting_validation', CURRENT_DATE - 1);
SET LOCAL ROLE authenticated;
SELECT is((SELECT overdue_actions_count FROM public.get_workspace_stats(ARRAY['10000000-0000-4000-8000-000000000001'::uuid])), 1,
          'só uma ação aberta e atrasada (awaiting_validation não conta)');
SELECT is((SELECT count(*) FROM public.search_workspaces_paged(_overdue_actions => true))::int, 1, 'filtro de atrasos mostra a ação ativa');
SELECT is((SELECT count(*) FROM public.search_workspaces_paged(_assigned_to => '40000000-0000-4000-8000-000000000002'))::int, 0,
          'portefólio de outro consultor não vaza');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
