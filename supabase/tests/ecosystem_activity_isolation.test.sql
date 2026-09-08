-- Activity on one workspace must never count as activity on another, and the
-- ecosystem listing must respect the needs-attention filter.
BEGIN;
SELECT plan(4);

SELECT has_function('public', 'list_ecosystem_items_v2', 'ecosystem listing RPC exists');

-- Fixtures -------------------------------------------------------------------
INSERT INTO auth.users (id, email)
VALUES ('d0000000-0000-4000-8000-0000000000b0', 'actor.eco@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.programs (id, name)
VALUES ('d0000000-0000-4000-8000-0000000000b1', 'Eco Program')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.startups (id, name) VALUES
  ('d0000000-0000-4000-8000-0000000000b2', 'Eco Startup X'),
  ('d0000000-0000-4000-8000-0000000000b3', 'Eco Startup Y')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspaces (id, startup_id, program_id, status, stage, health_score) VALUES
  ('d0000000-0000-4000-8000-0000000000b4', 'd0000000-0000-4000-8000-0000000000b2',
   'd0000000-0000-4000-8000-0000000000b1', 'active', 'validation', 'critical'),
  ('d0000000-0000-4000-8000-0000000000b5', 'd0000000-0000-4000-8000-0000000000b3',
   'd0000000-0000-4000-8000-0000000000b1', 'active', 'validation', 'healthy')
ON CONFLICT (id) DO NOTHING;

-- Sibling Y is healthy, has a current-month KPI value and no overdue actions,
-- so it must fall outside the needs-attention filter.
INSERT INTO public.kpi_definitions (id, name, is_global)
VALUES ('d0000000-0000-4000-8000-0000000000b6', 'Eco MRR', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.kpi_values (workspace_id, kpi_definition_id, value, period_month, source_type)
VALUES ('d0000000-0000-4000-8000-0000000000b5', 'd0000000-0000-4000-8000-0000000000b6',
        100, date_trunc('month', CURRENT_DATE)::date, 'manual');

-- Only workspace X gets activity.
INSERT INTO public.activity_log (user_id, workspace_id, action, entity_type, created_at)
VALUES ('d0000000-0000-4000-8000-0000000000b0', 'd0000000-0000-4000-8000-0000000000b4',
        'milestone_completed', 'milestone', now());

SET LOCAL role TO service_role;

SELECT ok(
  (SELECT last_activity_at FROM public.list_ecosystem_items_v2(p_page_size := 500)
    WHERE workspace_id = 'd0000000-0000-4000-8000-0000000000b4') >= now() - interval '5 minutes',
  'workspace with activity reports a fresh last activity');

SELECT is(
  (SELECT last_activity_at FROM public.list_ecosystem_items_v2(p_page_size := 500)
    WHERE workspace_id = 'd0000000-0000-4000-8000-0000000000b5'),
  (SELECT created_at FROM public.workspaces WHERE id = 'd0000000-0000-4000-8000-0000000000b5'),
  'sibling workspace keeps its own baseline and inherits no foreign activity');

SELECT ok(
  EXISTS (SELECT 1 FROM public.list_ecosystem_items_v2(p_needs_attention := true, p_page_size := 500)
           WHERE workspace_id = 'd0000000-0000-4000-8000-0000000000b4')
  AND NOT EXISTS (SELECT 1 FROM public.list_ecosystem_items_v2(p_needs_attention := true, p_page_size := 500)
           WHERE workspace_id = 'd0000000-0000-4000-8000-0000000000b5'),
  'needs-attention filter keeps only the critical workspace');

SELECT * FROM finish();
ROLLBACK;
