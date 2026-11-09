-- RC12 OPS-14: fourteen READ-ONLY checks. Admin/operator only.
-- No provider calls, token/credential fields, destructive repair or managed-schema writes.
BEGIN READ ONLY;
SET LOCAL statement_timeout='15s';
-- 01 Version must be PostgreSQL 17.
SELECT current_setting('server_version') AS server_version;
-- 02 Public RLS tables without the restrictive suspension guard (documented account-display exceptions).
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity
AND c.relname NOT IN ('profiles','user_roles','profiles_private')
AND NOT EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND NOT p.polpermissive AND pg_get_expr(p.polqual,p.polrelid) LIKE '%account_not_suspended%') ORDER BY 1;
-- 03 Definer function security posture: no sensitive function body output.
SELECT p.proname,pg_get_userbyid(p.proowner) AS owner,p.proconfig
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.prosecdef AND (p.proconfig IS NULL OR NOT EXISTS(SELECT 1 FROM unnest(p.proconfig) x WHERE x LIKE 'search_path=%')) ORDER BY 1;
-- 04 Seven package buckets: missing rows mean failure, public=false required by accepted authenticated-only privacy policy.
SELECT expected.id,b.id IS NOT NULL AS present,b.public FROM (VALUES
 ('workspace-documents'),('bug-report-screenshots'),('profile-avatars'),('startup-logos'),('template_assets'),('phc-extracts'),('admin-exports')) expected(id)
LEFT JOIN storage.buckets b ON b.id=expected.id ORDER BY 1;
-- 05 Cron catalogue for exact manifest comparison, without commands containing URL/auth material.
SELECT jobname,schedule,active FROM cron.job ORDER BY 1;
-- 06 Health registry: compare cadence/enabled with manifest, do not treat missing rows as healthy.
SELECT job_name,expected_cadence_seconds,enabled FROM public.automation_health_expectations ORDER BY 1;
-- 07 Recent failed/partial jobs (details deliberately omitted).
SELECT job_name,status,started_at,finished_at,error_code FROM public.cron_job_runs WHERE started_at>now()-interval '7 days' AND status IN ('failed','partial') ORDER BY started_at DESC LIMIT 100;
-- 08 Stuck job recordings; review duplicate/provider outcome before any retry.
SELECT job_name,started_at FROM public.cron_job_runs WHERE status='running' AND started_at<now()-interval '2 hours' ORDER BY 2 LIMIT 100;
-- 09 Activation recovery queue and signed state. Never activate through UPDATE.
SELECT id,workspace_id,status,signed_at,signature_status FROM public.startup_contracts WHERE activation_sync_pending ORDER BY created_at LIMIT 100;
-- 10 Active contracts without verified signatures.
SELECT id,workspace_id FROM public.startup_contracts WHERE status='active' AND (signed_at IS NULL OR signature_status NOT IN ('signed','completed'));
-- 11 Cross-workspace Data Room document links.
SELECT i.id FROM public.dataroom_items i JOIN public.datarooms r ON r.id=i.dataroom_id JOIN public.documents d ON d.id=i.document_id WHERE r.workspace_id<>d.workspace_id;
-- 12 Cross-workspace Data Room investor update links.
SELECT i.id FROM public.dataroom_items i JOIN public.datarooms r ON r.id=i.dataroom_id JOIN public.investor_updates u ON u.id=i.investor_update_id WHERE r.workspace_id<>u.workspace_id;
-- 13 Latest backup status without object paths; retrieve/check files only in the admin-authorized storage workflow.
SELECT id,status,started_at,completed_at,checksum,record_counts FROM public.ecosystem_snapshots ORDER BY started_at DESC LIMIT 7;
-- 14 Signed contract archive backlog without external URLs or signer data.
SELECT id,archive_status,archive_attempt_count FROM public.startup_contracts WHERE signed_at IS NOT NULL AND archive_status IS DISTINCT FROM 'archived' ORDER BY signed_at LIMIT 100;
ROLLBACK;
