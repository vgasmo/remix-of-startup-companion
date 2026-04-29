-- 1) Remove the pinned test mailbox rows by email/provider only (no UUID dependency).
DELETE FROM public.email_sync_status
WHERE provider = 'outlook'
  AND mailbox_email IN (
    'admin.teste@startupleiria.com',
    'consultor.teste@startupleiria.com'
  );

-- 2) Dedupe pre-existing (workspace_id, contract_number) duplicates so the
-- unique index stays valid. Keep the oldest row untouched; suffix duplicates
-- with a deterministic marker that preserves audit trail.
DO $$
DECLARE
  v_dup RECORD;
BEGIN
  FOR v_dup IN
    SELECT id, contract_number, workspace_id,
           row_number() OVER (
             PARTITION BY workspace_id, contract_number
             ORDER BY created_at ASC, id ASC
           ) AS rn
    FROM public.startup_contracts
    WHERE contract_number IS NOT NULL
  LOOP
    IF v_dup.rn > 1 THEN
      UPDATE public.startup_contracts
      SET contract_number = v_dup.contract_number || '-DUP-' || substr(v_dup.id::text, 1, 8),
          notes = COALESCE(notes, '') ||
                  E'\n\n[auto-dedup] Original contract_number "' || v_dup.contract_number ||
                  '" already used by an older row in the same workspace. Suffix appended to preserve uniqueness.'
      WHERE id = v_dup.id;
    END IF;
  END LOOP;
END $$;