-- P1.2: lock down the 11-arg signing RPC (currently EXECUTE to PUBLIC/anon)
REVOKE ALL ON FUNCTION public.apply_contract_signature_atomic(
  uuid,uuid,text,text,uuid,jsonb,text,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_contract_signature_atomic(
  uuid,uuid,text,text,uuid,jsonb,text,text,text,text,text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_contract_signature_atomic(
  uuid,uuid,text,text,uuid,jsonb,text,text,text,text,text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_contract_signature_atomic(
  uuid,uuid,text,text,uuid,jsonb,text,text,text,text,text) TO service_role;

-- P1.4: publish_program_setup writes published_at/published_by; columns were missing
ALTER TABLE public.program_setup_drafts
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- P1.5: has_workspace_access(_user_id, _workspace_id) — arguments were swapped
DROP POLICY IF EXISTS cse_assigned_consultant_read ON public.contract_signature_events;
CREATE POLICY cse_assigned_consultant_read
ON public.contract_signature_events
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'consultor'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.startup_contracts sc
     WHERE sc.id = contract_signature_events.contract_id
       AND sc.workspace_id IS NOT NULL
       AND public.has_workspace_access(auth.uid(), sc.workspace_id)
  )
);

-- P1.6: webhook ingest writes source = 'webhook'
ALTER TABLE public.session_transcripts DROP CONSTRAINT IF EXISTS session_transcripts_source_check;
ALTER TABLE public.session_transcripts ADD CONSTRAINT session_transcripts_source_check
  CHECK (source IS NULL OR source IN ('teams_graph','manual_upload','voice','webhook','unknown'));