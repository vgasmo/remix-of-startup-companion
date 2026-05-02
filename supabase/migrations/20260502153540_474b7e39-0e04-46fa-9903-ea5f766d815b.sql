-- Generic corrective migration — supersedes the hardcoded-UUID migration
-- 20260430130007_e8fdae25-20c8-4360-a6d7-5cc78e7266c8.sql and the duplicate
-- pair 20260429192821 / 20260429193959. No programme/email/UUID is hardcoded.
--
-- Goals:
-- 1. Idempotently remove any test mailbox rows by email pattern so a fresh
--    DB replay (DR / clone) does not resurrect them.
-- 2. Generically clean up orphan program_weeks / program_gates rows for
--    every programme — covers the historical Promise.all race that left
--    duplicates and would have caused republish to fail.
-- 3. Reset any program_setup_drafts stuck on 'publish_failed' so staff can
--    retry without manual intervention. Applies to ALL programmes.

-- 1) Test mailbox cleanup (pattern-based, no UUIDs)
DELETE FROM public.email_sync_status
WHERE provider = 'outlook'
  AND mailbox_email ~* '^(admin|consultor)\.teste@startupleiria\.com$';

-- 2) Generic orphan cleanup for all programmes:
--    Any (program_id, week_number) duplicate keeps the oldest row;
--    any duplicate (program_id, sort_order) gate keeps the oldest row.
--    This makes the next publish-program-setup republish safe everywhere,
--    not only for one specific programme UUID.
DO $$
DECLARE
  v_dup RECORD;
BEGIN
  FOR v_dup IN
    SELECT id
    FROM (
      SELECT id,
             row_number() OVER (
               PARTITION BY program_id, week_number
               ORDER BY created_at ASC, id ASC
             ) AS rn
      FROM public.program_weeks
    ) sub
    WHERE rn > 1
  LOOP
    DELETE FROM public.program_weeks WHERE id = v_dup.id;
  END LOOP;

  FOR v_dup IN
    SELECT id
    FROM (
      SELECT id,
             row_number() OVER (
               PARTITION BY program_id, sort_order
               ORDER BY created_at ASC, id ASC
             ) AS rn
      FROM public.program_gates
    ) sub
    WHERE rn > 1
  LOOP
    DELETE FROM public.program_gates WHERE id = v_dup.id;
  END LOOP;
END $$;

-- 3) Generic publish_failed reset — let staff retry any stuck draft.
UPDATE public.program_setup_drafts
SET status = 'draft',
    last_publish_error = NULL,
    last_publish_failed_at = NULL,
    updated_at = now()
WHERE status = 'publish_failed';