-- Neutralize hardcoded test-user migration (20260429143536_*)
-- Replace UUID/email-pinned rows with a generic, idempotent runtime-safe rule:
-- Auto-disable any Outlook mailbox where the most recent error message indicates
-- the mailbox does not exist in the M365 tenant (ErrorInvalidUser). No PII pinning.

UPDATE public.email_sync_status
SET sync_state = 'disabled',
    updated_at = now()
WHERE provider = 'outlook'
  AND sync_state <> 'disabled'
  AND (
    last_sync_error ILIKE '%ErrorInvalidUser%'
    OR last_sync_error ILIKE '%does not exist in%tenant%'
    OR last_sync_error ILIKE '%mailbox does not exist%'
  );