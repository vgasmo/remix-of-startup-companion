-- RC5 SECURITY DEFINER audit — run manually against staging.
-- Confirms every definer function landed by RC5 is owned by postgres and pins search_path.

SELECT
  n.nspname     AS schema,
  p.proname     AS function,
  r.rolname     AS owner,
  p.prosecdef   AS is_definer,
  p.proconfig   AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
JOIN pg_roles r ON r.oid = p.proowner
WHERE n.nspname = 'public'
  AND p.prosecdef = true
  AND p.proname IN (
    'accept_workspace_invitation',
    'promote_booking_link_canonical',
    'resolve_canonical_booking_token',
    'check_automation_health',
    'staff_diagnose_program_mismatches',
    'staff_transfer_workspace_program',
    'create_mentor_booking_idempotent',
    'complete_milestone_with_actions',
    'has_role',
    'is_staff',
    'has_workspace_access'
  )
ORDER BY p.proname;

-- Every row MUST show:
--   owner = 'postgres'
--   is_definer = true
--   config contains 'search_path=public' (or =public, pg_temp).

-- EXECUTE grants:
SELECT
  routine_schema, routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'accept_workspace_invitation',
    'promote_booking_link_canonical',
    'resolve_canonical_booking_token',
    'check_automation_health',
    'staff_diagnose_program_mismatches',
    'staff_transfer_workspace_program',
    'create_mentor_booking_idempotent',
    'complete_milestone_with_actions'
  )
ORDER BY routine_name, grantee;
-- Expect anon: only resolve_canonical_booking_token.
-- Expect authenticated: business RPCs listed above.
-- Expect service_role: all.
