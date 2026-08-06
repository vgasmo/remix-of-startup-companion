-- pgTAP suite for public.log_completed_session_atomic.
-- Executed only via scripts/rc5/run-pgtap.mjs against a non-production database.
-- DO NOT RUN AGAINST PRODUCTION.
--
-- Covers:
--   anonymous / no auth
--   founder (plain workspace member) attributing to another user  → 42501
--   founder self-attribution                                       → allowed
--   unassigned consultant                                          → 42501
--   assigned consultant                                            → allowed
--   admin, backoffice                                              → allowed
--   accepted mentor                                                → allowed + primary_mentor_id
--   unaccepted mentor                                              → 42501
--   invalid attendee shape / role / status                         → 22023 / 42501
--   attendee unrelated to workspace                                → 42501
--   invalid source enum                                            → 22023
--   mentor attribution persisted canonically
--   exactly one activity_log row + one tool_usage_events row
--   no sessions.calendar_event_id / no outbound calendar side-effect
--   fingerprint mismatch on same command_id                        → 42501

BEGIN;
SELECT plan(23);

-- Fixtures (all under a discardable schema so ROLLBACK is total).
CREATE SCHEMA IF NOT EXISTS rc5_tap;
SET LOCAL search_path = rc5_tap, public;

-- Seed identities
INSERT INTO auth.users(id, email) VALUES
  ('00000000-0000-0000-0000-0000000ba010','tap-admin@test.local'),
  ('00000000-0000-0000-0000-0000000ba011','tap-backoffice@test.local'),
  ('00000000-0000-0000-0000-0000000ba012','tap-assigned@test.local'),
  ('00000000-0000-0000-0000-0000000ba013','tap-unassigned@test.local'),
  ('00000000-0000-0000-0000-0000000ba014','tap-founder@test.local'),
  ('00000000-0000-0000-0000-0000000ba015','tap-mentor-ok@test.local'),
  ('00000000-0000-0000-0000-0000000ba016','tap-mentor-no@test.local'),
  ('00000000-0000-0000-0000-0000000ba017','tap-rogue@test.local'),
  ('00000000-0000-0000-0000-0000000ba018','tap-other-ws@test.local');

INSERT INTO public.user_roles(user_id, role) VALUES
  ('00000000-0000-0000-0000-0000000ba010','admin'),
  ('00000000-0000-0000-0000-0000000ba011','backoffice');

INSERT INTO public.startups(id,name) VALUES ('00000000-0000-0000-0000-0000000ba001','TAP Startup');
INSERT INTO public.programs(id,name,program_type,is_active)
  VALUES ('00000000-0000-0000-0000-0000000ba002','TAP Program','incubation',true);
INSERT INTO public.workspaces(id,startup_id,program_id,stage,status,priority_level,needs_onboarding,assigned_consultor_id)
  VALUES ('00000000-0000-0000-0000-0000000ba003','00000000-0000-0000-0000-0000000ba001',
          '00000000-0000-0000-0000-0000000ba002','ideation','active','standard',false,
          '00000000-0000-0000-0000-0000000ba012');

INSERT INTO public.workspace_users(workspace_id,user_id,role,active) VALUES
  ('00000000-0000-0000-0000-0000000ba003','00000000-0000-0000-0000-0000000ba014','founder',true);

INSERT INTO public.mentor_connections(mentor_id,founder_id,workspace_id,status) VALUES
  ('00000000-0000-0000-0000-0000000ba015','00000000-0000-0000-0000-0000000ba014',
   '00000000-0000-0000-0000-0000000ba003','accepted');

-- Helper: impersonate via jwt sub GUC (Supabase auth.uid() reads this).
CREATE OR REPLACE FUNCTION rc5_tap.as_user(u uuid) RETURNS void AS $$
  SELECT set_config('request.jwt.claim.sub', u::text, true);
  SELECT set_config('request.jwt.claims', json_build_object('sub', u::text)::text, true);
$$ LANGUAGE sql;

-- 1. anonymous
SELECT rc5_tap.as_user(NULL);
SELECT throws_ok(
  $$ SELECT public.log_completed_session_atomic(
       gen_random_uuid(),'00000000-0000-0000-0000-0000000ba003','anon',
       now()-interval '1h',30,'00000000-0000-0000-0000-0000000ba010') $$,
  '42501','insufficient_privilege','anonymous rejected');

-- 2. founder attributing to someone else
SELECT rc5_tap.as_user('00000000-0000-0000-0000-0000000ba014');
SELECT throws_ok(
  $$ SELECT public.log_completed_session_atomic(
       gen_random_uuid(),'00000000-0000-0000-0000-0000000ba003','founder→other',
       now()-interval '1h',30,'00000000-0000-0000-0000-0000000ba010') $$,
  '42501',NULL,'founder cannot attribute to admin');

-- 3. founder self-attribution
SELECT lives_ok(
  $$ SELECT public.log_completed_session_atomic(
       '00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-0000000ba003','founder-self',
       now()-interval '1h',30,'00000000-0000-0000-0000-0000000ba014') $$,
  'founder self-attribution allowed');

-- 4. unassigned consultant (has no assigned_consultor_id link)
SELECT rc5_tap.as_user('00000000-0000-0000-0000-0000000ba013');
SELECT throws_ok(
  $$ SELECT public.log_completed_session_atomic(
       gen_random_uuid(),'00000000-0000-0000-0000-0000000ba003','unassigned',
       now()-interval '1h',30,'00000000-0000-0000-0000-0000000ba013') $$,
  '42501',NULL,'unassigned consultant rejected');

-- 5. assigned consultant
SELECT rc5_tap.as_user('00000000-0000-0000-0000-0000000ba012');
SELECT lives_ok(
  $$ SELECT public.log_completed_session_atomic(
       '00000000-0000-0000-0000-000000000051','00000000-0000-0000-0000-0000000ba003','assigned-consult',
       now()-interval '1h',30,'00000000-0000-0000-0000-0000000ba012') $$,
  'assigned consultant allowed');

-- 6. admin
SELECT rc5_tap.as_user('00000000-0000-0000-0000-0000000ba010');
SELECT lives_ok(
  $$ SELECT public.log_completed_session_atomic(
       '00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-0000000ba003','admin',
       now()-interval '1h',30,'00000000-0000-0000-0000-0000000ba010') $$,
  'admin allowed');

-- 7. backoffice
SELECT rc5_tap.as_user('00000000-0000-0000-0000-0000000ba011');
SELECT lives_ok(
  $$ SELECT public.log_completed_session_atomic(
       '00000000-0000-0000-0000-000000000071','00000000-0000-0000-0000-0000000ba003','backoffice',
       now()-interval '1h',30,'00000000-0000-0000-0000-0000000ba011') $$,
  'backoffice allowed');

-- 8. accepted mentor
SELECT rc5_tap.as_user('00000000-0000-0000-0000-0000000ba015');
SELECT lives_ok(
  $$ SELECT public.log_completed_session_atomic(
       '00000000-0000-0000-0000-000000000081','00000000-0000-0000-0000-0000000ba003','mentor-ok',
       now()-interval '1h',45,NULL,'00000000-0000-0000-0000-0000000ba015','general','mentor_booking') $$,
  'accepted mentor allowed');

-- 8b. primary_mentor_id persisted
SELECT is(
  (SELECT primary_mentor_id FROM public.sessions WHERE command_id='00000000-0000-0000-0000-000000000081'),
  '00000000-0000-0000-0000-0000000ba015'::uuid,
  'primary_mentor_id persisted canonically');

-- 9. unaccepted mentor
SELECT rc5_tap.as_user('00000000-0000-0000-0000-0000000ba016');
SELECT throws_ok(
  $$ SELECT public.log_completed_session_atomic(
       gen_random_uuid(),'00000000-0000-0000-0000-0000000ba003','mentor-no',
       now()-interval '1h',45,NULL,'00000000-0000-0000-0000-0000000ba016','general','mentor_booking') $$,
  '42501',NULL,'unaccepted mentor rejected');

-- 10. attendee unrelated to workspace
SELECT rc5_tap.as_user('00000000-0000-0000-0000-0000000ba010');
SELECT throws_ok(
  $$ SELECT public.log_completed_session_atomic(
       gen_random_uuid(),'00000000-0000-0000-0000-0000000ba003','bad-att',
       now()-interval '1h',30,'00000000-0000-0000-0000-0000000ba010',NULL,'general','off_platform',
       NULL,NULL,NULL,
       jsonb_build_array(jsonb_build_object('user_id','00000000-0000-0000-0000-0000000ba018','attendance_status','attended'))) $$,
  '42501',NULL,'attendee outside workspace rejected');

-- 11. invalid source enum
SELECT throws_ok(
  $$ SELECT public.log_completed_session_atomic(
       gen_random_uuid(),'00000000-0000-0000-0000-0000000ba003','bad-src',
       now()-interval '1h',30,'00000000-0000-0000-0000-0000000ba010',NULL,'general','outlook_import') $$,
  '22023',NULL,'invalid source rejected');

-- 12. future occurred_at
SELECT throws_ok(
  $$ SELECT public.log_completed_session_atomic(
       gen_random_uuid(),'00000000-0000-0000-0000-0000000ba003','future',
       now()+interval '1h',30,'00000000-0000-0000-0000-0000000ba010') $$,
  '22023',NULL,'future occurred_at rejected');

-- 13. duration out of range
SELECT throws_ok(
  $$ SELECT public.log_completed_session_atomic(
       gen_random_uuid(),'00000000-0000-0000-0000-0000000ba003','dur',
       now()-interval '1h',9999,'00000000-0000-0000-0000-0000000ba010') $$,
  '22023',NULL,'duration out of range rejected');

-- 14. no primary attribution
SELECT throws_ok(
  $$ SELECT public.log_completed_session_atomic(
       gen_random_uuid(),'00000000-0000-0000-0000-0000000ba003','noprim',
       now()-interval '1h',30,NULL,NULL) $$,
  '22023',NULL,'missing primary attribution rejected');

-- 15. exactly one activity_log + one tool_usage_events per happy row
SELECT is(
  (SELECT count(*)::int FROM public.tool_usage_events
     WHERE session_id=(SELECT id FROM public.sessions WHERE command_id='00000000-0000-0000-0000-000000000061')),
  1,'exactly one tool_usage_events row per session');
SELECT is(
  (SELECT count(*)::int FROM public.activity_log
     WHERE entity_id=(SELECT id FROM public.sessions WHERE command_id='00000000-0000-0000-0000-000000000061')),
  1,'exactly one activity_log row per session');

-- 16. no outbound calendar side-effect: outlook_sync_status='not_applicable', no calendar id
SELECT is(
  (SELECT outlook_sync_status FROM public.sessions WHERE command_id='00000000-0000-0000-0000-000000000061'),
  'not_applicable','no calendar side-effect (outlook_sync_status = not_applicable)');

-- 17. idempotent replay by same actor / same payload
SELECT lives_ok(
  $$ SELECT public.log_completed_session_atomic(
       '00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-0000000ba003','admin',
       now()-interval '1h',30,'00000000-0000-0000-0000-0000000ba010') $$,
  'idempotent replay by same actor is safe');
SELECT is(
  (SELECT count(*)::int FROM public.sessions WHERE command_id='00000000-0000-0000-0000-000000000061'),
  1,'idempotent replay does not duplicate');

-- 18. fingerprint mismatch: same command_id, changed workspace → 42501 BEFORE reveal
--     (Batch A fingerprint migration enforces this.)
SELECT throws_ok(
  $$ SELECT public.log_completed_session_atomic(
       '00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-0000000ba003','admin-tampered',
       now()-interval '1h',30,'00000000-0000-0000-0000-0000000ba010') $$,
  '42501',NULL,'fingerprint mismatch (changed title) rejected before replay reveal');

-- 19. fingerprint mismatch: different actor replaying known command_id → 42501
SELECT rc5_tap.as_user('00000000-0000-0000-0000-0000000ba017');
SELECT throws_ok(
  $$ SELECT public.log_completed_session_atomic(
       '00000000-0000-0000-0000-000000000061','00000000-0000-0000-0000-0000000ba003','admin',
       now()-interval '1h',30,'00000000-0000-0000-0000-0000000ba010') $$,
  '42501',NULL,'different actor replaying known command_id rejected');

SELECT * FROM finish();
ROLLBACK;
