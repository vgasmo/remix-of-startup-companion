-- RC5 program-mismatch seed. Namespace: rc5-e2e-
-- Creates one workspace whose milestones reference a gate belonging to a different program.
-- Run inside a staging clone only. Cleanup: scripts/rc5/cleanup.mjs removes namespaced workspaces.

BEGIN;

WITH prog_a AS (
  INSERT INTO public.programs (name, type, is_active)
  VALUES ('rc5-e2e-prog-a', 'incubation', true)
  RETURNING id
),
prog_b AS (
  INSERT INTO public.programs (name, type, is_active)
  VALUES ('rc5-e2e-prog-b', 'incubation', true)
  RETURNING id
),
gate_b AS (
  INSERT INTO public.program_gates (program_id, name, sort_order)
  SELECT id, 'rc5-e2e-gate-b', 1 FROM prog_b
  RETURNING id
),
ws AS (
  INSERT INTO public.workspaces (name, program_id, status)
  SELECT 'rc5-e2e-mismatch', id, 'active' FROM prog_a
  RETURNING id
)
INSERT INTO public.milestones (workspace_id, program_gate_id, title, status)
SELECT ws.id, gate_b.id, 'rc5-e2e-cross-gate', 'pending'
FROM ws, gate_b;

-- Sanity: assert exactly 1 mismatch surfaces.
SELECT count(*) AS mismatch_rows FROM staff_diagnose_program_mismatches()
WHERE workspace_name LIKE 'rc5-e2e-%';

COMMIT;
