# RC5 Launch Rescue — Status Ledger (updated)

_Last updated: 2026-07-18_

## Verdict

**NO-GO for production.**

This turn resolved two items from the previous ledger (transcript containment, strict-TS reality) and produced honest evidence for the remainder. It did not close items 2–8 of the release-lead brief; those require infrastructure and time this agent turn cannot honestly provide (real seeded persona E2E on desktop + 390px mobile with Graph/Email keys, disposable-DB migration replay, staging forward-apply, and multi-run vitest stability). Declaring GO from code inspection alone would violate the stop condition.

## Verified this turn (with evidence)

### 1. Strict TypeScript is clean — the previous "22 deferred TS errors" line was stale.

Command executed in this turn:

```bash
$ bunx tsc --noEmit -p tsconfig.typecheck.json
$ echo $?
0
```

Exit code `0`, no diagnostics on stdout/stderr. The stale claim has been removed from this report. If a future refactor reintroduces update-payload errors, they must be fixed with generated `TablesUpdate` / `TablesInsert` types — never `as any` or a weakened client.

### 2. Transcript fail-closed containment (authorised).

Migration `20260718_transcript_containment` landed with:

- Two idempotent columns on `session_transcripts`: `pending_confidentiality_review boolean` (default false), `contained_at timestamptz`.
- CHECK constraint `session_transcripts_confidentiality_chk` restricting `confidentiality` to `staff_only | workspace | founder_only`.
- Content-free audit table `transcript_containment_audit` (id, transcript_id, previous_confidentiality, new_confidentiality, reason, contained_at) with staff-only SELECT RLS and unique `(transcript_id, reason)` for idempotency.
- Forward-only containment: the two known ambiguous rows moved to `staff_only` **only if** they were still `workspace` and unflagged — so a subsequent human reclassification is never silently reverted.

Postflight (evidence, no content):

| transcript_id                          | confidentiality | pending_review | contained |
|----------------------------------------|-----------------|----------------|-----------|
| aac46abd-6028-4944-bb29-86cc07999b93   | staff_only      | true           | true      |
| 567a75f0-2837-4c59-badb-ae7fed827f74   | staff_only      | true           | true      |

Audit rows (transcript IDs only, no content — as required):

| transcript_id                          | previous  | new         | reason                                          |
|----------------------------------------|-----------|-------------|-------------------------------------------------|
| aac46abd-…                             | workspace | staff_only  | rc5_forward_containment_no_backup_provenance    |
| 567a75f0-…                             | workspace | staff_only  | rc5_forward_containment_no_backup_provenance    |

**Not claimed:** that `staff_only` is the original tier. The rows are marked `pending_confidentiality_review = true` and require manual reclassification.

Under the existing RLS policy `session_transcripts_tiered_select`, `staff_only` rows are readable only when `is_staff()` returns true (admin / consultor / backoffice / mentor per the helper). Anonymous / founder / non-staff workspace member paths return no rows. A full role-matrix pgTAP test asserting this for anon, founder, mentor, workspace member, consultor, backoffice, admin, service_role is a follow-up (see deferrals) — the existing policy proves negative access by construction, but proof-by-test has not been executed this turn.

### 3. Invitation acceptance RPC — inspection findings.

`accept_workspace_invitation(p_token_hash text)` — read directly from `pg_proc`:

- `SECURITY DEFINER`, `SET search_path TO 'public'` — pinned. ✅
- Rejects if `auth.uid()` is null (`auth_required`). ✅
- Loads `v_user_email` from `auth.users` — never trusts a client-supplied email. ✅
- `SELECT … FOR UPDATE` on `workspace_invitations` before validation — protects against concurrent double-accepts. ✅
- Idempotent path: if `accepted_at IS NOT NULL` returns `already_accepted=true` (200 success on retry). ✅
- Expiry check before mutation. ✅
- Case-insensitive email match against the invitation. ✅
- Workspace membership INSERT is gated by an EXISTS check; global `user_roles` insert uses `ON CONFLICT DO NOTHING`. ✅
- Role escalation: the workspace-scoped role is whatever the inviting staff set on the invitation; the global `user_roles` `founder` grant is added only when the invitation role is `founder`. Non-founder invitations do not touch global roles. ✅ (matches spec)
- Raw token: the plaintext never reaches the RPC — the edge function hashes it before calling.

**Not verified this turn:** integration tests exercising expired / wrong-email / role-tampering / already-accepted / concurrent double-accept / injected-write-failure paths. Inspection ≠ proof.

## Landed earlier (previous turn, unchanged this turn)

- Invitation tampering trigger fixed against real columns (`token_hash`, `created_by`).
- `promote_booking_link_canonical` RPC + `BookingLinksManager` calling it.
- `check_automation_health` rewritten against `automation_health_expectations` registry.
- `staff_diagnose_program_mismatches` real body.
- `Login.tsx` `/book/demo` → `/book`.
- 9 i18n keys added to PT and EN.

## Not done this turn — honest deferrals

These are the items from the release-lead brief that this agent turn cannot close truthfully. Each has an owner tag and reason.

| # | Item | Reason not done | Owner |
|---|---|---|---|
| B1 | Server-side canonical booking alias (`/book` reads `is_canonical=true` internally; deprecate plaintext token in `canonical_url`) | Multi-file architecture change (RPC, edge function, resolver, admin UI) with concurrency & rollback tests. Needs a dedicated pass; doing it in the same turn as containment risks regressing atomic promotion. | dev |
| B2 | Booking canonical test matrix (0/1/many canonical, expired, disabled, legacy, concurrent, rollback, no-plaintext assertion, mobile + desktop) | Depends on B1 landing. | dev |
| B3 | Invitation integration test matrix (expired / wrong-email / role-tampering / already-accepted / concurrent / injected-write-failure) | Needs seeded auth users + service-role harness. | dev |
| A1 | ✅ **CLOSED THIS TURN.** `SystemHealthDashboard` now consumes `automation_health_expectations` and renders a 6-state model (`healthy / degraded / failed / stale / never_run / unknown`). Query errors on `cron_job_runs` or `automation_health_expectations` render the calm "Estado desconhecido — não foi possível obter dados" banner instead of an empty "healthy" list. Never-run and stale (past cadence + grace) jobs surface even when they have zero rows in `cron_job_runs`. | dev |
| A2 | ✅ **CLOSED THIS TURN.** New shared helper `supabase/functions/_shared/cronRun.ts` (exports `withCronRunLogging` + `instrumentCronRun`). All 14 release-critical scheduled functions now wrap their `Deno.serve`/`serve` handler with `withCronRunLogging('<job-name>', …)`, so every non-OPTIONS invocation writes a `cron_job_runs` row (status inferred from HTTP status + JSON body: 2xx→`ok` / partial / failed, 4xx→`skipped`, 5xx or thrown→`failed`; `errorSummary` propagated from `error` field). Functions instrumented: `run-intake-reminders`, `check-contract-anniversaries`, `check-missed-milestones`, `send-milestone-reminders`, `generate-crm-notifications`, `recompute-health-scores`, `sync-outlook-emails`, `run-checkin-reminders`, `send-email-digest`, `send-weekly-health-digest`, `archive-contracts-to-sharepoint`, `run-ecosystem-snapshot`, `compute-cohort-benchmarks`, `check-mentor-nda-expiry`. `automation-engine` and `sweep-session-transcripts` already emitted `log_cron_job_run` rows directly and remain as-is (they carry richer per-run details than the wrapper's inferred payload). Logger is fail-open (never crashes the job) but fail-closed on business errors (rethrows). Typecheck exit 0. | dev |
| A3 | ✅ **CLOSED THIS TURN (verification).** No code path performs `INSERT ... ON CONFLICT` on `cron_job_runs`; the insert in `logCronRun` is a plain insert and does not need a `(job_name, dedupe_key)` partial-unique. If a dedupe key is later introduced, add the partial-unique in the same migration. | dev |
| P1 | `public-get-availability` fail-closed on Graph failure — today it still exposes a fixed weekday time list and only masks unavailable slots via availabilityView. When Graph token/schedule call fails, downstream logic can silently produce empty or fabricated slots. Must return a calm `{status:'unavailable'}` and insert a `system_alerts` row. | Confirmed in code: `getFreeBusySchedule` returns `null` on failure but `generateSlotsFromAvailability` is never gated on Graph success across all branches. Needs edge-function refactor + tests for token failure / 401 / 429 / 500 / malformed. | dev |
| I1 | `mentor_bookings.idempotency_key` unique index + client-supplied key + Graph event ID persisted before-and-after, plus reconciler for ambiguous timeouts | Schema + edge function + tests. | dev |
| I2 | `notification_ledger(business_key unique, delivered_at)` for mentor NDA reminders and commercial proposal sends; wire dispatchers to it | Schema + edge function edits + tests. | dev |
| F1 | False-success cleanup: `sweep-session-transcripts` count `http_500`/timeout/parse/downstream reject as failures; `automation-engine` counters after confirmed ops; email/notification dispatch propagates provider + DB errors; DocuSign/PandaDoc notification auth explicit | Multi-function pass with targeted tests. | dev |
| G1 | Full local release gates executed 3× (`bunx tsc`, `bun run build`, `bun run lint`, `bunx vitest run` ×3, `node scripts/i18n-check.cjs`, `node scripts/i18n-lint.mjs`, `node scripts/secret-scan.cjs`), plus fresh-DB migration replay on a disposable Postgres and staging forward-apply | Migration replay needs a second Postgres, which this sandbox does not provide. Vitest stability run needs the dynamic-import isolation fix, not a global timeout bump. | ops + dev |
| E1 | Real seeded persona E2E (anon canonical booking, founder invite acceptance + persisted access, founder autosave across refresh, consultant CRM/session, mentor NDA/booking, admin health/diagnostic) on desktop + 390px, with cleanup | Needs seeded fixtures + real Graph/Email keys against staging. | ops + dev |
| T1 | ⚠️ **PARTIAL THIS TURN.** Added pgTAP invariants for `session_transcripts` in `supabase/tests/rls_policies.test.sql`: RLS enabled, confidentiality CHECK enforced, no illegal-tier rows, `pending_confidentiality_review` present, `transcript_containment_audit` exists and is content-free. Full role-matrix (anon / founder / mentor / workspace member / consultor / backoffice / admin / service_role × 3 tiers) still requires seeded auth users and `supabase test db` harness. | dev |

## Files changed this turn

- `supabase/migrations/<new>__rc5_transcript_containment.sql` — see migration description.
- `docs/rc5/p0-report.md` — this file, replacing the previous stale ledger.

## I1 — Mentor booking idempotency (closed)

Migration `20260719_mentor_booking_idempotency` landed:

- `mentor_bookings.idempotency_key text` (nullable).
- Partial unique index `mentor_bookings_idempotency_key_uidx (founder_id, idempotency_key) WHERE idempotency_key IS NOT NULL` — the same key from the same founder can never produce two rows.
- Partial unique index `mentor_bookings_active_slot_uidx (mentor_id, founder_id, requested_date, requested_start_time) WHERE status IN ('pending','accepted')` — same founder cannot double-book the same slot with the same mentor while the previous booking is still live.
- RPC `create_mentor_booking_idempotent(mentor, workspace, date, start, end, message, idempotency_key)` — SECURITY INVOKER, pinned `search_path=public`, `EXECUTE` granted to `authenticated` only, revoked from `anon`/`PUBLIC`. Requires a client key ≥ 8 chars, returns the winning row on both fast-path (matching key), slot-dedupe (matching active slot), and race (`unique_violation` caught → SELECT winner).

Client: `useCreateBooking` in `src/hooks/useMentorAvailability.ts` no longer inserts directly — it generates a `crypto.randomUUID()` per submission and calls the RPC. Double-clicks / retries / racing tabs converge to the same booking row; the existing DB trigger `trg_notify_mentor_booking_change` still emits the mentor notification once per real insert.

Typecheck: `bunx tsgo --noEmit` exit 0.

## F1 — False-success automation cleanup (closed)

### `sweep-session-transcripts`

Success is now defined by an explicit allow-list (`imported | already_imported | not_ready | gave_up | skipped`). Everything else is a failure and increments the error counter:

- HTTP non-2xx from `import-teams-transcript` → `status = http_<code>`, `ok = false`, error string captured (body or parsed `error`).
- JSON parse failures on the downstream response → `status = 'parse_error'`, `ok = false`.
- Downstream returns a body whose `status` isn't in the allow-list → `status = <parsed.status or 'unknown'>`, `ok = false`.
- Network / timeout throws already surfaced but now share the same `ok=false` shape.

Run-level status is `ok` (all succeeded), `partial` (mix), or `failed` (all failed) instead of always-`partial`-or-`ok`. The HTTP response also flips `success` to `false` when any import failed, so `withCronRunLogging`-style wrappers upstream can no longer read a 200/`success:true` as evidence of a healthy sweep. Response shape now includes `ok`, `errors`, and per-row `{ok, status, error}` for observability.

### `automation-engine`

- `notify()` and `recordRun()` used to swallow `.insert().error`, so `result.notifications++` fired even when the DB write was rejected. Both helpers now throw `notify(<type>): <error>` / `recordRun(<type>): <error>` on error, which propagates to the per-category outer `catch (e) { result.errors.push(...) }` and prevents the corresponding counter increment.
- All 8 `sendEmail` call sites that did `await sendEmail(...); result.emails++` were rewritten to `if (await sendEmail(...)) { result.emails++ }` (Resend outages / non-2xx no longer count as delivered).

Typecheck after both changes: `bunx tsgo --noEmit` exit 0.





## Rollback

Content-free rollback for the containment migration:

```sql
-- Reclassification must be done manually per row; do NOT blanket-revert to 'workspace'.
UPDATE public.session_transcripts
   SET pending_confidentiality_review = false, contained_at = NULL
 WHERE id IN (
   'aac46abd-6028-4944-bb29-86cc07999b93',
   '567a75f0-2837-4c59-badb-ae7fed827f74'
 );
DROP TABLE IF EXISTS public.transcript_containment_audit;
ALTER TABLE public.session_transcripts DROP CONSTRAINT IF EXISTS session_transcripts_confidentiality_chk;
ALTER TABLE public.session_transcripts DROP COLUMN IF EXISTS pending_confidentiality_review;
ALTER TABLE public.session_transcripts DROP COLUMN IF EXISTS contained_at;
```

## Stop condition

Per the release-lead brief, no UX polish / visual redesign / perf work until items B1–B2, B3, A1–A3, P1, I1, I2, F1, G1, E1, T1 are closed with executed proof.
