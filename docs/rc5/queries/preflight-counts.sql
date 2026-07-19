-- Preflight counts for forward-apply migrations. Capture BEFORE and AFTER.
-- Postflight diff should show non-negative deltas only, and no deletions of rows outside the rc5-e2e- namespace.

SELECT 'workspaces'                 AS t, count(*) FROM public.workspaces
UNION ALL SELECT 'workspace_invitations',   count(*) FROM public.workspace_invitations
UNION ALL SELECT 'session_transcripts',     count(*) FROM public.session_transcripts
UNION ALL SELECT 'transcript_containment_audit', count(*) FROM public.transcript_containment_audit
UNION ALL SELECT 'public_booking_links',    count(*) FROM public.public_booking_links
UNION ALL SELECT 'mentor_bookings',         count(*) FROM public.mentor_bookings
UNION ALL SELECT 'notification_ledger',     count(*) FROM public.notification_ledger
UNION ALL SELECT 'cron_job_runs',           count(*) FROM public.cron_job_runs
UNION ALL SELECT 'automation_health_expectations', count(*) FROM public.automation_health_expectations
UNION ALL SELECT 'user_roles',              count(*) FROM public.user_roles
ORDER BY t;
