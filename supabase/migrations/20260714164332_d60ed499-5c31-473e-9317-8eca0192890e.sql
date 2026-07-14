
REVOKE EXECUTE ON FUNCTION public.sync_contract_signature_downstream() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_intake_status_to_contract()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_funnel_stage_to_contract()      FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_contract_signature_downstream() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_intake_status_to_contract()     TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_funnel_stage_to_contract()      TO service_role;
