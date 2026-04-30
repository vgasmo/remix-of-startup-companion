DELETE FROM public.program_weeks WHERE program_id = '70b25196-5e9c-4890-a1d9-9968c94f9760';
DELETE FROM public.program_gates WHERE program_id = '70b25196-5e9c-4890-a1d9-9968c94f9760';

UPDATE public.program_setup_drafts
SET status = 'draft',
    last_publish_error = NULL,
    last_publish_failed_at = NULL
WHERE program_id = '70b25196-5e9c-4890-a1d9-9968c94f9760'
  AND status = 'publish_failed';