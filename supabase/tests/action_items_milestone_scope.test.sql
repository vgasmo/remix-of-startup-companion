-- P0.2 pgTAP: an action item may only reference a milestone in its own workspace.
BEGIN;
SELECT plan(3);

SELECT col_is_unique('public', 'milestones', ARRAY['id', 'workspace_id'],
  'milestones has the (id, workspace_id) candidate key');

SELECT has_column('public', 'action_items', 'milestone_id', 'action_items.milestone_id exists');

-- Seed two workspaces (each needs a startup + a program) and one milestone in A.
INSERT INTO public.startups (id, name) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Startup A'),
  ('11111111-0000-0000-0000-000000000002', 'Startup B');

INSERT INTO public.programs (id, name) VALUES
  ('22222222-0000-0000-0000-000000000001', 'Program X');

INSERT INTO public.workspaces (id, startup_id, program_id) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '11111111-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001');

INSERT INTO public.milestones (id, workspace_id, title) VALUES
  ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'M in A');

SELECT throws_ok(
  $$INSERT INTO public.action_items (workspace_id, milestone_id, title)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000002',
            'cccccccc-0000-0000-0000-000000000003', 'cross-workspace action')$$,
  '23503', NULL,
  'cross-workspace milestone_id is rejected by the composite FK');

SELECT * FROM finish();
ROLLBACK;
