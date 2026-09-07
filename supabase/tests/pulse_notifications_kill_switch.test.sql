-- P1.8 pgTAP: with the founder kill-switch on, pulse enqueueing must skip blocked
-- founders instead of creating orphan attempts, and the helper is not anon-callable.
BEGIN;
SELECT plan(3);

SELECT has_function('public', 'founder_notifications_blocked', ARRAY['uuid'],
  'kill-switch helper exists');

SELECT function_privs_are('public', 'founder_notifications_blocked', ARRAY['uuid'],
  'anon', ARRAY[]::text[], 'anon cannot execute founder_notifications_blocked');

SELECT matches(
  (SELECT pg_get_functiondef(p.oid) FROM pg_proc p
     JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'enqueue_pulse_notifications'),
  'founder_notifications_blocked',
  'enqueue_pulse_notifications consults the kill-switch');

SELECT * FROM finish();
ROLLBACK;
