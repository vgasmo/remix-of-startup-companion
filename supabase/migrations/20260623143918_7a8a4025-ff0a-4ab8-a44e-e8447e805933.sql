
-- 1) Dedupe milestones generated from program gates.
--    Group by (workspace_id, source_gate_id) AND by (workspace_id, title) for legacy rows
--    where source_gate_id was never linked. Keep the oldest row, repoint actions, delete others.
WITH ranked AS (
  SELECT
    id,
    workspace_id,
    title,
    source_gate_id,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id, COALESCE(source_gate_id::text, 'title:' || title)
      ORDER BY created_at ASC, id ASC
    ) AS rn,
    FIRST_VALUE(id) OVER (
      PARTITION BY workspace_id, COALESCE(source_gate_id::text, 'title:' || title)
      ORDER BY created_at ASC, id ASC
    ) AS survivor_id,
    FIRST_VALUE(source_gate_id) OVER (
      PARTITION BY workspace_id, COALESCE(source_gate_id::text, 'title:' || title)
      ORDER BY (source_gate_id IS NULL), created_at ASC
    ) AS canonical_gate_id
  FROM public.milestones
)
-- Re-point actions from duplicates to the survivor first
UPDATE public.action_items ai
SET milestone_id = r.survivor_id
FROM ranked r
WHERE ai.milestone_id = r.id
  AND r.rn > 1
  AND r.survivor_id <> r.id;

-- Ensure survivor carries the source_gate_id (some legacy rows had it NULL)
WITH ranked AS (
  SELECT
    id,
    workspace_id,
    title,
    source_gate_id,
    FIRST_VALUE(source_gate_id) OVER (
      PARTITION BY workspace_id, COALESCE(source_gate_id::text, 'title:' || title)
      ORDER BY (source_gate_id IS NULL), created_at ASC
    ) AS canonical_gate_id,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id, COALESCE(source_gate_id::text, 'title:' || title)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.milestones
)
UPDATE public.milestones m
SET source_gate_id = r.canonical_gate_id
FROM ranked r
WHERE m.id = r.id
  AND r.rn = 1
  AND m.source_gate_id IS NULL
  AND r.canonical_gate_id IS NOT NULL;

-- Delete duplicates
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id, COALESCE(source_gate_id::text, 'title:' || title)
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.milestones
)
DELETE FROM public.milestones m
USING ranked r
WHERE m.id = r.id AND r.rn > 1;

-- 2) Dedupe action_items generated from program deliverables.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id, source_deliverable_key
      ORDER BY created_at ASC, id ASC
    ) AS rn
  FROM public.action_items
  WHERE source_deliverable_key IS NOT NULL
)
DELETE FROM public.action_items a
USING ranked r
WHERE a.id = r.id AND r.rn > 1;

-- 3) Unique safeguards so the auto-materialize routine becomes truly idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS milestones_workspace_source_gate_uniq
  ON public.milestones (workspace_id, source_gate_id)
  WHERE source_gate_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS action_items_workspace_source_deliverable_uniq
  ON public.action_items (workspace_id, source_deliverable_key)
  WHERE source_deliverable_key IS NOT NULL;
