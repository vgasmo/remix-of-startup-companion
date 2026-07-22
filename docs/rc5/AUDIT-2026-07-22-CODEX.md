# RC5 Rescue — Codex Audit, 2026-07-22

Source: fresh inspection of the current repository and live DB (managed Supabase
`PG*` env). All prior RC5 status files (`final-close-out.md`,
`final-release-report.md`, `p0-report.md`, `hotfix-2026-07-21.md`) are treated
as **SUPERSEDED** where they contradict this document.

**Release verdict: NO-GO.** No mandatory P0/P1 batch is closed with executed
tests in this turn. Only Phase 0 hypothesis confirmations and a safe
checkpoint are recorded here.

Legend: `CONFIRMED` (repro or code inspection proves the defect), `REJECTED`
(inspection shows the defect is not present), `NOT PROVEN` (needs behavioral
run or credentials not available in this turn).

---

## H1. `log_completed_session_atomic` — **CONFIRMED**

Live DB definition dumped this turn (`/tmp/log_completed.sql`, 143 lines).

Defects observed in the current function body:

1. **Idempotent lookup runs before authentication of workspace access.** After
   the `auth.uid()` null check, the function immediately does
   `SELECT id FROM public.sessions WHERE command_id = p_command_id` and returns
   `{session_id, idempotent:true}` without any workspace or role check. Any
   authenticated user who guesses/observes a `command_id` learns the
   corresponding `session_id`. Evidence: lines 25–30 of the dumped body
   (immediately after the auth-null check, before `v_is_staff` /
   `v_is_workspace_member` / `v_is_consultor_assigned` are computed).

2. **Authorization admits any active workspace member.** `v_authorized :=
   v_is_staff OR v_is_workspace_member OR v_is_consultor_assigned OR
   (p_primary_mentor_id = v_actor AND v_is_mentor_of_workspace)`. Any founder
   or workspace member can log a completed session naming an arbitrary
   consultant/mentor as primary. Evidence: lines 74–79 of the dumped body.

3. **Attendee user_ids are not validated.** The `p_attendance` loop inserts
   `session_participants` for any UUID the caller provides, with no check that
   the UUID is a member of the workspace, a staff user, or a mentor with an
   accepted connection. Evidence: lines 100–115 of the dumped body.

4. **Mentor attribution is not persisted.** `public.sessions` has no
   `primary_mentor_id` column
   (`information_schema.columns … column_name ILIKE '%mentor%'` returns
   zero rows). The RPC accepts `p_primary_mentor_id` but the INSERT only sets
   `primary_consultant_id`. Mentor-led completed sessions therefore lose the
   mentor identity.

Impact: privilege escalation on attribution, potential PII leakage of
`session_id`, silent loss of mentor attribution. **P0.**

## H2. Batch A test harness invalid — **CONFIRMED**

- `scripts/rc5/batch-a-scenarios.sql` line 24 inserts
  `public.workspace_users(workspace_id, user_id, role, active, status)`, but
  `\d public.workspace_users` shows the table only has
  `id, workspace_id, user_id, role, created_at, active`. The `status` column
  does not exist. The DO block will error out on the first fixture insert.
- Line 126 inserts `mentor_connections(..., status)` with value `'active'`,
  but `mentor_connections_status_check` allows only
  `{pending, accepted, declined}`. Scenario 8b would violate the CHECK.
- `find src/test -iname '*rc5*' -o -iname '*batch*'` returns nothing —
  the Vitest wrappers previously referenced in `hotfix-2026-07-21.md`
  (`src/test/rc5-batch-*.test.ts`) do not exist in the repository.

Conclusion: earlier claims that "Batch A — 8 scenarios passed" cannot be
substantiated with the artefacts in this repo. Marked SUPERSEDED in the
ledger.

## H3. Simple contract signing — **NOT PROVEN**

`public.apply_contract_signature_atomic` exists in the live DB. Deeper
inspection (consent hardcoding, mutable-email command identity, out-of-txn
proof writes, work-queue column names, counter-signer caller) is not yet
executed in this turn. Follow-up query saved for next pass:
`psql -tAc "SELECT pg_get_functiondef('public.apply_contract_signature_atomic'::regprocedure)"`.

## H4. DocuSign duplicate claim window — **NOT PROVEN**

`claim_docusign_envelope` exists. Needs a concurrency probe:
`SELECT provider_envelope_id, command_id, claim_state FROM docusign_envelope_commands ORDER BY created_at DESC LIMIT 20;`
plus a two-worker race harness — deferred.

## H5. Founder Pulse server enforcement — **NOT PROVEN**

`FounderPulseCard.tsx` is UI-flagged via `founder_monthly_pulse` (verified in
`hotfix-2026-07-21.md`). Server-side enforcement of the flag inside
`open-monthly-founder-pulse` and RLS on
`founder_pulse_cycles/responses` was not re-verified this turn. Delivery
worker + consultant attribution not yet traced.

## H6. `ChatTab` peer-name query — **NOT PROVEN**

Grep target: `rg "from\('profiles'\)" src/components/messaging` and cross-check
against `profiles_safe`. Deferred to next pass.

## H7. Public first-contact booking Lisbon time / re-effects — **NOT PROVEN**

`supabase/functions/public-first-contact-booking` needs read of the
timezone-conversion helper and the `idempotent_reuse` branch to confirm no
Graph / email / notification is re-issued.

## H8. Mentor booking ↔ session sync — **NOT PROVEN**

`mentor_transition_booking` RPC needs re-inspection for cancellation and
completion branches updating `linked_session_id` and
`session_participants`.

## H9. CRM import ownership / partial failure — **NOT PROVEN**

Requires review of `crm_lead_import_batches` writer + rollbacks table
integration.

## H10. Programme publication atomicity — **NOT PROVEN**

Need to trace `publish_program_atomic` (or equivalent) and confirm no
metadata/KPI writes occur outside the child RPC. **Both programme modes
(Acceleration weeks/gates, Incubation playbooks) must be preserved** — flagged
as a constraint on any fix.

## H11. `save_financial_scenario_atomic` used by real Save-As-Scenario — **NOT PROVEN**

`rg save_financial_scenario_atomic src/` will decide. Deferred.

## H12. External gates status — **NOT PROVEN**

`lint`, `tsgo`, i18n strict, migration scanning, and Deno checks not re-run
this turn. Do not inherit any prior status.

---

## Phase 0 gates — **NOT RUN this turn**

`scripts/rc5/verify.mjs` requires `RC5_ALLOW_STAGING_TESTS=true` and staging
Supabase credentials, and it deletes the previous `docs/rc5/results.json`.
Running it against production is refused by the script (production ref
`apxzuslwhjujgrcsfzqw`). No staging ref is available in this session, so
Phase 0 stays unexecuted. **Next command** (documented, not run):

```bash
RC5_ALLOW_STAGING_TESTS=true \
STAGING_SUPABASE_URL=... STAGING_APP_URL=... \
node scripts/rc5/verify.mjs
```

---

## Next executable command

Fix H1 with a forward-only migration (draft SQL prepared at
`docs/rc5/drafts/2026-07-22_H1_log_completed_session_atomic.sql` — see
below), then rewrite `scripts/rc5/batch-a-scenarios.sql` to match the real
schema and create `src/test/rc5-batch-a.test.ts` as the canonical wrapper.
Only after those three artefacts are green may Batch A be re-closed in the
ledger.

The migration is not applied in this turn because Batch A must be closed
end-to-end (failing repro → fix → passing test) before any GO claim, and
the harness rewrite plus canonical test are still open work.
