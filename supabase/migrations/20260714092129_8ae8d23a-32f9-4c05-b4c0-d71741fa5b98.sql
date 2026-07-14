-- F0 fixes: dedupe financial_assumptions, add partial unique indexes,
-- add workspaces.archived_at, tighten external_entity_refs read access.

-- 1. Deduplicate: keep newest updated_at per (workspace_id,scenario,key,period_index).
--    NULL period_index treated as its own bucket per key.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY workspace_id, scenario, key, COALESCE(period_index::text, '__null__')
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS rn
  FROM public.financial_assumptions
)
DELETE FROM public.financial_assumptions fa
USING ranked r
WHERE fa.id = r.id AND r.rn > 1;

-- 2. Replace the flawed unique constraint with two partial unique indexes
--    so ON CONFLICT can match rows with NULL period_index too.
ALTER TABLE public.financial_assumptions
  DROP CONSTRAINT IF EXISTS financial_assumptions_workspace_id_scenario_key_period_inde_key;

CREATE UNIQUE INDEX IF NOT EXISTS financial_assumptions_uniq_null_period
  ON public.financial_assumptions (workspace_id, scenario, key)
  WHERE period_index IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS financial_assumptions_uniq_period
  ON public.financial_assumptions (workspace_id, scenario, key, period_index)
  WHERE period_index IS NOT NULL;

-- 3. workspaces.archived_at — consistent with startups.archived_at.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 4. Tighten external_entity_refs SELECT — staff-only.
DROP POLICY IF EXISTS eer_auth_read ON public.external_entity_refs;
CREATE POLICY eer_staff_read ON public.external_entity_refs
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'backoffice'::app_role)
    OR has_role(auth.uid(), 'consultor'::app_role)
  );