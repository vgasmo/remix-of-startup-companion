-- Disposable harness only; all fixtures roll back and never use hosted data.
BEGIN;
SELECT plan(12);

CREATE TEMP TABLE intake_phase_fixture (status text, reminder_count integer, last_reminder_sent_at timestamptz);
CREATE TRIGGER intake_phase_reset BEFORE UPDATE OF status ON intake_phase_fixture
FOR EACH ROW EXECUTE FUNCTION public.reset_intake_reminders_on_phase_change();
INSERT INTO intake_phase_fixture VALUES ('intake_in_progress', 4, '2026-10-01T10:00:00Z');
UPDATE intake_phase_fixture SET status = 'signature_sent';
SELECT is((SELECT reminder_count FROM intake_phase_fixture), 0, 'signature phase resets reminder count to zero');
SELECT ok((SELECT last_reminder_sent_at IS NULL FROM intake_phase_fixture), 'signature phase clears previous reminder date');
UPDATE intake_phase_fixture SET reminder_count = 2, last_reminder_sent_at = '2026-11-01T10:00:00Z';
UPDATE intake_phase_fixture SET status = 'changes_requested';
SELECT is((SELECT reminder_count FROM intake_phase_fixture), 0, 'correction phase resets reminder count');
UPDATE intake_phase_fixture SET status = 'signature_sent', reminder_count = 3, last_reminder_sent_at = '2026-11-02T10:00:00Z';
SELECT is((SELECT reminder_count FROM intake_phase_fixture), 3, 'explicit reminder counter changes are preserved');
UPDATE intake_phase_fixture SET reminder_count = 4;
SELECT is((SELECT reminder_count FROM intake_phase_fixture), 4, 'cron counter updates are not reset');

INSERT INTO auth.users (id,email) VALUES ('b0000000-0000-4000-8000-00000000f001','optional.fixture@example.com') ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id,email,account_status) VALUES ('b0000000-0000-4000-8000-00000000f001','optional.fixture@example.com','approved') ON CONFLICT (id) DO UPDATE SET account_status='approved';
DELETE FROM public.user_roles WHERE user_id='b0000000-0000-4000-8000-00000000f001';
INSERT INTO public.startups (id,name) VALUES ('b0000000-0000-4000-8000-00000000f002','Optional Fixture') ON CONFLICT DO NOTHING;
INSERT INTO public.programs (id,name) VALUES ('b0000000-0000-4000-8000-00000000f003','Optional Fixture') ON CONFLICT DO NOTHING;
INSERT INTO public.workspaces (id,startup_id,program_id,status,stage) VALUES ('b0000000-0000-4000-8000-00000000f004','b0000000-0000-4000-8000-00000000f002','b0000000-0000-4000-8000-00000000f003','active','validation') ON CONFLICT DO NOTHING;
INSERT INTO public.workspace_users (workspace_id,user_id,role,active) VALUES ('b0000000-0000-4000-8000-00000000f004','b0000000-0000-4000-8000-00000000f001','founder',true) ON CONFLICT DO NOTHING;
SELECT set_config('request.jwt.claim.sub','b0000000-0000-4000-8000-00000000f001',true);
SELECT set_config('request.jwt.claim.role','authenticated',true);
SELECT set_config('request.jwt.claims','{"sub":"b0000000-0000-4000-8000-00000000f001","role":"authenticated"}',true);
SELECT ok('b0000000-0000-4000-8000-00000000f004'::uuid IN (SELECT public.member_workspace_ids()), 'active founder is included in workspace read set');
SELECT ok('b0000000-0000-4000-8000-00000000f004'::uuid IN (SELECT public.writer_workspace_ids()), 'approved founder is included in write set');
UPDATE public.profiles SET account_status='suspended' WHERE id='b0000000-0000-4000-8000-00000000f001';
SELECT is((SELECT count(*)::integer FROM public.member_workspace_ids()),0,'suspended founder has empty read set');
SELECT is((SELECT count(*)::integer FROM public.writer_workspace_ids()),0,'suspended founder has empty write set');
UPDATE public.profiles SET account_status='approved' WHERE id='b0000000-0000-4000-8000-00000000f001';
INSERT INTO public.system_settings (key,value) VALUES ('notifications.founders_disabled','true'::jsonb) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value;
CREATE TEMP TABLE founder_notification_fixture (user_id uuid);
CREATE TRIGGER founder_notification_guard BEFORE INSERT ON founder_notification_fixture FOR EACH ROW EXECUTE FUNCTION public.block_founder_notifications();
INSERT INTO founder_notification_fixture VALUES ('b0000000-0000-4000-8000-00000000f001');
SELECT is((SELECT count(*)::integer FROM founder_notification_fixture),0,'founder membership without global role obeys notification kill switch');
INSERT INTO public.user_roles (user_id,role) VALUES ('b0000000-0000-4000-8000-00000000f001','consultor') ON CONFLICT DO NOTHING;
INSERT INTO founder_notification_fixture VALUES ('b0000000-0000-4000-8000-00000000f001');
SELECT is((SELECT count(*)::integer FROM founder_notification_fixture),1,'staff retains notifications despite founder membership');
SELECT ok(NOT has_function_privilege('authenticated','public.cron_invoke_edge(text,jsonb)','EXECUTE') AND NOT has_function_privilege('anon','public.cron_invoke_edge(text,jsonb)','EXECUTE'), 'cron invocation remains service-only');
SELECT * FROM finish();
ROLLBACK;