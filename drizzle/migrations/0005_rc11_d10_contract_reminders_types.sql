ALTER TABLE public.contract_reminders DROP CONSTRAINT IF EXISTS contract_reminders_reminder_type_check;
ALTER TABLE public.contract_reminders ADD CONSTRAINT contract_reminders_reminder_type_check CHECK (
  reminder_type IN ('anniversary','renewal','expiry','post_incubation_transition')
  OR reminder_type ~ '^anniversary_[0-9]+y$'
  OR reminder_type ~ '^biennial_review_[0-9]+y$'
  OR reminder_type ~ '^renewal_notice_[0-9]{4}-[0-9]{2}-[0-9]{2}$'
);