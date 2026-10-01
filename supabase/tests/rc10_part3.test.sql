BEGIN;
SELECT plan(15);

-- Setup: Create a workspace and users with roles
INSERT INTO auth.users (id, email, email_confirmed_at) 
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'admin@test.com', now()),
  ('00000000-0000-0000-0000-000000000002', 'backoffice@test.com', now()),
  ('00000000-0000-0000-0000-000000000003', 'founder@test.com', now()),
  ('00000000-0000-0000-0000-000000000004', 'staff@test.com', now());

INSERT INTO public.profiles (id, full_name, email, account_status)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'Admin User', 'admin@test.com', 'active'),
  ('00000000-0000-0000-0000-000000000002', 'Backoffice User', 'backoffice@test.com', 'active'),
  ('00000000-0000-0000-0000-000000000003', 'Founder User', 'founder@test.com', 'active'),
  ('00000000-0000-0000-0000-000000000004', 'Staff User', 'staff@test.com', 'active');

INSERT INTO public.user_roles (user_id, role)
VALUES 
  ('00000000-0000-0000-0000-000000000001', 'admin'),
  ('00000000-0000-0000-0000-000000000002', 'backoffice'),
  ('00000000-0000-0000-0000-000000000004', 'consultor');

-- 1. backoffice_archive_workspace assertions
INSERT INTO public.startups (id, name, main_contact_email) VALUES ('10000000-0000-0000-0000-000000000001', 'Startup 1', 'founder@test.com');
INSERT INTO public.workspaces (id, name, startup_id, status) VALUES ('20000000-0000-0000-0000-000000000001', 'WS 1', '10000000-0000-0000-0000-000000000001', 'active');
INSERT INTO public.startup_contracts (workspace_id, status, contract_number) VALUES ('20000000-0000-0000-0000-000000000001', 'active', 'C-001');

-- Admin can't archive if active contract exists
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000001"}', true);
SELECT is(public.backoffice_archive_workspace('20000000-0000-0000-0000-000000000001'), false, 'Admin cannot archive workspace with active contract');

-- Backoffice can't archive if active contract exists
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
SELECT is(public.backoffice_archive_workspace('20000000-0000-0000-0000-000000000001'), false, 'Backoffice cannot archive workspace with active contract');

-- Terminate contract and check backoffice can archive
UPDATE public.startup_contracts SET status = 'terminated' WHERE workspace_id = '20000000-0000-0000-0000-000000000001';
SELECT is(public.backoffice_archive_workspace('20000000-0000-0000-0000-000000000001'), true, 'Backoffice can archive workspace with only terminated contracts');

-- 2. workspace_invitations assertions
INSERT INTO public.workspace_invitations (id, workspace_id, email, role, token_hash)
VALUES ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'invite@test.com', 'founder', 'hash1');

-- service_role can update
SELECT set_config('role', 'service_role', true);
UPDATE public.workspace_invitations SET role = 'team_member', expires_at = now() + interval '1 day' WHERE id = '30000000-0000-0000-0000-000000000001';
SELECT results_eq('SELECT role FROM workspace_invitations WHERE id = ''30000000-0000-0000-0000-000000000001''', ARRAY['team_member'::text], 'service_role can update invitation role');

-- non-staff cannot change role
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003"}', true);
SELECT throws_ok($$UPDATE public.workspace_invitations SET role = 'founder' WHERE id = '30000000-0000-0000-0000-000000000001'$$, '42501', NULL, 'Non-staff cannot update invitation role');

-- 3. claim_startup and suspended
UPDATE public.profiles SET account_status = 'suspended' WHERE id = '00000000-0000-0000-0000-000000000003';
INSERT INTO public.startups (id, name, main_contact_email) VALUES ('10000000-0000-0000-0000-000000000002', 'Imported Startup', 'founder@test.com');
INSERT INTO public.workspaces (id, name, startup_id, status) VALUES ('20000000-0000-0000-0000-000000000002', 'Imported WS', '10000000-0000-0000-0000-000000000002', 'imported_unclaimed');

-- Mock auth.users for claim_startup
-- Note: In tests we might need to mock auth.users if the function calls it.
-- Our claim_startup uses auth.uid() and selects from auth.users.
-- Since we are in a transaction, let's hope it works with the manually inserted users.

SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003"}', true);
SELECT throws_ok('SELECT public.claim_startup()', '42501', 'account_suspended', 'Suspended account cannot claim startup');
SELECT is(status, 'imported_unclaimed', 'Workspace remains imported_unclaimed after failed claim') FROM workspaces WHERE id = '20000000-0000-0000-0000-000000000002';

-- Approved founder auto_claimed
UPDATE public.profiles SET account_status = 'active' WHERE id = '00000000-0000-0000-0000-000000000003';
SELECT lives_ok('SELECT public.claim_startup()', 'Active founder can claim startup');
SELECT is(status, 'claimed', 'Workspace status updated to claimed after successful claim') FROM workspaces WHERE id = '20000000-0000-0000-0000-000000000002';

-- 4. Backoffice permissions
INSERT INTO public.funnel_items (id, name, startup_id) VALUES ('40000000-0000-0000-0000-000000000001', 'Lead 1', '10000000-0000-0000-0000-000000000001');
INSERT INTO public.communication_log (funnel_item_id, activity_type, subject, body, visibility)
VALUES ('40000000-0000-0000-0000-000000000001', 'email', 'Hello', 'Body', 'staff');

SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000002"}', true);
SELECT is(COUNT(*), 1::bigint, 'Backoffice can read lead timeline') FROM communication_log WHERE funnel_item_id = '40000000-0000-0000-0000-000000000001';

SELECT lives_ok($$INSERT INTO public.communication_log (funnel_item_id, activity_type, body) VALUES ('40000000-0000-0000-0000-000000000001', 'note', 'Backoffice note')$$, 'Backoffice can insert a note');

-- Cannot change/delete Outlook emails
INSERT INTO public.communication_log (funnel_item_id, activity_type, external_source, external_id, subject)
VALUES ('40000000-0000-0000-0000-000000000001', 'email', 'outlook', 'ext1', 'Outlook Email');

SELECT throws_ok($$UPDATE communication_log SET subject = 'Changed' WHERE external_source = 'outlook'$$, '42501', NULL, 'Backoffice cannot update Outlook emails');
SELECT throws_ok($$DELETE FROM communication_log WHERE external_source = 'outlook'$$, '42501', NULL, 'Backoffice cannot delete Outlook emails');

-- Profiles safe: backoffice sees consultant name but email is NULL
SELECT results_eq(
  'SELECT full_name, email FROM profiles_safe WHERE id = ''00000000-0000-0000-0000-000000000004''',
  $$SELECT 'Staff User'::text, NULL::text$$,
  'Backoffice sees staff name but email is NULL in profiles_safe'
);

-- Founder: 0 lines in timeline (staff only) and user_roles of staff
SELECT set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-000000000003"}', true);
SELECT is(COUNT(*), 0::bigint, 'Founder sees 0 staff-only timeline entries') FROM communication_log WHERE visibility = 'staff';
SELECT is(COUNT(*), 0::bigint, 'Founder sees 0 staff roles in user_roles') FROM user_roles WHERE user_id = '00000000-0000-0000-0000-000000000004';

SELECT * FROM finish();
ROLLBACK;
