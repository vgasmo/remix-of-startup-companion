BEGIN;
SELECT plan(16);

-- Setup: users with roles (RC11: fixtures alinhadas com o esquema real; o teste original nunca correu)
INSERT INTO auth.users (id, email, email_confirmed_at)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin@test.com', now()),
  ('00000000-0000-0000-0000-000000000002', 'backoffice@test.com', now()),
  ('00000000-0000-0000-0000-000000000003', 'founder@test.com', now()),
  ('00000000-0000-0000-0000-000000000004', 'staff@test.com', now());

INSERT INTO public.profiles (id, full_name, email, account_status)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'Admin User', 'admin@test.com', 'approved'),
  ('00000000-0000-0000-0000-000000000002', 'Backoffice User', 'backoffice@test.com', 'approved'),
  ('00000000-0000-0000-0000-000000000003', 'Founder User', 'founder@test.com', 'approved'),
  ('00000000-0000-0000-0000-000000000004', 'Staff User', 'staff@test.com', 'approved')
ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, account_status = EXCLUDED.account_status;

INSERT INTO public.user_roles (user_id, role)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'admin'),
  ('00000000-0000-0000-0000-000000000002', 'backoffice'),
  ('00000000-0000-0000-0000-000000000003', 'founder'),
  ('00000000-0000-0000-0000-000000000004', 'consultor')
ON CONFLICT DO NOTHING;

INSERT INTO public.programs (id, name) VALUES ('e0000000-0000-0000-0000-0000000000e1', 'Programa Teste RC10');

-- 1. backoffice_archive_workspace assertions
INSERT INTO public.startups (id, name, main_contact_email) VALUES ('10000000-0000-0000-0000-000000000001', 'Startup 1', 'founder@test.com');
INSERT INTO public.workspaces (id, startup_id, program_id, status) VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-0000000000e1', 'active');
INSERT INTO public.startup_contracts (workspace_id, status, contract_number, start_date) VALUES ('20000000-0000-0000-0000-000000000001', 'active', 'C-001', CURRENT_DATE);

-- Admin can't archive if active contract exists
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
SELECT is(public.backoffice_archive_workspace('20000000-0000-0000-0000-000000000001'), false, 'Admin cannot archive workspace with active contract');

-- Backoffice can't archive if active contract exists
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
SELECT is(public.backoffice_archive_workspace('20000000-0000-0000-0000-000000000001'), false, 'Backoffice cannot archive workspace with active contract');

-- Terminate contract and check backoffice can archive
SELECT set_config('role', 'postgres', true);
UPDATE public.startup_contracts SET status = 'terminated' WHERE workspace_id = '20000000-0000-0000-0000-000000000001';
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
SELECT is(public.backoffice_archive_workspace('20000000-0000-0000-0000-000000000001'), true, 'Backoffice can archive workspace with only terminated contracts');

-- 2. workspace_invitations assertions
SELECT set_config('role', 'postgres', true);
INSERT INTO public.workspace_invitations (id, workspace_id, email, role, token_hash)
VALUES ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'invite@test.com', 'founder', 'hash1');

-- service_role can update
SELECT set_config('role', 'service_role', true);
SELECT set_config('request.jwt.claims', '{"role": "service_role"}', true);
UPDATE public.workspace_invitations SET role = 'team_member', expires_at = now() + interval '1 day' WHERE id = '30000000-0000-0000-0000-000000000001';
SELECT results_eq('SELECT role::text FROM workspace_invitations WHERE id = ''30000000-0000-0000-0000-000000000001''', ARRAY['team_member'::text], 'service_role can update invitation role');

-- non-staff cannot change role
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
SELECT throws_ok($$UPDATE public.workspace_invitations SET role = 'founder' WHERE id = '30000000-0000-0000-0000-000000000001'$$, '42501', NULL, 'Non-staff cannot update invitation role');

-- 3. claim_startup and suspended
SELECT set_config('role', 'postgres', true);
UPDATE public.profiles SET account_status = 'suspended' WHERE id = '00000000-0000-0000-0000-000000000003';
INSERT INTO public.startups (id, name, main_contact_email) VALUES ('10000000-0000-0000-0000-000000000002', 'Imported Startup', 'founder@test.com');
INSERT INTO public.workspaces (id, startup_id, program_id, status) VALUES ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-0000000000e1', 'imported_unclaimed');

SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
SELECT throws_ok('SELECT public.claim_startup()', '42501', 'account_suspended', 'Suspended account cannot claim startup');
SELECT set_config('role', 'postgres', true);
SELECT is((SELECT status FROM public.workspaces WHERE id = '20000000-0000-0000-0000-000000000002'), 'imported_unclaimed', 'Workspace remains imported_unclaimed after failed claim');
SELECT set_config('role', 'authenticated', true);

-- Approved founder auto_claimed
SELECT set_config('role', 'postgres', true);
UPDATE public.profiles SET account_status = 'approved' WHERE id = '00000000-0000-0000-0000-000000000003';
SELECT set_config('role', 'authenticated', true);
SELECT lives_ok('SELECT public.claim_startup()', 'Approved founder can claim startup');
SELECT set_config('role', 'postgres', true);
SELECT isnt((SELECT status FROM public.workspaces WHERE id = '20000000-0000-0000-0000-000000000002'), 'imported_unclaimed', 'Workspace leaves imported_unclaimed after successful claim');

-- 4. Backoffice permissions
SELECT set_config('role', 'postgres', true);
INSERT INTO public.funnel_items (id, organization_name, linked_startup_id, type, stage) VALUES ('40000000-0000-0000-0000-000000000001', 'Lead 1', '10000000-0000-0000-0000-000000000001', 'lead', 'new');
INSERT INTO public.communication_log (funnel_item_id, activity_type, subject, body, visibility)
VALUES ('40000000-0000-0000-0000-000000000001', 'email', 'Hello', 'Body', 'staff');

SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002", "role": "authenticated"}', true);
SELECT is((SELECT COUNT(*) FROM public.communication_log WHERE funnel_item_id = '40000000-0000-0000-0000-000000000001'), 1::bigint, 'Backoffice can read lead timeline');

SELECT lives_ok($$INSERT INTO public.communication_log (funnel_item_id, activity_type, body) VALUES ('40000000-0000-0000-0000-000000000001', 'note', 'Backoffice note')$$, 'Backoffice can insert a note');

-- Cannot change/delete Outlook emails
SELECT set_config('role', 'postgres', true);
INSERT INTO public.communication_log (funnel_item_id, activity_type, external_source, external_id, subject)
VALUES ('40000000-0000-0000-0000-000000000001', 'email', 'outlook', 'ext1', 'Outlook Email');
SELECT set_config('role', 'authenticated', true);

WITH u AS (UPDATE public.communication_log SET subject = 'Changed' WHERE external_source = 'outlook' RETURNING 1)
SELECT is((SELECT count(*) FROM u), 0::bigint, 'Backoffice cannot update Outlook emails');
WITH d AS (DELETE FROM public.communication_log WHERE external_source = 'outlook' RETURNING 1)
SELECT is((SELECT count(*) FROM d), 0::bigint, 'Backoffice cannot delete Outlook emails');

-- Profiles safe: backoffice sees consultant name but email is NULL
SELECT results_eq(
  'SELECT full_name, email FROM public.profiles_safe WHERE id = ''00000000-0000-0000-0000-000000000004''',
  $$SELECT 'Staff User'::text, NULL::text$$,
  'Backoffice sees staff name but email is NULL in profiles_safe'
);

-- Founder: 0 lines in timeline (staff only) and user_roles of staff
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003", "role": "authenticated"}', true);
SELECT is((SELECT COUNT(*) FROM public.communication_log WHERE visibility = 'staff'), 0::bigint, 'Founder sees 0 staff-only timeline entries');
SELECT is((SELECT COUNT(*) FROM public.user_roles WHERE user_id = '00000000-0000-0000-0000-000000000004'), 0::bigint, 'Founder sees 0 staff roles in user_roles');

SELECT * FROM finish();
ROLLBACK;
