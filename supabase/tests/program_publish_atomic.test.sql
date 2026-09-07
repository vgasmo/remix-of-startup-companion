-- Batch F4 pgTAP: snapshot precedes swap; publish is atomic.
BEGIN;
SELECT plan(6);

SELECT has_table('public','program_publish_snapshots','snapshot audit table exists');
SELECT has_function('public','serialize_program_tree', ARRAY['uuid'], 'tree serializer exists');
SELECT has_function('public','publish_program_atomic', ARRAY['uuid','text'], 'atomic publish RPC exists');

-- P0.1: the SECURITY DEFINER serializer must not be reachable with the anon key.
SELECT function_privs_are('public','serialize_program_tree',ARRAY['uuid'],'anon',ARRAY[]::text[],
  'anon cannot execute serialize_program_tree');

-- Anon may not publish
SET LOCAL role anon;
SELECT throws_ok(
  $$SELECT public.publish_program_atomic('00000000-0000-0000-0000-000000000000'::uuid, NULL)$$,
  '42501', NULL, 'anon cannot publish program');
RESET role;

-- Snapshot RLS: unauthenticated cannot read snapshots
SET LOCAL role anon;
SELECT is((SELECT count(*) FROM public.program_publish_snapshots), 0::bigint,
  'anon sees zero snapshot rows (RLS)');
RESET role;

SELECT * FROM finish();
ROLLBACK;
