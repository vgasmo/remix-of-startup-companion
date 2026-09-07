-- P4.5 — serialize_program_tree must never be callable without signing in.
BEGIN;
SELECT plan(3);

SELECT has_function('public', 'serialize_program_tree', 'serialize_program_tree exists');

SELECT is(
  has_function_privilege('anon', 'public.serialize_program_tree(uuid)', 'EXECUTE'),
  false,
  'anon cannot execute serialize_program_tree'
);

SELECT is(
  has_function_privilege('service_role', 'public.serialize_program_tree(uuid)', 'EXECUTE'),
  true,
  'service_role can execute serialize_program_tree'
);

SELECT * FROM finish();
ROLLBACK;
