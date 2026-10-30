-- Run ONLY in a disposable database containing the portfolio RPC fixtures.
BEGIN;
INSERT INTO workspaces(id, startup_id, program_id, status, assigned_consultor_id)
VALUES ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'active', '40000000-0000-0000-0000-000000000001');
INSERT INTO milestones(id, archived_at) VALUES
('50000000-0000-0000-0000-000000000001', now()),
('50000000-0000-0000-0000-000000000002', null);
INSERT INTO action_items(workspace_id, milestone_id, status, due_date)
SELECT '10000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'pending', CURRENT_DATE - 1 FROM generate_series(1,6);
DO $$ DECLARE n integer; BEGIN
 SELECT overdue_actions_count INTO n FROM get_workspace_stats(ARRAY['10000000-0000-0000-0000-000000000001'::uuid]);
 IF n IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'Archived milestone actions counted: expected 0, got %', n; END IF;
 SELECT count(*) INTO n FROM search_workspaces_paged(_overdue_actions => true);
 IF n <> 0 THEN RAISE EXCEPTION 'Archived actions included in overdue filter'; END IF;
END $$;
INSERT INTO action_items(workspace_id, milestone_id, status, due_date) VALUES
('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','pending', CURRENT_DATE - 1),
('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000002','awaiting_validation', CURRENT_DATE - 1);
DO $$ DECLARE n integer; BEGIN
 SELECT overdue_actions_count INTO n FROM get_workspace_stats(ARRAY['10000000-0000-0000-0000-000000000001'::uuid]);
 IF n IS DISTINCT FROM 1 THEN RAISE EXCEPTION 'Expected exactly one open overdue action, got %', n; END IF;
 SELECT count(*) INTO n FROM search_workspaces_paged(_overdue_actions => true);
 IF n <> 1 THEN RAISE EXCEPTION 'Active overdue action missing in filter'; END IF;
 SELECT count(*) INTO n FROM search_workspaces_paged(_assigned_to => '40000000-0000-0000-0000-000000000002');
 IF n <> 0 THEN RAISE EXCEPTION 'Another consultant portfolio leaked'; END IF;
END $$;
ROLLBACK;