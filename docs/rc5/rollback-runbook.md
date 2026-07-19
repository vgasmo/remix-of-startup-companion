# RC5 Rollback Runbook

**Trigger criteria (any one):**
- Production smoke step fails and cannot be recovered within 15 minutes.
- `system_alerts` inserts more than 3 rows in a 5-minute window post-promote.
- Any RLS regression report (rows visible to unauthorised persona).
- Duplicate side-effect observed (double booking, double email) that ledger did not skip.

## Fast-path (feature revert)

Most RC5 changes are additive (new RPCs, new tables, new triggers). Prefer disabling behaviour over dropping schema:

1. **Availability fail-closed** — set feature flag `public_booking_fail_closed` to `false` in `feature_flags`. Edge function reads the flag and falls back to the prior slot generator only when flag is off. (If the flag is not present, the fail-closed path is the default; there is no way to expose fabricated slots.)
2. **Notification ledger** — the ledger is fail-open on DB errors *for the send* but fail-closed on the *skip* path. To bypass, set `LEDGER_ENFORCE=false` in the affected edge function's env. This does **not** delete ledger rows.
3. **Canonical booking resolver** — `resolve_canonical_booking_token()` returns `null` on any anomaly; the client already handles this. To force the pre-RC5 behaviour, deploy the prior `BookResolver.tsx` — the RPC stays in place.
4. **Automation health 6-state UI** — revert `src/pages/admin/SystemHealthDashboard.tsx` to the prior commit; the registry table stays.

## Schema rollback (only if fast-path insufficient)

Schema changes in RC5 are **all additive** (new columns with defaults, new tables, new RPCs, new triggers, new indexes). No destructive rewrite. Rollback is column/table drops, in reverse timestamp order:

```sql
-- Reverse order of 20260718–20260719 migrations. Run only inside a maintenance window.
-- Each block is idempotent (IF EXISTS).

DROP TRIGGER IF EXISTS workspace_invitations_role_tampering_guard ON public.workspace_invitations;
DROP FUNCTION IF EXISTS public.workspace_invitations_role_tampering_guard();

DROP FUNCTION IF EXISTS public.accept_workspace_invitation(text);
DROP FUNCTION IF EXISTS public.promote_booking_link_canonical(uuid);
DROP FUNCTION IF EXISTS public.resolve_canonical_booking_token(text);
DROP FUNCTION IF EXISTS public.check_automation_health();
DROP FUNCTION IF EXISTS public.staff_diagnose_program_mismatches();
DROP FUNCTION IF EXISTS public.create_mentor_booking_idempotent(...);

DROP TABLE IF EXISTS public.notification_ledger;
DROP TABLE IF EXISTS public.transcript_containment_audit;
DROP TABLE IF EXISTS public.automation_health_expectations;
DROP TABLE IF EXISTS public.cron_job_runs;

ALTER TABLE public.session_transcripts
  DROP COLUMN IF EXISTS pending_confidentiality_review,
  DROP COLUMN IF EXISTS contained_at;

ALTER TABLE public.mentor_bookings
  DROP COLUMN IF EXISTS idempotency_key;

ALTER TABLE public.communication_log
  DROP COLUMN IF EXISTS archived_at;

ALTER TABLE public.workspace_invitations
  -- role column type unchanged; nothing to revert.
;
```

**Data safety:** the transcript containment migration is forward-only and refuses to auto-revert (`pending_confidentiality_review=true` rows require human reclassification). If rollback is required, capture the audit table content first — do **not** simply drop it.

## Post-rollback verification

1. `bunx tsgo -p tsconfig.typecheck.json --noEmit` — exit 0 on the reverted codebase.
2. Re-run smoke steps 1–8 from `docs/rc5/release-checklist.md`.
3. Confirm `system_alerts` insert rate returns to baseline (< 1 / hour).
4. Write an incident postmortem referencing this runbook and the trigger criterion.

## Never do

- Never delete `transcript_containment_audit` rows — they are the record of the containment decision.
- Never revoke `service_role` grants during rollback — edge functions will 500.
- Never drop `user_roles` or `has_role` — every RLS policy depends on them.
- Never restore from a pre-RC5 backup without capturing the delta of new user-created data first.
