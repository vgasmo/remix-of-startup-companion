-- P1.5 pgTAP: GDPR retention anonymises pulse responses older than 18 months.
BEGIN;
SELECT plan(4);

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
  (id, cycle_id, workspace_id, respondent_id, mood, confidence, blockers, submitted_at)
VALUES ('33333333-0000-0000-0000-000000000005', '33333333-0000-0000-0000-000000000004',
        '33333333-0000-0000-0000-000000000003', '33333333-0000-0000-0000-00000000000a',
        4, 4, 'sensitive text', now() - interval '19 months');

SELECT public.anonymize_stale_founder_pulse_responses();

SELECT is(
  (SELECT respondent_id FROM public.founder_pulse_responses
    WHERE id = '33333333-0000-0000-0000-000000000005'),
  NULL::uuid,
  'a 19-month-old response is anonymised');

SELECT * FROM finish();
ROLLBACK;
