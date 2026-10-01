-- RC9 Parte 1: guardas de privilégio (P1.1, P1.2, P1.6, P1.9, P1.12)
BEGIN;
SELECT plan(8);

SELECT has_trigger('public', 'profiles', 'trg_guard_profile_privileged_columns', 'P1.1 guard trigger exists');
SELECT is(has_function_privilege('authenticated','public.submit_survey_responses(uuid,jsonb,boolean)','EXECUTE'), false,
  'P1.2 submit_survey_responses not executable by authenticated');
SELECT is(has_function_privilege('anon','public.approve_user_account(uuid)','EXECUTE'), false,
  'P1.9 approve_user_account not executable by anon');
SELECT is(has_function_privilege('anon','public.get_consultant_time_off(uuid,date,date)','EXECUTE'), false,
  'P1.9 get_consultant_time_off not executable by anon');
SELECT is(has_function_privilege('anon','public.check_ai_rate_limit(uuid,uuid,text,integer)','EXECUTE'), false,
  'P1.6 check_ai_rate_limit not executable by anon');
SELECT has_trigger('public', 'session_transcripts', 'trg_session_transcripts_clear_session_copy', 'P1.3 clear-copy trigger exists');
SELECT policies_are('public','workspaces',
  ARRAY(SELECT policyname::text FROM pg_policies WHERE schemaname='public' AND tablename='workspaces'
        AND policyname <> 'Founders can create pending workspaces'),
  'P1.12 founder pending-workspace insert policy removed');
SELECT ok(NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='workspace_users'
        AND policyname = 'Founders can add themselves to pending workspaces'),
  'P1.12 self-add policy removed');

SELECT * FROM finish();
ROLLBACK;
