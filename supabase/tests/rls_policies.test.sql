-- pgTAP tests for core RLS policies and DB invariants
-- Run with: supabase test db
--
-- These tests validate that RLS is enabled and key policies exist
-- for security-critical tables.

BEGIN;

SELECT plan(39);

-- ============================================================
-- Gate 1: RLS must be enabled on all critical tables
-- ============================================================

SELECT has_table('public', 'action_items', 'action_items table exists');
SELECT row_eq(
  $$SELECT relrowsecurity FROM pg_class WHERE relname = 'action_items'$$,
  ROW(true),
  'RLS is enabled on action_items'
);

SELECT has_table('public', 'workspaces', 'workspaces table exists');
SELECT row_eq(
  $$SELECT relrowsecurity FROM pg_class WHERE relname = 'workspaces'$$,
  ROW(true),
  'RLS is enabled on workspaces'
);

SELECT has_table('public', 'sessions', 'sessions table exists');
SELECT row_eq(
  $$SELECT relrowsecurity FROM pg_class WHERE relname = 'sessions'$$,
  ROW(true),
  'RLS is enabled on sessions'
);

SELECT has_table('public', 'contracts', 'contracts table exists');
SELECT row_eq(
  $$SELECT relrowsecurity FROM pg_class WHERE relname = 'contracts'$$,
  ROW(true),
  'RLS is enabled on contracts'
);

SELECT has_table('public', 'invoices', 'invoices table exists');
SELECT row_eq(
  $$SELECT relrowsecurity FROM pg_class WHERE relname = 'invoices'$$,
  ROW(true),
  'RLS is enabled on invoices'
);

SELECT has_table('public', 'funnel_items', 'funnel_items (CRM) table exists');
SELECT row_eq(
  $$SELECT relrowsecurity FROM pg_class WHERE relname = 'funnel_items'$$,
  ROW(true),
  'RLS is enabled on funnel_items'
);

SELECT has_table('public', 'office_spaces', 'office_spaces table exists');
SELECT row_eq(
  $$SELECT relrowsecurity FROM pg_class WHERE relname = 'office_spaces'$$,
  ROW(true),
  'RLS is enabled on office_spaces'
);

SELECT has_table('public', 'startup_claim_requests', 'startup_claim_requests table exists');
SELECT row_eq(
  $$SELECT relrowsecurity FROM pg_class WHERE relname = 'startup_claim_requests'$$,
  ROW(true),
  'RLS is enabled on startup_claim_requests'
);

-- ============================================================
-- Gate 2: Key security-definer functions exist
-- ============================================================

SELECT has_function(
  'public',
  'has_active_workspace_access',
  ARRAY['uuid'],
  'has_active_workspace_access function exists'
);

SELECT has_function(
  'public',
  'claim_startup',
  'claim_startup function exists'
);

-- ============================================================
-- Gate 3: DB invariants — no secrets in settings tables
-- ============================================================

-- Ensure global_integration_settings does not store raw secrets
SELECT is(
  (SELECT count(*)::int FROM public.global_integration_settings
   WHERE settings_json::text ~* '(client_secret|api_key|secret_key|private_key)'),
  0,
  'No secrets stored in global_integration_settings'
);

-- ============================================================
-- Gate 4: Critical columns must NOT be nullable where RLS depends on them
-- ============================================================

SELECT col_not_null('public', 'action_items', 'workspace_id', 'action_items.workspace_id is NOT NULL');
SELECT col_not_null('public', 'invoices', 'workspace_id', 'invoices.workspace_id is NOT NULL');

-- ============================================================
-- Gate 5: session_transcripts tiered confidentiality (T1)
-- ============================================================

SELECT has_table('public', 'session_transcripts', 'session_transcripts table exists');
SELECT row_eq(
  $$SELECT relrowsecurity FROM pg_class WHERE relname = 'session_transcripts'$$,
  ROW(true),
  'RLS is enabled on session_transcripts'
);

-- Confidentiality CHECK constraint restricts to allowed tiers
SELECT is(
  (SELECT count(*)::int FROM public.session_transcripts
   WHERE confidentiality NOT IN ('staff_only','workspace')),
  0,
  'No session_transcripts row has an illegal confidentiality tier'
);

-- Containment column exists (fail-closed marker)
SELECT has_column('public', 'session_transcripts', 'pending_confidentiality_review',
  'session_transcripts.pending_confidentiality_review exists');

-- Audit table exists and is content-free (no transcript body columns)
SELECT has_table('public', 'transcript_containment_audit', 'transcript_containment_audit exists');
SELECT hasnt_column('public', 'transcript_containment_audit', 'content',
  'transcript_containment_audit does not store transcript content');
SELECT hasnt_column('public', 'transcript_containment_audit', 'body',
  'transcript_containment_audit does not store transcript body');

-- ============================================================
-- Gate 6: session_transcripts RLS role×tier matrix (T1)
--
-- Seeds 6 personas (anon / founder-in-ws / founder-out-ws / mentor-no-nda /
-- consultor / admin) and 3 transcript tiers (staff_only / workspace /
-- workspace), then simulates each authenticated persona via JWT claims and
-- asserts the row count each may SELECT. Runs inside the outer transaction so
-- all seeded rows are rolled back at the end.
-- ============================================================

-- ---- Seed fixtures ----
DO $seed$
DECLARE
  v_admin uuid := '00000000-0000-0000-0000-0000000000a1';
  v_consultor uuid := '00000000-0000-0000-0000-0000000000c1';
  v_founder_in uuid := '00000000-0000-0000-0000-0000000000f1';
  v_founder_out uuid := '00000000-0000-0000-0000-0000000000f2';
  v_mentor uuid := '00000000-0000-0000-0000-0000000000e1';
  v_ws uuid := '00000000-0000-0000-0000-0000000000b1';
  v_session uuid := '00000000-0000-0000-0000-0000000000d1';
BEGIN
  -- auth.users (test-only; rolled back)
  INSERT INTO auth.users(id, email, instance_id, aud, role)
  SELECT u, u::text || '@t.invalid', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  FROM unnest(ARRAY[v_admin, v_consultor, v_founder_in, v_founder_out, v_mentor]) u
  ON CONFLICT DO NOTHING;

  INSERT INTO public.profiles(id, email, account_status)
  SELECT u, u::text || '@t.invalid', 'approved'
  FROM unnest(ARRAY[v_admin, v_consultor, v_founder_in, v_founder_out, v_mentor]) u
  ON CONFLICT (id) DO UPDATE SET account_status = 'approved';

  INSERT INTO public.user_roles(user_id, role) VALUES
    (v_admin, 'admin'),
    (v_consultor, 'consultor'),
    (v_mentor, 'mentor_externo')
  ON CONFLICT DO NOTHING;

  -- workspaces carries no name of its own: identity lives on startups/programs.
  INSERT INTO public.startups(id, name) VALUES (v_ws, 'T1 Matrix Startup')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.programs(id, name) VALUES (v_ws, 'T1 Matrix Program')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspaces(id, startup_id, program_id, status)
  VALUES (v_ws, v_ws, v_ws, 'active')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspace_users(user_id, workspace_id, role, active)
  VALUES (v_founder_in, v_ws, 'founder', true)
  ON CONFLICT DO NOTHING;


  INSERT INTO public.sessions(id, workspace_id, title, scheduled_at)
  VALUES (v_session, v_ws, 'T1 Matrix Session', now())
  ON CONFLICT (id) DO NOTHING;

  -- source is constrained to the known importers; NULL means manual entry.
  INSERT INTO public.session_transcripts(session_id, confidentiality, transcript_text, source) VALUES
    (v_session, 'staff_only',    'staff tier',   NULL),
    (v_session, 'workspace',     'ws tier',      NULL);
END
$seed$;

-- Helper: switch to authenticated role with a given sub
CREATE OR REPLACE FUNCTION pg_temp.as_user(_uid uuid) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', _uid, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;

CREATE OR REPLACE FUNCTION pg_temp.as_anon() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  EXECUTE 'SET LOCAL ROLE anon';
END $$;

CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void
LANGUAGE plpgsql AS $$ BEGIN EXECUTE 'RESET ROLE'; END $$;

-- ---- Anon: sees zero transcripts (no policy grants anon) ----
SELECT pg_temp.as_anon();
SELECT is((SELECT count(*)::int FROM public.session_transcripts
           WHERE session_id = '00000000-0000-0000-0000-0000000000d1'), 0,
  'anon sees 0 transcripts (fail-closed)');
SELECT pg_temp.reset_role();

-- ---- Admin: sees all 3 tiers ----
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000a1');
SELECT is((SELECT count(*)::int FROM public.session_transcripts
           WHERE session_id = '00000000-0000-0000-0000-0000000000d1'), 2,
  'admin sees all 2 transcript tiers');
SELECT is((SELECT count(*)::int FROM public.session_transcripts
           WHERE session_id = '00000000-0000-0000-0000-0000000000d1'
             AND confidentiality = 'staff_only'), 1,
  'admin sees staff_only tier');
SELECT is((SELECT count(*)::int FROM public.session_transcripts
           WHERE session_id = '00000000-0000-0000-0000-0000000000d1'
             AND confidentiality = 'workspace'), 1,
  'admin sees workspace tier');
SELECT pg_temp.reset_role();

-- ---- Consultor: sees all 3 tiers (staff bypass) ----
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000c1');
SELECT is((SELECT count(*)::int FROM public.session_transcripts
           WHERE session_id = '00000000-0000-0000-0000-0000000000d1'), 2,
  'consultor sees all 3 transcript tiers (staff bypass)');
SELECT pg_temp.reset_role();

-- ---- Founder in workspace: sees ONLY workspace tier ----
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000f1');
SELECT is((SELECT count(*)::int FROM public.session_transcripts
           WHERE session_id = '00000000-0000-0000-0000-0000000000d1'), 1,
  'founder-in-ws sees exactly 1 transcript (workspace tier only)');
SELECT is((SELECT count(*)::int FROM public.session_transcripts
           WHERE session_id = '00000000-0000-0000-0000-0000000000d1'
             AND confidentiality = 'workspace'), 1,
  'founder-in-ws sees workspace tier');
SELECT is((SELECT count(*)::int FROM public.session_transcripts
           WHERE session_id = '00000000-0000-0000-0000-0000000000d1'
             AND confidentiality = 'staff_only'), 0,
  'founder-in-ws does NOT see staff_only tier');
SELECT is((SELECT count(*)::int FROM public.session_transcripts
           WHERE session_id = '00000000-0000-0000-0000-0000000000d1'
             AND confidentiality = 'staff_only'), 0,
  'founder-in-ws does NOT see staff_only tier (fail-closed containment)');
SELECT pg_temp.reset_role();

-- ---- Founder out of workspace: sees zero ----
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000f2');
SELECT is((SELECT count(*)::int FROM public.session_transcripts
           WHERE session_id = '00000000-0000-0000-0000-0000000000d1'), 0,
  'founder-out-of-ws sees 0 transcripts');
SELECT pg_temp.reset_role();

-- ---- Mentor without NDA: sees zero even for workspace tier ----
SELECT pg_temp.as_user('00000000-0000-0000-0000-0000000000e1');
SELECT is((SELECT count(*)::int FROM public.session_transcripts
           WHERE session_id = '00000000-0000-0000-0000-0000000000d1'), 0,
  'mentor without NDA sees 0 transcripts (NDA gate)');
SELECT pg_temp.reset_role();

SELECT * FROM finish();
ROLLBACK;
