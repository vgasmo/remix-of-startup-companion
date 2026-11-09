-- Run only through the disposable local harness. Every fixture is rolled back.
BEGIN;
SELECT plan(18);
INSERT INTO auth.users(id,email) VALUES
 ('c1200000-0000-4000-8000-000000000001','rc12-founder@example.invalid'),
 ('c1200000-0000-4000-8000-000000000002','rc12-mentor@example.invalid');
INSERT INTO public.profiles(id,email,account_status) VALUES
 ('c1200000-0000-4000-8000-000000000001','rc12-founder@example.invalid','approved'),
 ('c1200000-0000-4000-8000-000000000002','rc12-mentor@example.invalid','approved')
 ON CONFLICT(id) DO UPDATE SET account_status='approved';
DELETE FROM public.user_roles WHERE user_id IN ('c1200000-0000-4000-8000-000000000001','c1200000-0000-4000-8000-000000000002');
INSERT INTO public.user_roles(user_id,role) VALUES ('c1200000-0000-4000-8000-000000000002','mentor_externo');
INSERT INTO public.programs(id,name) VALUES ('c1200000-0000-4000-8000-000000000010','RC12 data protections');
INSERT INTO public.startups(id,name,nif) VALUES
 ('c1200000-0000-4000-8000-000000000020','RC12 imported','509 120 001'),
 ('c1200000-0000-4000-8000-000000000021','RC12 other','509120002');
INSERT INTO public.workspaces(id,startup_id,program_id,status,stage) VALUES
 ('c1200000-0000-4000-8000-000000000030','c1200000-0000-4000-8000-000000000020','c1200000-0000-4000-8000-000000000010','imported_unclaimed','validation'),
 ('c1200000-0000-4000-8000-000000000031','c1200000-0000-4000-8000-000000000021','c1200000-0000-4000-8000-000000000010','active','validation');
INSERT INTO public.startup_contracts(id,start_date,company_nif,organization_name) VALUES
 ('c1200000-0000-4000-8000-000000000040','2026-11-09','509120001','RC12 imported');
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT is(public.ensure_contract_workspace('c1200000-0000-4000-8000-000000000040'),'c1200000-0000-4000-8000-000000000030'::uuid,'normalized NIF reuses the only imported workspace');
SELECT is((SELECT workspace_id FROM public.startup_contracts WHERE id='c1200000-0000-4000-8000-000000000040'),'c1200000-0000-4000-8000-000000000030'::uuid,'contract persists the reused workspace');
SELECT is((SELECT count(*)::integer FROM public.startups WHERE regexp_replace(nif,'\D','','g')='509120001'),1,'NIF reuse does not duplicate startup');
SELECT is(public.ensure_contract_workspace('c1200000-0000-4000-8000-000000000040'),'c1200000-0000-4000-8000-000000000030'::uuid,'repeated workspace resolution is idempotent');
SELECT is((SELECT status::text FROM public.workspaces WHERE id='c1200000-0000-4000-8000-000000000030'),'imported_unclaimed','contract association does not activate an unsigned workspace');

INSERT INTO public.datarooms(id,workspace_id) VALUES ('c1200000-0000-4000-8000-000000000050','c1200000-0000-4000-8000-000000000031');
INSERT INTO public.documents(id,workspace_id,name,document_type,external_url) VALUES
 ('c1200000-0000-4000-8000-000000000060','c1200000-0000-4000-8000-000000000031','RC12 own','link','https://example.invalid/own'),
 ('c1200000-0000-4000-8000-000000000061','c1200000-0000-4000-8000-000000000030','RC12 other','link','https://example.invalid/other');
INSERT INTO public.investor_updates(id,workspace_id,month) VALUES
 ('c1200000-0000-4000-8000-000000000070','c1200000-0000-4000-8000-000000000031','2026-11-01'),
 ('c1200000-0000-4000-8000-000000000071','c1200000-0000-4000-8000-000000000030','2026-11-01');
SELECT lives_ok($q$INSERT INTO public.dataroom_items(id,dataroom_id,type,title,document_id) VALUES ('c1200000-0000-4000-8000-000000000080','c1200000-0000-4000-8000-000000000050','document','RC12 own','c1200000-0000-4000-8000-000000000060')$q$,'same-workspace document is accepted');
SELECT throws_ok($q$INSERT INTO public.dataroom_items(dataroom_id,type,title,document_id) VALUES ('c1200000-0000-4000-8000-000000000050','document','RC12 cross','c1200000-0000-4000-8000-000000000061')$q$,'23514','dataroom item document must belong to the dataroom workspace','cross-workspace document is rejected');
SELECT lives_ok($q$INSERT INTO public.dataroom_items(dataroom_id,type,title,investor_update_id) VALUES ('c1200000-0000-4000-8000-000000000050','investor_update','RC12 own update','c1200000-0000-4000-8000-000000000070')$q$,'same-workspace investor update is accepted');
SELECT throws_ok($q$INSERT INTO public.dataroom_items(dataroom_id,type,title,investor_update_id) VALUES ('c1200000-0000-4000-8000-000000000050','investor_update','RC12 cross update','c1200000-0000-4000-8000-000000000071')$q$,'23514','dataroom item investor update must belong to the dataroom workspace','cross-workspace investor update is rejected');
SELECT throws_ok($q$UPDATE public.dataroom_items SET document_id='c1200000-0000-4000-8000-000000000061' WHERE id='c1200000-0000-4000-8000-000000000080'$q$,'23514','dataroom item document must belong to the dataroom workspace','updates cannot bypass the workspace guard');

INSERT INTO public.workspace_users(workspace_id,user_id,role,active) VALUES
 ('c1200000-0000-4000-8000-000000000031','c1200000-0000-4000-8000-000000000002','mentor_externo',true),
 ('c1200000-0000-4000-8000-000000000031','c1200000-0000-4000-8000-000000000001','founder',true);
INSERT INTO public.mentor_nda_acceptances(user_id,nda_version) VALUES ('c1200000-0000-4000-8000-000000000002','PT-NDA-2026-01');
SELECT set_config('request.jwt.claim.sub','c1200000-0000-4000-8000-000000000002',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims','{"sub":"c1200000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SET LOCAL ROLE authenticated;
SELECT lives_ok($q$INSERT INTO public.consultant_notes(id,workspace_id,author_id,content,is_private,visibility) VALUES ('c1200000-0000-4000-8000-000000000090','c1200000-0000-4000-8000-000000000031','c1200000-0000-4000-8000-000000000002','RC12 shared mentor note',false,'shared_with_mentor')$q$,'assigned mentor with NDA can insert an own shared note');
SELECT is((SELECT count(*)::integer FROM public.consultant_notes WHERE id='c1200000-0000-4000-8000-000000000090'),1,'mentor reads the own shared note');
SELECT throws_ok($q$INSERT INTO public.consultant_notes(workspace_id,author_id,content,is_private,visibility) VALUES ('c1200000-0000-4000-8000-000000000031','c1200000-0000-4000-8000-000000000002','RC12 private',true,'private_staff')$q$,'42501',NULL,'mentor cannot write private staff notes');
RESET ROLE;
UPDATE public.profiles SET account_status='suspended' WHERE id='c1200000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT throws_ok($q$INSERT INTO public.consultant_notes(workspace_id,author_id,content,is_private,visibility) VALUES ('c1200000-0000-4000-8000-000000000031','c1200000-0000-4000-8000-000000000002','RC12 suspended',false,'shared_with_mentor')$q$,'42501',NULL,'suspended mentor cannot insert a shared note');
RESET ROLE;

INSERT INTO public.system_settings(key,value) VALUES ('notifications.founders_disabled','true'::jsonb) ON CONFLICT(key) DO UPDATE SET value=EXCLUDED.value;
CREATE TEMP TABLE rc12_notification_fixture(user_id uuid);
CREATE TRIGGER rc12_notification_guard BEFORE INSERT ON rc12_notification_fixture FOR EACH ROW EXECUTE FUNCTION public.block_founder_notifications();
INSERT INTO rc12_notification_fixture VALUES ('c1200000-0000-4000-8000-000000000001');
SELECT is((SELECT count(*)::integer FROM rc12_notification_fixture),0,'founder membership without global role obeys the kill switch');
UPDATE public.system_settings SET value='false'::jsonb WHERE key='notifications.founders_disabled';
INSERT INTO rc12_notification_fixture VALUES ('c1200000-0000-4000-8000-000000000001');
SELECT is((SELECT count(*)::integer FROM rc12_notification_fixture),1,'founder membership receives notifications when enabled');
SELECT throws_ok($q$UPDATE public.profiles SET linkedin_url='javascript:alert(1)' WHERE id='c1200000-0000-4000-8000-000000000001'$q$,'23514',NULL,'profiles reject executable URL schemes');
SELECT throws_ok($q$UPDATE public.documents SET external_url='data:text/html,unsafe' WHERE id='c1200000-0000-4000-8000-000000000060'$q$,'23514',NULL,'documents reject executable data URLs');
SELECT * FROM finish();
ROLLBACK;
