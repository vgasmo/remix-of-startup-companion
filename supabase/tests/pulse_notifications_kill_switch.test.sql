-- P1.8 pgTAP: with the founder kill-switch on, pulse enqueueing must skip blocked
-- founders instead of creating orphan attempts, and the helper is not anon-callable.
BEGIN;
SELECT plan(8);

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

-- Behavioral fixtures: the flag is OFF by default, so without turning it on
-- the function must always return 0 regardless of the kill-switch.
INSERT INTO auth.users (id, email) VALUES
  ('b0000000-0000-4000-8000-00000000f001', 'founder.kill-switch@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name, account_status)
VALUES ('b0000000-0000-4000-8000-00000000f001', 'founder.kill-switch@example.com', 'KS Founder', 'approved')
ON CONFLICT (id) DO UPDATE SET account_status = 'approved';

INSERT INTO public.startups (id, name) VALUES
  ('b0000000-0000-4000-8000-00000000f002', 'KS Startup')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.programs (id, name) VALUES
  ('b0000000-0000-4000-8000-00000000f003', 'KS Program')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspaces (id, startup_id, program_id, status, stage)
VALUES ('b0000000-0000-4000-8000-00000000f004', 'b0000000-0000-4000-8000-00000000f002',
        'b0000000-0000-4000-8000-00000000f003', 'active', 'validation')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspace_users (workspace_id, user_id, role, active)
VALUES ('b0000000-0000-4000-8000-00000000f004', 'b0000000-0000-4000-8000-00000000f001', 'founder', true)
ON CONFLICT DO NOTHING;

INSERT INTO public.founder_pulse_cycles (id, workspace_id, period_month, status)
VALUES ('b0000000-0000-4000-8000-00000000f005', 'b0000000-0000-4000-8000-00000000f004',
        date_trunc('month', now())::date, 'open')
ON CONFLICT (id) DO NOTHING;

-- Flag still off: enqueue must no-op.
SELECT is(
  public.enqueue_pulse_notifications('b0000000-0000-4000-8000-00000000f005'::uuid),
  0,
  'flag off by default -> enqueue_pulse_notifications returns 0'
);

-- Turn the flag on and verify behavior toggles with the per-founder kill-switch.
INSERT INTO public.feature_flags (key, enabled, scope)
VALUES ('founder_monthly_pulse', true, 'global')
ON CONFLICT (key) DO UPDATE SET enabled = true, scope = 'global';

INSERT INTO public.system_settings (key, value)
VALUES ('notifications.founders_disabled', 'true'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = 'true'::jsonb;

SELECT is(
  public.enqueue_pulse_notifications('b0000000-0000-4000-8000-00000000f005'::uuid),
  0,
  'founders_disabled=true -> enqueue_pulse_notifications returns 0 and skips the founder'
);

SELECT is(
  (SELECT count(*)::int FROM public.notification_attempts na
     JOIN public.notifications n ON n.id = na.notification_id
    WHERE n.entity_id = 'b0000000-0000-4000-8000-00000000f005'),
  0,
  'founders_disabled=true -> no notification_attempts row is created'
);

UPDATE public.system_settings SET value = 'false'::jsonb
 WHERE key = 'notifications.founders_disabled';

SELECT is(
  public.enqueue_pulse_notifications('b0000000-0000-4000-8000-00000000f005'::uuid),
  1,
  'founders_disabled=false -> enqueue_pulse_notifications enqueues the approved founder'
);

SELECT is(
  (SELECT count(*)::int FROM public.notification_attempts na
     JOIN public.notifications n ON n.id = na.notification_id
    WHERE n.entity_id = 'b0000000-0000-4000-8000-00000000f005'),
  1,
  'founders_disabled=false -> exactly one notification_attempts row is created'
);

SELECT * FROM finish();
ROLLBACK;
