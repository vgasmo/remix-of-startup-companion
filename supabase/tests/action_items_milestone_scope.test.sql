-- P0.2 pgTAP: an action item may only reference a milestone in its own workspace.
BEGIN;
SELECT plan(3);

SELECT has_table('public', 'action_items', 'action_items exists');

SELECT col_is_unique('public', 'milestones', ARRAY['id', 'workspace_id'],
  'milestones has the (id, workspace_id) candidate key');

-- Seed two workspaces + one milestone in workspace A, then try to attach an
-- action item living in workspace B to it.
INSERT INTO public.workspaces (id, name, status)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001', 'WS A', 'active'),
       ('bbbbbbbb-0000-0000-0000-000000000002', 'WS B', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.milestones (id, workspace_id, title)
VALUES ('cccccccc-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000001', 'M in A')
ON CONFLICT (id) DO NOTHING;

SELECT throws_ok(
  $$INSERT INTO public.action_items (workspace_id, milestone_id, title)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000002',
            'cccccccc-0000-0000-0000-000000000003', 'cross-workspace action')$$,
  '23503', NULL,
  'cross-workspace milestone_id is rejected by the composite FK');

SELECT * FROM finish();
ROLLBACK;
