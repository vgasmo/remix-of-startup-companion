-- NEUTRALIZED MIGRATION (replay-safety)
-- Previous content executed unconditional cascade DELETEs against workspaces,
-- workspace_users, startups, and every child table. Replaying the migration
-- chain against a fresh or restored database would wipe all tenant data.
--
-- The migration has ALREADY BEEN APPLIED against the live database, so the
-- historical checksum stays intact. Neutralising the file body prevents the
-- destructive DML from running again on `supabase db reset` or on a snapshot
-- restore. Mirrors the neutralisation pattern of 20260430130007.
SELECT 1;
