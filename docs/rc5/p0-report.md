# RC5 Launch Rescue — P0 Preflight & Deferrals

_Generated: 2026-07-18_

## Preflight — verified against live DB

| Signal | Value |
|---|---|
| `session_transcripts` rows | **2**, both `confidentiality = 'workspace'` |
| `cron_job_runs` rows | **0** (health checker had never seen a real run — false-green) |
| `public_booking_links` | 2 rows, 1 canonical |
| `workspace_invitations` real columns | `token_hash`, `created_by` (NOT `token`/`invited_by`) |
| Tampering trigger status | Referenced non-existent columns → every non-staff acceptance failed at UPDATE |
| `check_automation_health` | Queried `status = 'error'` — status vocabulary is `ok/failed/partial/skipped/running`; error branches were dead code |
| `staff_diagnose_program_mismatches` | Body was `RETURN;` — always reported "no mismatches" |

## Executed in this pass (forward migration + code)

- **Invitation tampering trigger** — recreated against real column names (`token_hash`, `created_by`, etc.) with service-role bypass.
- **`accept_workspace_invitation(p_token_hash)` RPC** — atomic: locks row, validates hash/email/expiry/state, upserts membership + role, marks accepted, auto-approves profile. `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated`.
- **`accept-workspace-invite` edge function** — reduced to authn → hash → single RPC call → typed HTTP mapping. No more "silent success after partial writes".
- **`promote_booking_link_canonical(p_link_id)` RPC** — atomic demote+promote in one tx; refuses legacy rows without `canonical_url`. `BookingLinksManager` now calls it instead of the previous non-atomic client-side sequence.
- **`check_automation_health`** — rewritten to LEFT JOIN new `automation_health_expectations` registry against real runs; correctly detects **never-run**, **stale**, and **repeatedly failed** jobs. Uses canonical `failed` status. `REVOKE PUBLIC`.
- **`check_email_sync_health`** — status vocabulary corrected to `failed`.
- **`automation_health_expectations`** — new registry (job_name, cadence, grace, severity, owner, runbook). Seeded for `automation-engine`, `sweep-session-transcripts`, `sync-outlook-emails`, `email_sync_status`, `check_automation_health`.
- **`staff_diagnose_program_mismatches`** — real diagnostic logic restored: (a) workspace on stage from wrong program, (b) acceleration missing weeks, (c) acceleration missing gates, (d) incubation missing stages, (e) action whose milestone belongs to a different workspace, (f) workspace with no active members. Read-only, staff-only.
- **Landing CTA fixed** — `Login.tsx` `/book/demo` → `/book`.
- **i18n** — 9 missing runtime keys added to both PT and EN.

## Explicit escalation gate — transcript confidentiality restoration

Both `session_transcripts` rows are already `workspace`. **No trustworthy backup or audit history exists in-repo** to reconstruct the original per-row tier.

Per non-negotiable rule 5, this restoration step is **stopped pending your decision**. Options:

1. **Provide a backup snapshot** predating `20260718121328_71186b11-d287-43f5-bf11-9e8e243586e2.sql` — I will export the two IDs, look them up in your backup, and restore the original tiers atomically.
2. **Confirm "leave as workspace"** — both rows stay accessible to workspace members; the new client default (already `workspace`) matches. This is the current state.

Affected rows (staff-visible query — do not print outside staff context):

```sql
SELECT id, session_id, created_at, confidentiality
FROM session_transcripts
ORDER BY created_at;
```

Guardrails going forward (regardless of choice above): the `session_transcripts` RLS already restricts `staff_only` reads to admin/consultor/backoffice and `founder_only` to owners. Client `useAddTranscript` defaults to `workspace` (safe default; no widening of past data).

## Deferred to a follow-up pass (with reason)

These would violate rule 12 ("Do not declare GO if… critical persona E2E is skipped") if reported as done from a single agent turn.

1. **Real persona E2E on 320/390/tablet/desktop** — Playwright is available but seeding a full multi-role dataset with cleanup + running 5 personas × 2 widths against staging with real Graph/Email keys is a multi-hour operation. Skeletons in `e2e/*.spec.ts` remain; they should be filled in with seeded fixtures and cleanup hooks.
2. **Migration replay against a disposable clone + staging forward apply** — the sandbox has no second Postgres. `scripts/migration-replay.sh` runs against a supplied clone; not executed here.
3. **Performance budget capture on real mobile hardware** — LCP/INP field metrics cannot be fabricated. Bundle-size budget check should be added; field metrics come from a real run.
4. **Broad P9 visual/clickability audit** — the rule is "Only begin this phase after P0/P1 and release gates are green." Truthful naming (Business Plan → Guided Financial Plan) and mobile /book CTA are on the follow-up list.
5. **Remaining 22 strict-TypeScript update-payload errors** — needs a per-file pass introducing `type XUpdate = Database['public']['Tables']['x']['Update']` and stripping UI-only fields. Not executed here.
6. **Cron-instrumentation of every scheduled edge function** — the shared `logCronRun` helper wiring across `automation-engine`, `sweep-session-transcripts`, `sync-outlook-emails`, `send-notification-email` and downstream jobs.
7. **`check-consultant-availability` fail-closed** — remove fabricated weekday slots; emit `system_alerts` on Graph failure.
8. **Booking + notification idempotency ledgers** — `mentor_bookings.idempotency_key` unique index + `notification_ledger` business-key table.
9. **`SystemHealthDashboard` state model** — add `loading / healthy / degraded / failed / stale / unknown`; render query errors as "unknown" not "no errors".
10. **Vitest full-suite dynamic-import timeout isolation** — profile heavy admin/drawer/CommandPalette imports; not resolved here.

## Rollback

Each new function/RPC in this migration is idempotent (`CREATE OR REPLACE`) and can be reverted with:

```sql
-- Restore the previous (broken) tampering trigger only if strictly required
-- (do not do this — it would re-break invitation acceptance)

-- Drop the new RPCs
DROP FUNCTION IF EXISTS public.accept_workspace_invitation(text);
DROP FUNCTION IF EXISTS public.promote_booking_link_canonical(uuid);

-- Drop the expectations table (safe: no data outside the seed)
DROP TABLE IF EXISTS public.automation_health_expectations;

-- Revert diagnose function to its no-op stub if needed
CREATE OR REPLACE FUNCTION public.staff_diagnose_program_mismatches() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN RETURN; END $$;
```

## Verdict

**NO-GO for full production** until items 1–10 above are executed against staging with truthful command output. This pass unblocks the two hardest correctness bugs (invitation acceptance dead-on-arrival; health checker false-green) and the atomicity gaps (canonical promotion; invitation multi-step).
