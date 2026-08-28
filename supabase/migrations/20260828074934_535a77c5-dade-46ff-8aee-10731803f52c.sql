-- Allow founder_only transcript confidentiality
ALTER TABLE public.session_transcripts
  DROP CONSTRAINT IF EXISTS session_transcripts_confidentiality_chk;

ALTER TABLE public.session_transcripts
  ADD CONSTRAINT session_transcripts_confidentiality_chk
  CHECK (confidentiality IN ('staff_only','workspace','founder_only'));

-- Widen the staff reclassify RPC to accept founder_only
CREATE OR REPLACE FUNCTION public.staff_reclassify_transcript_confidentiality(
  p_transcript_id uuid, p_new_confidentiality text, p_reason text DEFAULT NULL
) RETURNS public.session_transcripts
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor uuid := auth.uid(); v_old text; v_row public.session_transcripts;
BEGIN
  IF v_actor IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;
  IF p_new_confidentiality NOT IN ('staff_only','workspace','founder_only') THEN
    RAISE EXCEPTION 'invalid confidentiality: %', p_new_confidentiality USING ERRCODE = '22023';
  END IF;
  SELECT confidentiality INTO v_old FROM public.session_transcripts
   WHERE id = p_transcript_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'transcript % not found', p_transcript_id USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.session_transcripts
     SET confidentiality = p_new_confidentiality,
         pending_confidentiality_review = false,
         contained_at = COALESCE(contained_at, now())
   WHERE id = p_transcript_id
   RETURNING * INTO v_row;
  INSERT INTO public.session_transcript_audit
    (transcript_id, actor_id, old_confidentiality, new_confidentiality, reason)
  VALUES (p_transcript_id, v_actor, v_old, p_new_confidentiality, p_reason);
  RETURN v_row;
END; $$;

REVOKE ALL ON FUNCTION public.staff_reclassify_transcript_confidentiality(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_reclassify_transcript_confidentiality(uuid, text, text)
  TO authenticated, service_role;

-- Update RLS so founders can see founder_only transcripts in their workspace
DROP POLICY IF EXISTS session_transcripts_tiered_select ON public.session_transcripts;
CREATE POLICY session_transcripts_tiered_select ON public.session_transcripts
FOR SELECT TO authenticated
USING (
  is_staff()
  OR (
    confidentiality = 'workspace'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_transcripts.session_id
        AND has_workspace_access(s.workspace_id)
    )
  )
  OR (
    confidentiality = 'founder_only'
    AND EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = session_transcripts.session_id
        AND is_founder(s.workspace_id)
    )
  )
);