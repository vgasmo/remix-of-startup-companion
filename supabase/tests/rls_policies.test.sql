-- pgTAP tests for core RLS policies and DB invariants
-- Run with: supabase test db
--
-- These tests validate that RLS is enabled and key policies exist
-- for security-critical tables.

BEGIN;

SELECT plan(51);

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
   WHERE confidentiality NOT IN ('staff_only','workspace','founder_only')),
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

SELECT * FROM finish();
ROLLBACK;
