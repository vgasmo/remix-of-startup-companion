-- Canary verification queries
-- Run after every reconciler commit stage-up. All rows MUST return zero for
-- "must-be-empty" checks, or the exact expected identity for "must-exist"
-- checks. Any deviation blocks progression on the activation ladder.

-- :funnel_item_id, :startup_id, :workspace_id are the identity under test.

-- 1. Single identity: exactly one funnel_item row for this canary
SELECT count(*) AS should_be_1
  FROM public.funnel_items
 WHERE id = :'funnel_item_id';

-- 2. Funnel item is linked to expected startup + workspace
SELECT id, linked_startup_id, linked_workspace_id
  FROM public.funnel_items
 WHERE id = :'funnel_item_id';

-- 3. No duplicate CRM rows for the same PHC customer
SELECT phc_customer_id, count(*) AS n
  FROM public.funnel_items
 WHERE phc_customer_id = (
   SELECT phc_customer_id FROM public.funnel_items WHERE id = :'funnel_item_id')
 GROUP BY 1
HAVING count(*) > 1;

-- 4. No duplicate active workspaces for the linked startup
SELECT id
  FROM public.workspaces
 WHERE startup_id = :'startup_id'
   AND archived_at IS NULL;

-- 5. Contract link (informational — reconciler must NOT create contracts)
SELECT id, status, workspace_id
  FROM public.startup_contracts
 WHERE workspace_id = :'workspace_id';

-- 6. Programme link (informational)
SELECT program_id
  FROM public.workspaces WHERE id = :'workspace_id';

-- 7. Consultant assignment (informational)
SELECT user_id, role FROM public.workspace_assignments
 WHERE workspace_id = :'workspace_id';

-- 8. No orphan contracts (workspace_id points to nothing)
SELECT c.id FROM public.startup_contracts c
LEFT JOIN public.workspaces w ON w.id = c.workspace_id
 WHERE c.workspace_id IS NOT NULL AND w.id IS NULL;

-- 9. No "contracted" funnel_items without a linked workspace
SELECT id, stage
  FROM public.funnel_items
 WHERE stage = 'contracted'
   AND linked_workspace_id IS NULL;

-- 10. Unrelated customers unchanged (diff sample) — sanity: pick 20 random
--     other funnel_items and expect their linked_* fields unchanged vs. a
--     baseline snapshot captured before the run.
SELECT id, linked_startup_id, linked_workspace_id, updated_at
  FROM public.funnel_items
 WHERE id <> :'funnel_item_id'
 ORDER BY random() LIMIT 20;

-- 11. Audit evidence: activity_log or bulk_import_rows record the commit
SELECT row_id, status, committed_at, committed_by
  FROM public.bulk_import_rows
 WHERE after_snapshot->>'funnel_item_id' = :'funnel_item_id';

-- 12. Idempotency: how many idempotency rows for this batch
SELECT count(*) FROM public.reconciler_idempotency
 WHERE batch_id = :'batch_id';

-- 13. Invariants: no funnel_item has linked_startup that does not exist
SELECT f.id
  FROM public.funnel_items f
 WHERE f.linked_startup_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.startups s WHERE s.id = f.linked_startup_id);

-- 14. Invariants: no funnel_item has linked_workspace that does not exist
SELECT f.id
  FROM public.funnel_items f
 WHERE f.linked_workspace_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.workspaces w WHERE w.id = f.linked_workspace_id);

-- 15. No system_alerts raised by this batch
SELECT id, kind, severity, payload, created_at
  FROM public.system_alerts
 WHERE payload->>'batch_id' = :'batch_id'
   AND created_at > now() - interval '1 hour';
