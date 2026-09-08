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

-- Only workspace X gets activity.
INSERT INTO public.activity_log (user_id, workspace_id, action, entity_type, created_at)
VALUES ('d0000000-0000-4000-8000-0000000000b0', 'd0000000-0000-4000-8000-0000000000b4',
        'milestone_completed', 'milestone', now());

SET LOCAL role TO service_role;

SELECT ok(
  (SELECT last_activity_at FROM public.list_ecosystem_items_v2(p_page_size := 500)
    WHERE workspace_id = 'd0000000-0000-4000-8000-0000000000b4') >= now() - interval '5 minutes',
  'workspace with activity reports a fresh last activity');

SELECT ok(
  COALESCE(
    (SELECT last_activity_at FROM public.list_ecosystem_items_v2(p_page_size := 500)
      WHERE workspace_id = 'd0000000-0000-4000-8000-0000000000b5'),
    '-infinity'::timestamptz) < now() - interval '5 minutes',
  'sibling workspace does not inherit the other workspace activity');

SELECT ok(
  EXISTS (SELECT 1 FROM public.list_ecosystem_items_v2(p_needs_attention := true, p_page_size := 500)
           WHERE workspace_id = 'd0000000-0000-4000-8000-0000000000b4')
  AND NOT EXISTS (SELECT 1 FROM public.list_ecosystem_items_v2(p_needs_attention := true, p_page_size := 500)
           WHERE workspace_id = 'd0000000-0000-4000-8000-0000000000b5'),
  'needs-attention filter keeps only the critical workspace');

SELECT * FROM finish();
ROLLBACK;
