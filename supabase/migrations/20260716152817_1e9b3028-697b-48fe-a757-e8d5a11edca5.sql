-- M-sql1: restrict get_feature_control to an explicit key allowlist.
CREATE OR REPLACE FUNCTION public.get_feature_control(_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(value, '{}'::jsonb)
  FROM public.system_settings
  WHERE key = _key
    AND _key IN (
      'reconciler.emergency_stop',
      'reconciler.dry_run_enabled',
      'reconciler.write_mode',
      'reconciler.writes_enabled',
      'reconciler.canary_max_rows',
      'reconciler.batch_allowlist',
      'financial_business_plan_coach_v1'
    );
$$;

COMMENT ON FUNCTION public.get_feature_control(text) IS
  'Server-side feature-flag/setting reader. Restricted to an explicit allowlist so it cannot leak arbitrary system_settings rows past RLS.';

-- M-sql3: drop the stale 2-arg overload of reconciler_commit_row.
DROP FUNCTION IF EXISTS public.reconciler_commit_row(uuid, text);
