# Batch D — Monthly Founder Pulse (MUST STAY OFF) — FAILING REPRO

Source: feature flag `founder_monthly_pulse`, `founder_pulse_cycles`,
`founder_pulse_responses`, `open-monthly-founder-pulse` edge function,
`notification_attempts`, `FounderPulseCard.tsx`.

## Defects

1. Cycle creation and delivery not fully gated on server-side flag read
   — flag OFF must produce zero cycle rows, zero notification_attempts
   rows, zero emails.
2. Eligibility does not enforce active founder (`is_account_active` +
   role check).
3. No unique constraint on `(cycle_id, workspace_id, respondent_id,
   channel)` — dedup relies on application logic.
4. Assigned-consultant scope on responses is broader than intended.
5. Retry state machine incomplete: `claimed / delivered / failed /
   retry / terminal` not enforced by check constraint.
6. PT/EN email template not attributed to the assigned consultant; no
   safe Reply-To fallback for orphaned workspaces.
7. Response link token not single-use; booking CTA and help CTA not
   present.
8. Staff have no visibility of delivery/retry backlog.
9. No retention / anonymization job.
10. UI: no progressive disclosure, no draft autosave, no Remind Me
    Later, no help escape hatch.

## Required outcome (OFF-first)

- Flag guard at every server entry: cron scheduler, RPC
  `enqueue_pulse_notifications`, edge function, UI card.
- pgTAP asserts: flag OFF + trigger cron → zero cycles, zero attempts,
  zero notifications, zero email_log rows.
- Unique idx `(cycle_id, workspace_id, respondent_id, channel)`.
- `notification_attempts.state` check constraint.
- Retention: anonymize responses > 18 months.

## Runtime proofs — NOT PROVEN

Cron enablement + global flag ON require staging canary + DPO approval.

## Next action

Draft `docs/rc5/drafts/2026-07-22_batch-d_pulse_off_guard.sql` +
pgTAP `supabase/tests/founder_pulse_off_state.test.sql`.
