-- RC5 automation-health probe. Run manually on staging to confirm the 6-state model.
-- Expected: every registered job appears; jobs with zero cron_job_runs rows classify as never_run;
-- jobs whose last row is older than expected_max_age classify as stale.

SELECT
  e.job_name,
  e.expected_cadence_minutes,
  e.grace_minutes,
  latest.status                                    AS last_status,
  latest.finished_at                               AS last_run,
  CASE
    WHEN latest.finished_at IS NULL                                     THEN 'never_run'
    WHEN latest.status = 'ok'
         AND latest.finished_at > now() - (e.expected_cadence_minutes + e.grace_minutes) * interval '1 minute' THEN 'healthy'
    WHEN latest.status = 'partial'                                      THEN 'degraded'
    WHEN latest.status = 'failed'                                       THEN 'failed'
    WHEN latest.finished_at <= now() - (e.expected_cadence_minutes + e.grace_minutes) * interval '1 minute' THEN 'stale'
    ELSE 'unknown'
  END AS classified_state
FROM public.automation_health_expectations e
LEFT JOIN LATERAL (
  SELECT status, finished_at
  FROM public.cron_job_runs r
  WHERE r.job_name = e.job_name
  ORDER BY r.finished_at DESC
  LIMIT 1
) latest ON TRUE
ORDER BY e.job_name;
