BEGIN;
SELECT plan(6);
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('f1250000-0000-0000-0000-000000000001','template-admin@test.local',now()),
 ('f1250000-0000-0000-0000-000000000002','template-founder@test.local',now()),
 ('f1250000-0000-0000-0000-000000000003','template-other@test.local',now());
INSERT INTO public.profiles(id,email,account_status) VALUES
 ('f1250000-0000-0000-0000-000000000001','template-admin@test.local','approved'),
 ('f1250000-0000-0000-0000-000000000002','template-founder@test.local','approved'),
 ('f1250000-0000-0000-0000-000000000003','template-other@test.local','approved')
 ON CONFLICT(id) DO UPDATE SET account_status='approved';
INSERT INTO public.user_roles(user_id,role) VALUES
 ('f1250000-0000-0000-0000-000000000001','admin'),
 ('f1250000-0000-0000-0000-000000000002','founder'),
 ('f1250000-0000-0000-0000-000000000003','founder') ON CONFLICT DO NOTHING;
INSERT INTO public.session_templates(id,name,is_global,created_by) VALUES
 ('f1250000-0000-0000-0000-000000000011','audit-global',true,'f1250000-0000-0000-0000-000000000003'),
 ('f1250000-0000-0000-0000-000000000012','audit-private',false,'f1250000-0000-0000-0000-000000000003');
INSERT INTO public.investor_update_templates(id,name,is_active) VALUES
 ('f1250000-0000-0000-0000-000000000021','audit-active',true),
 ('f1250000-0000-0000-0000-000000000022','audit-inactive',false);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"f1250000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SELECT is((SELECT count(*) FROM public.session_templates WHERE id='f1250000-0000-0000-0000-000000000011'),1::bigint,'global session template remains visible');
SELECT is((SELECT count(*) FROM public.session_templates WHERE id='f1250000-0000-0000-0000-000000000012'),0::bigint,'private session template hidden from unrelated founder');
SELECT is((SELECT count(*) FROM public.investor_update_templates WHERE id='f1250000-0000-0000-0000-000000000021'),1::bigint,'active investor template remains visible');
SELECT is((SELECT count(*) FROM public.investor_update_templates WHERE id='f1250000-0000-0000-0000-000000000022'),0::bigint,'inactive investor template hidden from founder');
SELECT set_config('request.jwt.claims','{"sub":"f1250000-0000-0000-0000-000000000003","role":"authenticated"}',true);
SELECT is((SELECT count(*) FROM public.session_templates WHERE id='f1250000-0000-0000-0000-000000000012'),1::bigint,'creator retains private session template');
SELECT set_config('request.jwt.claims','{"sub":"f1250000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SELECT is((SELECT count(*) FROM public.investor_update_templates WHERE id='f1250000-0000-0000-0000-000000000022'),1::bigint,'admin retains inactive investor template');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;