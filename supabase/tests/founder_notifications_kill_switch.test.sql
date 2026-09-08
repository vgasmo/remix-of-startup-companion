-- Behavioural coverage for the admin founder-notification kill switch.
-- With `notifications.founders_disabled` = true, founders and team members must
-- receive nothing, while staff notifications keep flowing.
BEGIN;
SELECT plan(7);

SELECT has_function('public', 'block_founder_notifications', 'kill-switch trigger function exists');

SELECT isnt_empty(
  $$SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
     WHERE c.relname = 'notifications' AND NOT t.tgisinternal
       AND t.tgfoid = 'public.block_founder_notifications'::regproc$$,
  'notifications carries the kill-switch trigger');

-- Fixtures -------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('b0000000-0000-4000-8000-0000000000f1', 'founder.kill@example.com'),
  ('b0000000-0000-4000-8000-0000000000f2', 'admin.kill@example.com'),
  ('b0000000-0000-4000-8000-0000000000f3', 'team.kill@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role) VALUES
  ('b0000000-0000-4000-8000-0000000000f1', 'founder'),
  ('b0000000-0000-4000-8000-0000000000f2', 'admin'),
  ('b0000000-0000-4000-8000-0000000000f3', 'team_member')
ON CONFLICT DO NOTHING;

-- Switch OFF -----------------------------------------------------------------
INSERT INTO public.system_settings (key, value)
VALUES ('notifications.founders_disabled', 'false'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = 'false'::jsonb;

INSERT INTO public.notifications (user_id, type, title)
VALUES ('b0000000-0000-4000-8000-0000000000f1', 'kpi_stale', 'off-state founder');

SELECT is(
  (SELECT count(*)::int FROM public.notifications
    WHERE user_id = 'b0000000-0000-4000-8000-0000000000f1'), 1,
  'switch OFF: founder notification is stored');

SELECT ok(NOT public.founder_notifications_blocked('b0000000-0000-4000-8000-0000000000f1'),
  'switch OFF: helper reports founder as not blocked');

-- Switch ON ------------------------------------------------------------------
UPDATE public.system_settings SET value = 'true'::jsonb
 WHERE key = 'notifications.founders_disabled';

INSERT INTO public.notifications (user_id, type, title)
VALUES ('b0000000-0000-4000-8000-0000000000f1', 'kpi_stale', 'blocked founder');
INSERT INTO public.notifications (user_id, type, title)
VALUES ('b0000000-0000-4000-8000-0000000000f3', 'kpi_stale', 'blocked team member');
INSERT INTO public.notifications (user_id, type, title)
VALUES ('b0000000-0000-4000-8000-0000000000f2', 'kpi_stale', 'staff still notified');

SELECT is(
  (SELECT count(*)::int FROM public.notifications
    WHERE user_id IN ('b0000000-0000-4000-8000-0000000000f1',
                      'b0000000-0000-4000-8000-0000000000f3')
      AND title LIKE 'blocked %'), 0,
  'switch ON: founder and team-member notifications are dropped');

SELECT is(
  (SELECT count(*)::int FROM public.notifications
    WHERE user_id = 'b0000000-0000-4000-8000-0000000000f2'), 1,
  'switch ON: staff notifications are unaffected');

SELECT ok(public.founder_notifications_blocked('b0000000-0000-4000-8000-0000000000f1')
      AND NOT public.founder_notifications_blocked('b0000000-0000-4000-8000-0000000000f2'),
  'switch ON: helper blocks founders but not staff');

SELECT * FROM finish();
ROLLBACK;
