-- RC13 P03 · notas internas do staff fora do alcance do founder. Corre só no harness descartável; tudo é desfeito.
BEGIN;
SELECT plan(8);
INSERT INTO auth.users(id,email) VALUES
 ('c1300000-0000-4000-8000-000000000101','rc13-notes-cons@example.invalid'),
 ('c1300000-0000-4000-8000-000000000102','rc13-notes-founder@example.invalid');
INSERT INTO public.profiles(id,email,account_status) VALUES
 ('c1300000-0000-4000-8000-000000000101','rc13-notes-cons@example.invalid','approved'),
 ('c1300000-0000-4000-8000-000000000102','rc13-notes-founder@example.invalid','approved')
 ON CONFLICT(id) DO UPDATE SET account_status='approved';
DELETE FROM public.user_roles WHERE user_id IN ('c1300000-0000-4000-8000-000000000101','c1300000-0000-4000-8000-000000000102');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('c1300000-0000-4000-8000-000000000101','consultor'),
 ('c1300000-0000-4000-8000-000000000102','founder');
INSERT INTO public.programs(id,name) VALUES ('c1300000-0000-4000-8000-000000000110','RC13 notas');
INSERT INTO public.startups(id,name,nif) VALUES ('c1300000-0000-4000-8000-000000000120','RC13 notas','509130301');
-- workspace criado já com nota, como fazem as RPCs de conversão de leads
INSERT INTO public.workspaces(id,startup_id,program_id,status,stage,health_notes) VALUES
 ('c1300000-0000-4000-8000-000000000130','c1300000-0000-4000-8000-000000000120','c1300000-0000-4000-8000-000000000110','active','validation','nota de conversão');
INSERT INTO public.workspace_users(workspace_id,user_id,role,active) VALUES
 ('c1300000-0000-4000-8000-000000000130','c1300000-0000-4000-8000-000000000102','founder',true);

SELECT is((SELECT health_notes FROM public.workspaces WHERE id='c1300000-0000-4000-8000-000000000130'), NULL, 'a nota não fica em workspaces');
SELECT is((SELECT health_notes FROM public.workspace_staff_notes WHERE workspace_id='c1300000-0000-4000-8000-000000000130'), 'nota de conversão', 'a nota é desviada para a tabela do staff');

-- consultor: escrita à antiga em workspaces é desviada; lê na tabela nova
SELECT set_config('request.jwt.claim.sub','c1300000-0000-4000-8000-000000000101',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims','{"sub":"c1300000-0000-4000-8000-000000000101","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
UPDATE public.workspaces SET priority_notes='nota de prioridade' WHERE id='c1300000-0000-4000-8000-000000000130';
SELECT is((SELECT priority_notes FROM public.workspace_staff_notes WHERE workspace_id='c1300000-0000-4000-8000-000000000130'), 'nota de prioridade', 'o consultor lê a nota de prioridade na tabela do staff');
SELECT is((SELECT health_notes FROM public.workspace_staff_notes WHERE workspace_id='c1300000-0000-4000-8000-000000000130'), 'nota de conversão', 'gravar uma nota não apaga a outra');
SELECT lives_ok($q$INSERT INTO public.workspace_staff_notes(workspace_id, health_notes) VALUES ('c1300000-0000-4000-8000-000000000130','nota nova') ON CONFLICT (workspace_id) DO UPDATE SET health_notes = EXCLUDED.health_notes$q$, 'o consultor grava diretamente na tabela do staff');
RESET ROLE;

-- founder: não lê nem escreve
SELECT set_config('request.jwt.claim.sub','c1300000-0000-4000-8000-000000000102',true);
SELECT set_config('request.jwt.claims','{"sub":"c1300000-0000-4000-8000-000000000102","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT is((SELECT priority_notes FROM public.workspaces WHERE id='c1300000-0000-4000-8000-000000000130'), NULL, 'o founder não lê a nota em workspaces');
SELECT is((SELECT count(*)::integer FROM public.workspace_staff_notes), 0, 'o founder não lê a tabela do staff');
SELECT throws_ok($q$INSERT INTO public.workspace_staff_notes(workspace_id, health_notes) VALUES ('c1300000-0000-4000-8000-000000000130','x') ON CONFLICT (workspace_id) DO UPDATE SET health_notes = EXCLUDED.health_notes$q$, '42501', NULL, 'o founder não escreve na tabela do staff');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
