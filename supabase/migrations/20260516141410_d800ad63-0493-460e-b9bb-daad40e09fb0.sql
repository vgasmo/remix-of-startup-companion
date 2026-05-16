
-- Safe dedupe + unique index for template_instances
-- 1. Backup any duplicate rows before touching them
CREATE TABLE IF NOT EXISTS public.template_instances_dedup_backup_20260516 AS
SELECT ti.*
FROM public.template_instances ti
WHERE (ti.workspace_id, ti.template_id) IN (
  SELECT workspace_id, template_id
  FROM public.template_instances
  GROUP BY workspace_id, template_id
  HAVING COUNT(*) > 1
);

-- 2. For each duplicate group, merge older data_json into the newest row
--    (newest wins on conflicts; older keys fill gaps). Status precedence:
--    completed > submitted > in_review > draft.
WITH ranked AS (
  SELECT
    id,
    workspace_id,
    template_id,
    data_json,
    status,
    review_status,
    reviewer_id,
    reviewed_at,
    review_notes,
    updated_at,
    ROW_NUMBER() OVER (
      PARTITION BY workspace_id, template_id
      ORDER BY
        CASE status
          WHEN 'completed' THEN 4
          WHEN 'submitted' THEN 3
          WHEN 'in_review' THEN 2
          WHEN 'draft' THEN 1
          ELSE 0
        END DESC,
        updated_at DESC,
        created_at DESC
    ) AS rn
  FROM public.template_instances
),
keepers AS (
  SELECT workspace_id, template_id, id AS keeper_id
  FROM ranked
  WHERE rn = 1
),
merged AS (
  SELECT
    k.keeper_id,
    -- Older rows merged first, newest (keeper) merged last so it wins
    jsonb_strip_nulls(
      COALESCE(
        (
          SELECT jsonb_object_agg(key, value)
          FROM (
            SELECT key, value
            FROM (
              SELECT r.id, r.updated_at, j.key, j.value
              FROM ranked r,
                   LATERAL jsonb_each(COALESCE(r.data_json, '{}'::jsonb)) j
              WHERE r.workspace_id = k.workspace_id
                AND r.template_id = k.template_id
              ORDER BY r.updated_at ASC, r.id ASC
            ) ordered
          ) final
        ),
        '{}'::jsonb
      )
    ) AS merged_data
  FROM keepers k
)
UPDATE public.template_instances ti
SET data_json = m.merged_data,
    updated_at = now()
FROM merged m
WHERE ti.id = m.keeper_id
  AND EXISTS (
    SELECT 1 FROM public.template_instances d
    WHERE d.workspace_id = ti.workspace_id
      AND d.template_id = ti.template_id
      AND d.id <> ti.id
  );

-- 3. Delete the non-keeper duplicate rows (originals already in backup table)
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY workspace_id, template_id
           ORDER BY
             CASE status
               WHEN 'completed' THEN 4
               WHEN 'submitted' THEN 3
               WHEN 'in_review' THEN 2
               WHEN 'draft' THEN 1
               ELSE 0
             END DESC,
             updated_at DESC,
             created_at DESC
         ) AS rn
  FROM public.template_instances
)
DELETE FROM public.template_instances ti
USING ranked r
WHERE ti.id = r.id AND r.rn > 1;

-- 4. Enforce uniqueness going forward
CREATE UNIQUE INDEX IF NOT EXISTS template_instances_workspace_template_unique
  ON public.template_instances (workspace_id, template_id);
