-- Add attach_to_proposal flag to support_materials so staff can mark
-- program documents that should be attached (as signed links) to the
-- commercial proposal email sent from the CRM.
ALTER TABLE public.support_materials
  ADD COLUMN IF NOT EXISTS attach_to_proposal boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS support_materials_attach_to_proposal_idx
  ON public.support_materials (program_id)
  WHERE attach_to_proposal = true;

COMMENT ON COLUMN public.support_materials.attach_to_proposal IS
  'When true, staff-facing CRM proposal dialog offers this material as an anexo (link assinado) for the program.';