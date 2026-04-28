
-- 1) Drop deprecated graph_secret_key column (secrets are server-side only)
ALTER TABLE public.outlook_calendar_settings DROP COLUMN IF EXISTS graph_secret_key;

-- 2) Tighten playbook-evidence storage INSERT policy to verify workspace write access
DROP POLICY IF EXISTS "Users can upload evidence files" ON storage.objects;
CREATE POLICY "Users can upload evidence files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'playbook-evidence'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND (storage.foldername(name))[2] IS NOT NULL
  AND public.can_write_workspace(((storage.foldername(name))[2])::uuid)
);

-- Also tighten UPDATE/DELETE if present, otherwise create restrictive ones
DROP POLICY IF EXISTS "Users can update their evidence files" ON storage.objects;
CREATE POLICY "Users can update their evidence files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'playbook-evidence'
  AND (auth.uid())::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'playbook-evidence'
  AND (auth.uid())::text = (storage.foldername(name))[1]
  AND (storage.foldername(name))[2] IS NOT NULL
  AND public.can_write_workspace(((storage.foldername(name))[2])::uuid)
);

DROP POLICY IF EXISTS "Users can delete their evidence files" ON storage.objects;
CREATE POLICY "Users can delete their evidence files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'playbook-evidence'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.is_staff()
  )
);

-- 3) Revoke default PUBLIC EXECUTE on all SECURITY DEFINER functions in public,
--    then grant EXECUTE selectively.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.proname, r.args);
  END LOOP;
END $$;

-- Trigger-only / internal functions: no grants needed.
-- Grant EXECUTE to authenticated for RLS helpers and RPCs invoked by signed-in users.
DO $$
DECLARE
  fname text;
  authenticated_funcs text[] := ARRAY[
    -- Role / access predicates (used by RLS and by client checks)
    'is_admin','is_admin_only','is_staff','is_backoffice','is_founder_user',
    'is_external_mentor','has_role','has_any_role',
    'is_account_active','has_accepted_nda','can_access_backoffice',
    'has_workspace_access','has_active_workspace_access','can_write_workspace',
    'can_edit_workspace','is_founder','is_startup_founder','is_team_member_of_startup',
    'can_manage_startup','can_see_startup_pii','can_see_team_member_pii',
    'has_program_access','is_conversation_participant','is_connected_mentor',
    'shares_workspace_with','can_view_quality_result',
    'get_workspace_role','get_session_workspace_id','get_dataroom_workspace_id',
    -- RPCs called by clients
    'ensure_founder_role','create_startup_application','create_conversation',
    'submit_checkin','ensure_dataroom_exists','approve_user_account',
    'block_workspace','unblock_workspace','approve_startup_claim','reject_startup_claim',
    'claim_startup','staff_assign_or_create_workspace','staff_create_workspace_for_claim',
    'staff_delete_user','get_assigned_consultant_contact','get_workspace_stats',
    'get_kpi_percentiles','check_ai_rate_limit','check_signup_allowed',
    'get_next_intake_consultant','generate_contract_number',
    'materialize_acceleration_deliverables'
  ];
BEGIN
  FOREACH fname IN ARRAY authenticated_funcs LOOP
    PERFORM 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.proname = fname;
    IF FOUND THEN
      -- Grant for every overload of this function name
      EXECUTE (
        SELECT string_agg(
          format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated',
                 p.proname, pg_get_function_identity_arguments(p.oid)),
          '; '
        )
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname='public' AND p.proname = fname
      );
    END IF;
  END LOOP;
END $$;
