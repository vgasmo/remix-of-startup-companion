# Batch D — Monthly Founder Pulse (MUST STAY OFF) — STATUS: FIXED IN SOURCE / RUNTIME NOT PROVEN

Source: feature flag `founder_monthly_pulse`, `founder_pulse_cycles`,
`founder_pulse_responses`, `open-monthly-founder-pulse` edge function,
`notification_attempts`, `FounderPulseCard.tsx`.

## Landed in source (2026-07-22)

- Migration draft `docs/rc5/drafts/2026-07-22_batch-d_pulse_off_guard.sql`:
  - `public.is_feature_flag_enabled(text)` STABLE SECURITY DEFINER helper
    for use inside other definer functions.
  - `founder_monthly_pulse` flag is seeded OFF if absent.
  - `open_and_notify_monthly_founder_pulse_cycles`,
    `open_monthly_founder_pulse_cycles`, and `enqueue_pulse_notifications`
    all short-circuit when the flag is disabled (returns `skipped: flag_off`).
  - `enqueue_pulse_notifications` restricts eligibility to
    `wu.role='founder' AND wu.active AND profiles.account_status='approved'
    AND is_account_active(user_id)`.
  - Structural dedup: generated columns `pulse_cycle_id`,
    `pulse_workspace_id`, `pulse_respondent_id` on `notification_attempts`,
    plus partial unique index
    `notification_attempts_pulse_dedup_uidx(cycle,workspace,respondent,channel)
    WHERE event_key LIKE 'founder_pulse:%'`.
  - `notification_attempts_state_chk` CHECK constraint over
    `{queued, leased, delivered, failed_retryable, failed_terminal}`
    (installed NOT VALID so legacy rows never block the deploy).
  - `anonymize_stale_founder_pulse_responses()` blanks `respondent_id` +
    `free_text` on responses older than 18 months.
- `supabase/functions/open-monthly-founder-pulse/index.ts` reads the flag
  before invoking the RPC — belt and braces against RPC drift.
- pgTAP `supabase/tests/founder_pulse_off_state.test.sql` asserts 9
  invariants under flag OFF (zero cycles / attempts / notifications /
  emails, and structural artefacts exist).

## rc5:verify status

`scripts/rc5/verify.mjs` still finalises **NO-GO** because
`RC5_ALLOW_STAGING_TESTS !== 'true'` in this environment. That is the
correct status: the pgTAP suite for Batch D has not executed on staging,
and cron enablement / global flag ON is gated on DPO approval. Local
gates continue to pass.

## Runtime proofs — NOT PROVEN

- pgTAP `founder_pulse_off_state.test.sql` on staging.
- Cron dry-run with flag OFF confirming zero side effects (`cron_job_runs`
  should record `skipped: flag_off`).
- Delivery / retry probe with flag ON (staging canary only).

## Follow-ups

- pg_cron entry for `anonymize_stale_founder_pulse_responses()` after
  privacy review sign-off.
- Retire the client-side flag check in `FounderDashboard.tsx` once the
  server-side gate has been proven on staging (defence in depth in the
  meantime).
