-- P2.13 — a founder's stage gate review request must land in the staff work queue.
BEGIN;
SELECT plan(3);

-- Fixtures -------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('a0000000-0000-4000-8000-00000000f001', 'founder.sgr@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.startups (id, name)
VALUES ('a0000000-0000-4000-8000-00000000f002', 'SGR Test Startup')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspaces (id, startup_id, status, stage)
VALUES ('a0000000-0000-4000-8000-00000000f003', 'a0000000-0000-4000-8000-00000000f002', 'active', 'validation')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspace_users (workspace_id, user_id, role, active)
VALUES ('a0000000-0000-4000-8000-00000000f003', 'a0000000-0000-4000-8000-00000000f001', 'founder', true)
ON CONFLICT DO NOTHING;

SELECT has_function('public', 'tg_stage_gate_review_enqueue', 'enqueue trigger function exists');

-- Insert the review as the founder ------------------------------------------
SET LOCAL role TO authenticated;
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-00000000f001","role":"authenticated"}',
  true
);

INSERT INTO public.stage_gate_reviews (workspace_id, from_stage, to_stage, requested_by, status, evidence_json)
VALUES ('a0000000-0000-4000-8000-00000000f003', 'validation', 'mvp',
        'a0000000-0000-4000-8000-00000000f001', 'pending', '{}'::jsonb);

RESET role;
SELECT set_config('request.jwt.claims', NULL, true);

SELECT is(
  (SELECT count(*)::int FROM public.staff_work_queue_items
   WHERE workspace_id = 'a0000000-0000-4000-8000-00000000f003'
     AND type = 'stage_gate_review'),
  1,
  'founder review request created exactly one work queue item'
);

SELECT is(
  (SELECT status FROM public.staff_work_queue_items
   WHERE workspace_id = 'a0000000-0000-4000-8000-00000000f003'
     AND type = 'stage_gate_review' LIMIT 1),
  'open',
  'work queue item is open'
);

SELECT * FROM finish();
ROLLBACK;
