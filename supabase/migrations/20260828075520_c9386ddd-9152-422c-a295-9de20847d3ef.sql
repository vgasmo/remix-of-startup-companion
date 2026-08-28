ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS email_on_founder_delays boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.notification_preferences.email_on_founder_delays IS
  'When false, staff/consultants stop receiving email alerts about founder delays (inactivity, overdue milestones/check-ins, stale KPIs). In-app notifications are unaffected.';