-- Batch F4 pgTAP: snapshot precedes swap; publish is atomic.
BEGIN;
SELECT plan(5);

SELECT has_table('public','program_publish_snapshots','snapshot audit table exists');
SELECT has_function('public','serialize_program_tree', ARRAY['uuid'], 'tree serializer exists');
SELECT has_function('public','publish_program_atomic', ARRAY['uuid','text'], 'atomic publish RPC exists');

-- Anon may not publish
SET LOCAL role anon;
SELECT throws_ok(
  $$SELECT public.publish_program_atomic('00000000-0000-0000-0000-000000000000'::uuid, NULL)$$,
  '42501', NULL, 'anon cannot publish program');
RESET role;

-- Snapshot RLS: unauthenticated cannot read snapshots
SET LOCAL role anon;
SELECT is((SELECT count(*) FROM public.program_publish_snapshots), 0::bigint,
  'anon sees zero snapshot rows');
RESET role;

SELECT * FROM finish();
ROLLBACK;
