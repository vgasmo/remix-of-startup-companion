-- Run only through the disposable SQL harness. Hosted verification is read-only.
BEGIN;
SELECT plan(10);

SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='buildings' AND policyname='Authenticated users can view buildings' AND qual LIKE '%has_workspace_access(c.workspace_id)%' AND qual LIKE '%is_staff()%'), 'building reads require staff/backoffice or access to the contract workspace');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='financial_cell_map' AND policyname='Authenticated can read cell map' AND qual='is_staff()'), 'financial cell mapping reads require staff');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='financial_model_metric_map' AND policyname='Authenticated users can read financial_model_metric_map' AND qual='is_staff()'), 'financial metric mapping reads require staff');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='playbook_template_assignments' AND policyname='Authenticated users can view template assignments' AND qual LIKE '%is_account_active()%has_program_access(p.program_id)%has_program_access(t.program_id)%'), 'template assignment reads require active account and program access unless staff');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='quality_checks_config' AND policyname='Authenticated users can read quality_checks_config' AND qual='is_staff()'), 'quality check configuration reads require staff');

SELECT ok(c.relrowsecurity AND NOT has_table_privilege('anon',c.oid,'SELECT') AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname AND p.cmd IN ('ALL','SELECT') AND (p.qual IS NULL OR p.qual IN ('true','(true)'))), c.relname || ': RLS enabled, anonymous reads denied and no unrestricted read policy')
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relname IN ('buildings','financial_cell_map','financial_model_metric_map','playbook_template_assignments','quality_checks_config')
ORDER BY c.relname;

SELECT * FROM finish();
ROLLBACK;