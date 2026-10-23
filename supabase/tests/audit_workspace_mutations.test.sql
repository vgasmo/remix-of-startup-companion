BEGIN;
SELECT plan(9);
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('f1240000-0000-0000-0000-000000000001','audit-admin@test.local',now()),
 ('f1240000-0000-0000-0000-000000000002','audit-founder@test.local',now());
INSERT INTO public.profiles(id,email,account_status) VALUES
 ('f1240000-0000-0000-0000-000000000001','audit-admin@test.local','approved'),
 ('f1240000-0000-0000-0000-000000000002','audit-founder@test.local','approved')
 ON CONFLICT(id) DO UPDATE SET account_status='approved';
INSERT INTO public.user_roles(user_id,role) VALUES
 ('f1240000-0000-0000-0000-000000000001','admin'),
 ('f1240000-0000-0000-0000-000000000002','founder') ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"f1240000-0000-0000-0000-000000000001","role":"authenticated"}',true);
SELECT is(public.can_write_workspace('f1240000-0000-0000-0000-000000000003'),true,'approved admin retains workspace writes');
SELECT throws_ok($$INSERT INTO public.conversations(title) VALUES ('arbitrary direct insert')$$,'42501',NULL,'direct conversation inserts rejected');
SELECT lives_ok($$SELECT public.create_conversation(ARRAY[]::uuid[],'audit authorized conversation',NULL)$$,'authorized conversation RPC still creates');
RESET ROLE;
UPDATE public.profiles SET account_status='pending' WHERE id='f1240000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT is(public.can_write_workspace('f1240000-0000-0000-0000-000000000003'),false,'pending admin cannot write');
SELECT throws_ok($$SELECT public.create_conversation(ARRAY[]::uuid[],'pending',NULL)$$,'42501','account_access_denied','pending caller cannot create conversation');
RESET ROLE;
UPDATE public.profiles SET account_status='suspended' WHERE id='f1240000-0000-0000-0000-000000000001';
SET LOCAL ROLE authenticated;
SELECT is(public.can_write_workspace('f1240000-0000-0000-0000-000000000003'),false,'suspended admin cannot write');
SELECT throws_ok($$SELECT public.create_conversation(ARRAY[]::uuid[],'suspended',NULL)$$,'42501','account_access_denied','suspended caller cannot create conversation');
SELECT set_config('request.jwt.claims','{"sub":"f1240000-0000-0000-0000-000000000002","role":"authenticated"}',true);
SELECT is(public.can_write_workspace('f1240000-0000-0000-0000-000000000003'),false,'unassociated founder cannot write foreign workspace');
SELECT throws_ok($$SELECT public.create_conversation(ARRAY[]::uuid[],'foreign','f1240000-0000-0000-0000-000000000003')$$,'42501','workspace_access_denied','foreign workspace conversation rejected');
RESET ROLE;
SELECT * FROM finish();
ROLLBACK;