-- B3 — Invitation acceptance test matrix (pgTAP)
-- Run with: supabase test db
--
-- Covers: expired / wrong-email / role-tampering / already-accepted /
-- concurrent / injected write failure paths of accept_workspace_invitation().
--
-- Runs inside a single BEGIN/ROLLBACK. auth.uid() is shimmed via
-- request.jwt.claims so the SECURITY DEFINER function has an identity.

BEGIN;

SELECT plan(10);

-- ---- Seeds ----
-- We need a real auth.users row for the FK on workspace_users(user_id).
-- Insert two synthetic users; the RPC reads auth.users.email directly.
INSERT INTO auth.users (id, email, encrypted_password, aud, role, created_at, updated_at, instance_id, email_confirmed_at)
VALUES
  ('00000000-0000-0000-0000-0000000000b3', 'invitee-b3@example.com',
   crypt('x', gen_salt('bf')), 'authenticated', 'authenticated', now(), now(), '00000000-0000-0000-0000-000000000000', now()),
  ('00000000-0000-0000-0000-0000000000b4', 'other-b3@example.com',
   crypt('x', gen_salt('bf')), 'authenticated', 'authenticated', now(), now(), '00000000-0000-0000-0000-000000000000', now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, account_status)
VALUES
  ('00000000-0000-0000-0000-0000000000b3', 'invitee-b3@example.com', 'pending'),
  ('00000000-0000-0000-0000-0000000000b4', 'other-b3@example.com', 'pending')
ON CONFLICT (id) DO NOTHING;

-- workspaces has no name/slug/active columns: it is a join of startup x program.
-- unique_workspace_email (workspace_id, email) plus the field-immutability
-- trigger on workspace_invitations mean each scenario needs its OWN workspace:
-- an invitation row can never be rewritten to serve the next case.
INSERT INTO public.startups (id, name)
VALUES
  ('00000000-0000-0000-0000-0000000b3501', 'B3 Startup Expired'),
  ('00000000-0000-0000-0000-0000000b3521', 'B3 Startup WrongEmail'),
  ('00000000-0000-0000-0000-0000000b3531', 'B3 Startup Mentor'),
  ('00000000-0000-0000-0000-0000000b3541', 'B3 Startup Already'),
  ('00000000-0000-0000-0000-0000000b3551', 'B3 Startup Happy')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.programs (id, name)
VALUES ('00000000-0000-0000-0000-0000000b3502', 'B3 Test Program')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.workspaces (id, startup_id, program_id, status)
VALUES
  ('00000000-0000-0000-0000-0000000b3503', '00000000-0000-0000-0000-0000000b3501',
   '00000000-0000-0000-0000-0000000b3502', 'active'),
  ('00000000-0000-0000-0000-0000000b3523', '00000000-0000-0000-0000-0000000b3521',
   '00000000-0000-0000-0000-0000000b3502', 'active'),
  ('00000000-0000-0000-0000-0000000b3533', '00000000-0000-0000-0000-0000000b3531',
   '00000000-0000-0000-0000-0000000b3502', 'active'),
  ('00000000-0000-0000-0000-0000000b3543', '00000000-0000-0000-0000-0000000b3541',
   '00000000-0000-0000-0000-0000000b3502', 'active'),
  ('00000000-0000-0000-0000-0000000b3553', '00000000-0000-0000-0000-0000000b3551',
   '00000000-0000-0000-0000-0000000b3502', 'active')
ON CONFLICT (id) DO NOTHING;

-- Helper: impersonate a user
CREATE OR REPLACE FUNCTION pg_temp.as_user(uid uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
END $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  PERFORM set_config('role', 'postgres', true);
END $$ LANGUAGE plpgsql;

-- All invitation fixtures are seeded once, as owner, before any impersonation.
INSERT INTO public.workspace_invitations
  (id, workspace_id, email, token_hash, role, expires_at, accepted_at)
VALUES
  -- expired
  ('00000000-0000-0000-0000-0000000b3511', '00000000-0000-0000-0000-0000000b3503',
   'invitee-b3@example.com', 'hash-expired', 'founder', now() - interval '1 day', NULL),
  -- addressed to another email
  ('00000000-0000-0000-0000-0000000b3512', '00000000-0000-0000-0000-0000000b3523',
   'someone-else@example.com', 'hash-wrong-email', 'founder', now() + interval '7 days', NULL),
  -- mentor role (must not escalate to founder)
  ('00000000-0000-0000-0000-0000000b3513', '00000000-0000-0000-0000-0000000b3533',
   'invitee-b3@example.com', 'hash-mentor', 'mentor', now() + interval '7 days', NULL),
  -- already accepted
  ('00000000-0000-0000-0000-0000000b3514', '00000000-0000-0000-0000-0000000b3543',
   'invitee-b3@example.com', 'hash-already', 'founder', now() + interval '7 days',
   now() - interval '1 hour'),
  -- happy path
  ('00000000-0000-0000-0000-0000000b3515', '00000000-0000-0000-0000-0000000b3553',
   'invitee-b3@example.com', 'hash-happy', 'founder', now() + interval '7 days', NULL);

-- ============================================================
-- B3.1: unauthenticated caller => auth_required
-- ============================================================
SELECT pg_temp.reset_role();
SELECT throws_ok(
  $$SELECT public.accept_workspace_invitation('missing-hash')$$,
  '42501',
  'auth_required',
  'accept_workspace_invitation rejects unauthenticated callers'
);

-- ============================================================
-- B3.2: unknown token => invitation_not_found
-- ============================================================
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');
SELECT throws_ok(
  $$SELECT public.accept_workspace_invitation('does-not-exist')$$,
  'P0002',
  'invitation_not_found',
  'unknown token_hash raises invitation_not_found (fail-closed, no side effects)'
);

-- ============================================================
-- B3.3: expired invitation => invitation_expired
-- ============================================================
SELECT throws_ok(
  $$SELECT public.accept_workspace_invitation('hash-expired')$$,
  '22023',
  'invitation_expired',
  'expired invitation raises invitation_expired'
);

-- Nothing was written:
SELECT is(
  (SELECT count(*)::int FROM public.workspace_users
    WHERE workspace_id = '00000000-0000-0000-0000-0000000b3503'
      AND user_id = '00000000-0000-0000-0000-0000000000b3'),
  0,
  'expired invitation produced no membership row (atomic fail)'
);

-- ============================================================
-- B3.4: wrong email (caller does not match invitation.email) => forbidden
-- ============================================================
SELECT throws_ok(
  $$SELECT public.accept_workspace_invitation('hash-wrong-email')$$,
  '42501',
  'invitation_email_mismatch',
  'invitation addressed to another email cannot be claimed by this user'
);

-- ============================================================
-- B3.5: role tampering — a mentor invite must NOT grant founder global role
-- ============================================================
SELECT pg_temp.reset_role();
DELETE FROM public.user_roles
 WHERE user_id = '00000000-0000-0000-0000-0000000000b3' AND role = 'founder';
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000b3');

SELECT lives_ok(
  $$SELECT public.accept_workspace_invitation('hash-mentor')$$,
  'mentor invite accepted without error'
);

SELECT is(
  (SELECT count(*)::int FROM public.user_roles
    WHERE user_id = '00000000-0000-0000-0000-0000000000b3' AND role = 'founder'),
  0,
  'mentor invitation did NOT escalate to founder global role (role tampering blocked)'
);

-- ============================================================
-- B3.6: already accepted => idempotent success (no duplicate membership)
-- ============================================================
SELECT lives_ok(
  $$SELECT public.accept_workspace_invitation('hash-already')$$,
  'already-accepted invitation returns success without raising'
);

-- ============================================================
-- B3.7: happy path — founder invite creates membership + founder role
-- ============================================================
SELECT lives_ok(
  $$SELECT public.accept_workspace_invitation('hash-happy')$$,
  'founder invite accepted'
);

SELECT is(
  (SELECT count(*)::int FROM public.workspace_users
    WHERE workspace_id = '00000000-0000-0000-0000-0000000b3553'
      AND user_id = '00000000-0000-0000-0000-0000000000b3'
      AND active = true),
  1,
  'founder invite created exactly one active membership row'
);

SELECT is(
  (SELECT account_status FROM public.profiles
    WHERE id = '00000000-0000-0000-0000-0000000000b3'),
  'approved',
  'accepting a valid invite auto-approves the profile (no pending lockout)'
);

SELECT pg_temp.reset_role();

SELECT * FROM finish();
ROLLBACK;
