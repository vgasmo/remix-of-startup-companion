-- RC13 P01 · papel de staff só vale com a conta aprovada. Corre só no harness descartável; todas as fixtures são desfeitas.
BEGIN;
SELECT plan(20);

INSERT INTO auth.users(id,email) VALUES
 ('c1300000-0000-4000-8000-000000000001','rc13-admin-ok@example.invalid'),
 ('c1300000-0000-4000-8000-000000000002','rc13-admin-pend@example.invalid'),
 ('c1300000-0000-4000-8000-000000000003','rc13-cons-pend@example.invalid'),
 ('c1300000-0000-4000-8000-000000000004','rc13-bo-pend@example.invalid'),
 ('c1300000-0000-4000-8000-000000000005','rc13-founder-pend@example.invalid'),
 ('c1300000-0000-4000-8000-000000000006','rc13-founder-ok@example.invalid');
INSERT INTO public.profiles(id,email,account_status) VALUES
 ('c1300000-0000-4000-8000-000000000001','rc13-admin-ok@example.invalid','approved'),
 ('c1300000-0000-4000-8000-000000000002','rc13-admin-pend@example.invalid','pending'),
 ('c1300000-0000-4000-8000-000000000003','rc13-cons-pend@example.invalid','pending'),
 ('c1300000-0000-4000-8000-000000000004','rc13-bo-pend@example.invalid','pending'),
 ('c1300000-0000-4000-8000-000000000005','rc13-founder-pend@example.invalid','pending'),
 ('c1300000-0000-4000-8000-000000000006','rc13-founder-ok@example.invalid','approved')
 ON CONFLICT(id) DO UPDATE SET account_status=EXCLUDED.account_status;
DELETE FROM public.user_roles WHERE user_id::text LIKE 'c1300000-0000-4000-8000-00000000000%';
INSERT INTO public.user_roles(user_id,role) VALUES
 ('c1300000-0000-4000-8000-000000000001','admin'),
 ('c1300000-0000-4000-8000-000000000002','admin'),
 ('c1300000-0000-4000-8000-000000000003','consultor'),
 ('c1300000-0000-4000-8000-000000000004','backoffice'),
 ('c1300000-0000-4000-8000-000000000005','founder'),
 ('c1300000-0000-4000-8000-000000000006','founder');
INSERT INTO public.programs(id,name) VALUES ('c1300000-0000-4000-8000-000000000010','RC13 staff pendente');
INSERT INTO public.startups(id,name,nif) VALUES ('c1300000-0000-4000-8000-000000000020','RC13 staff pendente','509130101');
INSERT INTO public.workspaces(id,startup_id,program_id,status,stage) VALUES
 ('c1300000-0000-4000-8000-000000000030','c1300000-0000-4000-8000-000000000020','c1300000-0000-4000-8000-000000000010','active','validation');
INSERT INTO public.startup_contracts(id,start_date,company_nif,organization_name) VALUES
 ('c1300000-0000-4000-8000-000000000040','2026-11-11','509130101','RC13 staff pendente');

-- has_role não depende do pedido: lê o estado da conta diretamente.
SELECT is(public.has_role('c1300000-0000-4000-8000-000000000001'::uuid, 'admin'::public.app_role), true,  'admin aprovado tem o papel');
SELECT is(public.has_role('c1300000-0000-4000-8000-000000000002'::uuid, 'admin'::public.app_role), false, 'admin pendente não tem o papel');
SELECT is(public.has_role('c1300000-0000-4000-8000-000000000003'::uuid, 'consultor'::public.app_role), false, 'consultor pendente não tem o papel');
SELECT is(public.has_role('c1300000-0000-4000-8000-000000000004'::uuid, 'backoffice'::public.app_role), false, 'backoffice pendente não tem o papel');
SELECT is(public.has_role('c1300000-0000-4000-8000-000000000005'::uuid, 'founder'::public.app_role), true, 'o papel founder não depende da aprovação');

-- admin pendente
SELECT set_config('request.jwt.claim.sub','c1300000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims','{"sub":"c1300000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is(public.is_admin(), false, 'admin pendente: is_admin() é falso');
SELECT is(public.is_staff(), false, 'admin pendente: is_staff() é falso');
SELECT is(public.is_account_active(), false, 'admin pendente: is_account_active() é falso (sem staff bypass)');
SELECT is((SELECT count(*)::integer FROM public.startups WHERE id='c1300000-0000-4000-8000-000000000020'), 0, 'admin pendente não lê startups');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE id='c1300000-0000-4000-8000-000000000006'), 0, 'admin pendente não lê perfis de outros');
SELECT throws_ok($q$UPDATE public.profiles SET account_status='approved' WHERE id='c1300000-0000-4000-8000-000000000002'$q$, '42501', NULL, 'admin pendente não se aprova a si próprio');
SELECT throws_ok($q$INSERT INTO public.user_roles(user_id,role) VALUES ('c1300000-0000-4000-8000-000000000006','admin')$q$, '42501', NULL, 'admin pendente não atribui papéis');
RESET ROLE;

-- consultor pendente
SELECT set_config('request.jwt.claim.sub','c1300000-0000-4000-8000-000000000003',true);
SELECT set_config('request.jwt.claims','{"sub":"c1300000-0000-4000-8000-000000000003","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is(public.is_staff(), false, 'consultor pendente: is_staff() é falso');
UPDATE public.workspaces SET stage='growth' WHERE id='c1300000-0000-4000-8000-000000000030';  -- a RLS devolve 0 linhas, sem erro
RESET ROLE;
SELECT is((SELECT stage::text FROM public.workspaces WHERE id='c1300000-0000-4000-8000-000000000030'), 'validation', 'consultor pendente não altera workspaces');

-- backoffice pendente
SELECT set_config('request.jwt.claim.sub','c1300000-0000-4000-8000-000000000004',true);
SELECT set_config('request.jwt.claims','{"sub":"c1300000-0000-4000-8000-000000000004","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is(public.can_access_backoffice(), false, 'backoffice pendente: can_access_backoffice() é falso');
UPDATE public.startup_contracts SET organization_name='x' WHERE id='c1300000-0000-4000-8000-000000000040';  -- a RLS devolve 0 linhas, sem erro
RESET ROLE;
SELECT is((SELECT organization_name FROM public.startup_contracts WHERE id='c1300000-0000-4000-8000-000000000040'), 'RC13 staff pendente', 'backoffice pendente não altera contratos');

-- founder pendente: fica exatamente como estava (não é tratado como suspenso)
SELECT set_config('request.jwt.claim.sub','c1300000-0000-4000-8000-000000000005',true);
SELECT set_config('request.jwt.claims','{"sub":"c1300000-0000-4000-8000-000000000005","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is(public.account_not_suspended('c1300000-0000-4000-8000-000000000005'::uuid), true, 'founder pendente não é tratado como suspenso');
SELECT is((SELECT count(*)::integer FROM public.profiles WHERE id='c1300000-0000-4000-8000-000000000005'), 1, 'founder pendente continua a ler o próprio perfil');
RESET ROLE;

-- admin aprovado: sem alterações
SELECT set_config('request.jwt.claim.sub','c1300000-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"c1300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is(public.is_admin(), true, 'admin aprovado: is_admin() é verdadeiro');
SELECT is((SELECT count(*)::integer FROM public.startups WHERE id='c1300000-0000-4000-8000-000000000020'), 1, 'admin aprovado lê startups');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
