
-- Merge duplicate Domiciliação programs into the canonical service_only one.
-- Survivor: df868ac6-4ca4-4a1f-92b9-753cd9e020c6 (14 workspaces, service_only=true, hidden_from_cohorts=true)
-- Duplicate (no references): 14710a59-69a6-4556-89ab-5634eac75314

-- Defensive: re-point any latent references (should be zero based on census).
UPDATE public.workspaces
   SET program_id = 'df868ac6-4ca4-4a1f-92b9-753cd9e020c6'
 WHERE program_id = '14710a59-69a6-4556-89ab-5634eac75314';

UPDATE public.service_programme_map
   SET programme_id = 'df868ac6-4ca4-4a1f-92b9-753cd9e020c6'
 WHERE programme_id = '14710a59-69a6-4556-89ab-5634eac75314';

UPDATE public.program_gates
   SET program_id = 'df868ac6-4ca4-4a1f-92b9-753cd9e020c6'
 WHERE program_id = '14710a59-69a6-4556-89ab-5634eac75314';

UPDATE public.program_weeks
   SET program_id = 'df868ac6-4ca4-4a1f-92b9-753cd9e020c6'
 WHERE program_id = '14710a59-69a6-4556-89ab-5634eac75314';

-- Refresh survivor description to reflect merge.
UPDATE public.programs
   SET description = 'Serviço de domiciliação de sede/atividade — clientes PHC sem jornada de incubação.',
       settings_json = jsonb_set(
         jsonb_set(COALESCE(settings_json,'{}'::jsonb), '{service_only}', 'true'::jsonb, true),
         '{hidden_from_cohorts}', 'true'::jsonb, true
       ),
       updated_at = now()
 WHERE id = 'df868ac6-4ca4-4a1f-92b9-753cd9e020c6';

-- Drop the empty duplicate.
DELETE FROM public.programs
 WHERE id = '14710a59-69a6-4556-89ab-5634eac75314';
