-- Allow 'off_platform' as a valid session source (used when logging
-- past meetings that happened outside the platform).
ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_source_check;
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_source_check
  CHECK (source = ANY (ARRAY['manual'::text, 'teams_import'::text, 'webhook'::text, 'off_platform'::text]));