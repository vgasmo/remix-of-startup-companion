REVOKE EXECUTE ON FUNCTION public.launch_survey_campaign(UUID, UUID[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.submit_survey_responses(UUID, JSONB, BOOLEAN) FROM anon;