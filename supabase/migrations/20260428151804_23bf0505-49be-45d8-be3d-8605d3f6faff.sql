-- Add soft-archive support to startups
ALTER TABLE public.startups
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS archived_by uuid,
  ADD COLUMN IF NOT EXISTS archived_reason text;

CREATE INDEX IF NOT EXISTS idx_startups_archived_at ON public.startups(archived_at) WHERE archived_at IS NOT NULL;