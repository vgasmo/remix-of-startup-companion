-- Behavioural coverage for ecosystem survey auto-enrollment and write-back storage.
BEGIN;
SELECT plan(6);

SELECT has_function('public', 'enroll_workspace_in_auto_campaigns',
  'auto-enrollment trigger function exists');

SELECT isnt_empty(
  $$SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid = i.indrelid
     WHERE c.relname = 'survey_instances' AND i.indisunique
       AND pg_get_indexdef(i.indexrelid) LIKE '%(campaign_id, workspace_id)%'$$,
  'one survey instance per campaign and workspace');

-- Fixtures -------------------------------------------------------------------
INSERT INTO public.programs (id, name)
VALUES ('c0000000-0000-4000-8000-0000000000a1', 'Survey Program')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.startups (id, name, founded_date)
VALUES ('c0000000-0000-4000-8000-0000000000a2', 'Survey Startup', '2021-04-01')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.survey_definitions (id, name, questions_json)
VALUES ('c0000000-0000-4000-8000-0000000000a3', 'Baseline def', '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.survey_campaigns (id, survey_definition_id, name, ends_at, status, kind, auto_enroll)
VALUES
  ('c0000000-0000-4000-8000-0000000000a4', 'c0000000-0000-4000-8000-0000000000a3',
   'Active auto campaign', now() + interval '30 days', 'active', 'ecosystem', true),
  ('c0000000-0000-4000-8000-0000000000a5', 'c0000000-0000-4000-8000-0000000000a3',
   'Draft campaign', now() + interval '30 days', 'draft', 'ecosystem', true),
  ('c0000000-0000-4000-8000-0000000000a6', 'c0000000-0000-4000-8000-0000000000a3',
   'Manual campaign', now() + interval '30 days', 'active', 'ecosystem', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspaces (id, startup_id, program_id, status, stage)
VALUES ('c0000000-0000-4000-8000-0000000000a7', 'c0000000-0000-4000-8000-0000000000a2',
        'c0000000-0000-4000-8000-0000000000a1', 'active', 'validation');

SELECT is(
  (SELECT count(*)::int FROM public.survey_instances
    WHERE workspace_id = 'c0000000-0000-4000-8000-0000000000a7'
      AND campaign_id = 'c0000000-0000-4000-8000-0000000000a4'), 1,
  'new workspace is enrolled in the active auto campaign');

SELECT is(
  (SELECT count(*)::int FROM public.survey_instances
    WHERE workspace_id = 'c0000000-0000-4000-8000-0000000000a7'
      AND campaign_id IN ('c0000000-0000-4000-8000-0000000000a5',
                          'c0000000-0000-4000-8000-0000000000a6')), 0,
  'draft and manual campaigns do not auto-enroll');

SELECT is(
  (SELECT auto_filled_data ->> 'startup_name' FROM public.survey_instances
    WHERE workspace_id = 'c0000000-0000-4000-8000-0000000000a7'
      AND campaign_id = 'c0000000-0000-4000-8000-0000000000a4'),
  'Survey Startup',
  'enrollment prefills the startup name');

SELECT is(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.survey_writebacks'::regclass),
  true,
  'survey write-backs are protected by row level security');

SELECT * FROM finish();
ROLLBACK;
