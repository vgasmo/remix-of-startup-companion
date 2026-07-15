
-- Tomorrow Import batch: 3dd77436-e63e-43d7-b607-75cf9bfed953
-- Merge programme_mapping into edited_json per service_group (option B)

WITH mapping(service_group, program_id, program_name, incubation_type_id, incubation_type_name, contract_type) AS (
  VALUES
    ('Incubação Física',      '55cb559a-5e11-41d7-87de-564bd78b783b'::uuid, 'Programa Base',
     '5b3027c4-8683-41f2-bedd-5cfca3e30ab6'::uuid, 'Incubação e Aceleração Física Co-Work', 'physical_cowork'),
    ('Incubação Virtual',     '55cb559a-5e11-41d7-87de-564bd78b783b'::uuid, 'Programa Base',
     '2ff4ba15-fc7d-4b0e-b851-f341c86f4451'::uuid, 'Incubação e Aceleração Virtual', 'virtual_incubation'),
    ('Domiciliação',          '14710a59-69a6-4556-89ab-5634eac75314'::uuid, 'Domiciliação',
     '00f9835e-dbce-41ca-b174-133bc424cd3e'::uuid, 'Domiciliação', 'domiciliation'),
    ('Incubação de Ideias',   '55cb559a-5e11-41d7-87de-564bd78b783b'::uuid, 'Programa Base',
     '47da3716-f32c-4a1d-8bc2-9a87c8399a0d'::uuid, 'Incubação e Aceleração de Ideias', 'idea_incubation')
)
UPDATE public.bulk_import_rows r
SET edited_json = COALESCE(r.edited_json, r.extracted_json, '{}'::jsonb)
                  || jsonb_build_object(
                       'programme_mapping',
                       jsonb_build_object(
                         'program_id', m.program_id,
                         'program_name', m.program_name,
                         'incubation_type_id', m.incubation_type_id,
                         'incubation_type_name', m.incubation_type_name,
                         'contract_type', m.contract_type,
                         'mapping_option', 'B',
                         'mapped_at', now()
                       )
                     ),
    updated_at = now()
FROM mapping m
WHERE r.batch_id = '3dd77436-e63e-43d7-b607-75cf9bfed953'
  AND r.service_group = m.service_group;

-- Record mapping on the batch itself for audit
UPDATE public.bulk_import_batches
SET updated_at = now()
WHERE id = '3dd77436-e63e-43d7-b607-75cf9bfed953';
