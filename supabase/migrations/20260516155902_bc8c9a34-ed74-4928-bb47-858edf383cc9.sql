ALTER TABLE public.program_setup_drafts
  ADD COLUMN IF NOT EXISTS program_snapshot_json jsonb,
  ADD COLUMN IF NOT EXISTS last_publish_rollback_status text;