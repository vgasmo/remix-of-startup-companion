-- ============================================================================
-- Corrective migration: tighten EXECUTE grants on SECURITY DEFINER
-- authorization helpers previously broadened by 20260713140511_*.sql.
--
-- Strategy:
--   1. REVOKE from PUBLIC on every helper (defensive baseline).
--   2. GRANT EXECUTE to authenticated on every helper (explicit contract).
--   3. REVOKE EXECUTE from anon on helpers with ZERO anon-reachable policies
--      (verified via pg_policies inspection at migration time).
--   4. Keep anon EXECUTE on helpers still referenced by policies applied to
--      role `public`. Removing those requires rewriting ~250 policies to
--      `TO authenticated`, tracked as a separate follow-up.
--
-- All helpers are SECURITY DEFINER and internally reference auth.uid(); they
-- naturally return false for anon. The concern removed here is enumeration:
-- helpers that take an explicit user_id parameter could otherwise be probed
-- by an anonymous client.
-- ============================================================================

-- ---------- Step 1 + 2: baseline (PUBLIC off, authenticated on) -------------

REVOKE EXECUTE ON FUNCTION public.has_workspace_access(uuid)         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_workspace_access(uuid, uuid)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_active_workspace_access(uuid)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_staff()                         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin()                         FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid)                     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_admin_only()                    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_backoffice()                    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_founder_user()                  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_founder(uuid)                   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_startup_founder(uuid)           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_external_mentor(uuid)           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid)                 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_account_active()                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_account_active(uuid)            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_access_backoffice()            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_write_workspace(uuid)          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_edit_workspace(uuid, uuid)     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_manage_startup(uuid)           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_see_startup_pii(uuid)          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_see_team_member_pii(uuid)      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_connected_mentor(uuid, uuid)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_team_member_of_startup(uuid)    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.shares_workspace_with(uuid)        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_program_access(uuid)           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_workspace_role(uuid, uuid)     FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.has_workspace_access(uuid)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_workspace_access(uuid, uuid)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_workspace_access(uuid)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_staff()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()                          TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_only()                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_backoffice()                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_founder_user()                   TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_founder(uuid)                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_startup_founder(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_external_mentor(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_account_active()                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_account_active(uuid)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_backoffice()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_write_workspace(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_edit_workspace(uuid, uuid)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_startup(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_startup_pii(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_see_team_member_pii(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_connected_mentor(uuid, uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_team_member_of_startup(uuid)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.shares_workspace_with(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_program_access(uuid)            TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_role(uuid, uuid)      TO authenticated;

-- ---------- Step 3: revoke anon on helpers with zero anon-reachable policies

-- Verified via pg_policies scan: none of these appear in any policy whose
-- `roles` array includes `public`. Safe to close to anon.

REVOKE EXECUTE ON FUNCTION public.has_active_workspace_access(uuid)  FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_account_active()                FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_account_active(uuid)            FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid)                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_external_mentor(uuid)           FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_team_member_of_startup(uuid)    FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_connected_mentor(uuid, uuid)    FROM anon;
REVOKE EXECUTE ON FUNCTION public.shares_workspace_with(uuid)        FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_edit_workspace(uuid, uuid)     FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_see_startup_pii(uuid)          FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_see_team_member_pii(uuid)      FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_workspace_role(uuid, uuid)     FROM anon;

-- ---------- Step 4: helpers that MUST stay anon-executable for now ----------
--
-- These are still referenced by RLS policies applied to role `public`.
-- Revoking anon here would surface as "permission denied for function ..."
-- on public/landing/auth pages.
--
-- Follow-up (tracked separately): alter the referencing policies to
-- `TO authenticated` and then REVOKE the corresponding anon grant.
--
--   is_admin()                         -- 95 policies
--   has_workspace_access(uuid)         -- 53 policies
--   is_staff()                         -- 35 policies
--   can_write_workspace(uuid)          -- 26 policies
--   is_founder(uuid)                   --  9 policies
--   has_role(uuid, app_role)           --  8 policies
--   is_conversation_participant(...)   --  7 policies
--   can_access_backoffice()            --  6 policies
--   has_program_access(uuid)           --  6 policies
--   is_backoffice()                    --  5 policies
--   can_manage_startup(uuid)           --  4 policies
--   is_admin_only()                    --  1 policy
--   is_founder_user()                  --  1 policy
--   is_startup_founder(uuid)           --  1 policy
--   is_admin(uuid)                     -- included with is_admin() family
--
-- Left as-is intentionally.
