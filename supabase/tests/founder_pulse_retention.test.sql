-- P1.5 pgTAP: GDPR retention anonymises pulse responses older than 18 months.
BEGIN;
SELECT plan(8);

SELECT has_function('public', 'anonymize_stale_founder_pulse_responses',
  'retention function exists');
SELECT has_column('public', 'founder_pulse_responses', 'metadata',
  'founder_pulse_responses.metadata exists');
SELECT col_is_null('public', 'founder_pulse_responses', 'respondent_id',
  'respondent_id is nullable so rows can be anonymised');

INSERT INTO auth.users (id, email) VALUES
  ('33333333-0000-0000-0000-00000000000a', 'pgtap-pulse@example.com');

INSERT INTO public.startups (id, name) VALUES
  ('33333333-0000-0000-0000-000000000001', 'Pulse Startup');
INSERT INTO public.programs (id, name) VALUES
  ('33333333-0000-0000-0000-000000000002', 'Pulse Program');
INSERT INTO public.workspaces (id, startup_id, program_id) VALUES
  ('33333333-0000-0000-0000-000000000003', '33333333-0000-0000-0000-000000000001',
   '33333333-0000-0000-0000-000000000002');
INSERT INTO public.founder_pulse_cycles (id, workspace_id, period_month, status)
VALUES ('33333333-0000-0000-0000-000000000004', '33333333-0000-0000-0000-000000000003',
        date_trunc('month', now() - interval '19 months')::date, 'closed');

INSERT INTO public.founder_pulse_responses
  (id, cycle_id, workspace_id, respondent_id, mood, confidence, blockers, wins, ask, submitted_at)
VALUES ('33333333-0000-0000-0000-000000000005', '33333333-0000-0000-0000-000000000004',
        '33333333-0000-0000-0000-000000000003', '33333333-0000-0000-0000-00000000000a',
        4, 4, 'sensitive text', 'sensitive win', 'sensitive ask', now() - interval '19 months');

-- Negative case: a 2-month-old response must stay untouched.
INSERT INTO public.founder_pulse_cycles (id, workspace_id, period_month, status)
VALUES ('33333333-0000-0000-0000-000000000006', '33333333-0000-0000-0000-000000000003',
        date_trunc('month', now() - interval '2 months')::date, 'closed');

INSERT INTO public.founder_pulse_responses
  (id, cycle_id, workspace_id, respondent_id, mood, confidence, blockers, wins, ask, submitted_at)
VALUES ('33333333-0000-0000-0000-000000000007', '33333333-0000-0000-0000-000000000006',
        '33333333-0000-0000-0000-000000000003', '33333333-0000-0000-0000-00000000000a',
        5, 5, 'recent blocker', 'recent win', 'recent ask', now() - interval '2 months');

SELECT public.anonymize_stale_founder_pulse_responses();

SELECT is(
  (SELECT respondent_id FROM public.founder_pulse_responses
    WHERE id = '33333333-0000-0000-0000-000000000005'),
  NULL::uuid,
  'a 19-month-old response is anonymised');

SELECT is(
  (SELECT (blockers, wins, ask) FROM public.founder_pulse_responses
    WHERE id = '33333333-0000-0000-0000-000000000005'),
  (NULL::text, NULL::text, NULL::text),
  'blockers/wins/ask are NULLed on the anonymised response');

SELECT is(
  (SELECT respondent_id FROM public.founder_pulse_responses
    WHERE id = '33333333-0000-0000-0000-000000000007'),
  '33333333-0000-0000-0000-00000000000a'::uuid,
  'a 2-month-old response is left intact');

SELECT is(
  (SELECT (blockers, wins, ask) FROM public.founder_pulse_responses
    WHERE id = '33333333-0000-0000-0000-000000000007'),
  ('recent blocker', 'recent win', 'recent ask'),
  'blockers/wins/ask are untouched on the recent response');

SELECT is(
  has_function_privilege('authenticated', 'public.anonymize_stale_founder_pulse_responses()', 'EXECUTE'),
  false,
  'authenticated cannot execute the retention function directly'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM cron.job
     WHERE command ~ 'anonymize_stale_founder_pulse_responses'
  ),
  'the retention function is scheduled in cron.job'
);

SELECT * FROM finish();
ROLLBACK;
