CREATE OR REPLACE FUNCTION public.merge_contract_document_metadata(_contract_id uuid, _doc_key text, _metadata jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF coalesce(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'forbidden' USING ERRCODE='42501'; END IF;
 IF _doc_key IS NULL OR _doc_key NOT IN ('certidao_comercial','id_representante','comprovativo_morada','comprovativo_iban','pitch_deck','docs_associacoes') OR jsonb_typeof(_metadata) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'invalid_document_metadata' USING ERRCODE='22023'; END IF;
 UPDATE public.startup_contracts SET documents_json = coalesce(documents_json,'{}'::jsonb) || jsonb_build_object(_doc_key,_metadata)
 WHERE id=_contract_id AND signed_at IS NULL AND status NOT IN ('active','terminated') AND coalesce(signature_status,'') NOT IN ('completed','signed','partially_signed','declined','voided');
 IF NOT FOUND THEN RAISE EXCEPTION 'contract_document_write_denied' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.merge_contract_document_metadata(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.merge_contract_document_metadata(uuid,text,jsonb) TO service_role;
COMMENT ON FUNCTION public.merge_contract_document_metadata(uuid,text,jsonb) IS 'Atomic one-key metadata merge after token-validated document upload; signed contracts remain closed.';