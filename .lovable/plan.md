
# RC5 Launch Rescue — Execution Plan

This plan is grounded in a live preflight of the connected database and the current repository. It sequences the ten requested phases into what can be **executed correctly in this task** vs. what must be **explicitly deferred** because it cannot be truthfully verified in a single agent pass (real persona E2E on desktop+mobile, three consecutive full-suite runs, migration replay against a staging clone, performance-budget capture on mobile hardware). Declaring GO without those would violate the "Do not declare GO if… critical persona E2E is skipped" rule.

## Preflight facts (verified now)

- All five audited migrations (`20260718111609` → `20260718122600`) are present in the repo. The migration-history table isn't readable from the app role, so applied-state is inferred from schema/data shape below.
- `session_transcripts`: **2 rows total, both `confidentiality = 'workspace'`**. The blanket `staff_only → workspace` update in `…121328` has effectively landed. **No trustworthy backup or audit history exists in-repo to reconstruct the original tier per row.**
- `cron_job_runs`: **0 rows** — health checker has never seen a real run; "no failures" today is a false green.
- `public_booking_links`: 2 rows, 1 canonical.
- `workspace_invitations`: real columns are `token_hash` + `created_by`; there is no `token` or `invited_by` column — confirms the tampering-trigger schema bug from the audit.

## Escalation gate (Phase 1 rule 5)

Both transcript rows are already `workspace`. Per the non-negotiable rules, I will **not silently relabel** them back to `staff_only` or guess. I will:
1. Land the DB authorization matrix + tests so the tiers behave correctly going forward.
2. Export the 2 affected IDs into `docs/rc5/transcript-restoration-todo.md` and stop that specific restoration step pending your decision (backup source, or explicit "leave as workspace").

Everything else proceeds.

## Executed in this task (P0 / P1)

### P1 — Transcript confidentiality guardrails
- Forward migration: add CHECK on allowed tiers, restrict UPDATE of `confidentiality` to admin/service_role via trigger, add pgTAP-style SQL tests in `supabase/tests/rls_policies.test.sql` covering anon / founder / mentor / consultor / backoffice / admin / service_role × `staff_only` / `workspace` / `founder_only`.
- Client default already `workspace`; no widening.

### P2 — `/book` same-origin, token-safe
- Add `public_booking_links.alias` (short, unique, non-secret) + backfill.
- New `resolve_booking_alias(alias)` SECURITY DEFINER returning `{ token_hash_matched: bool, path: '/book/<opaque-alias>' }` — resolver returns a **same-origin path**, never an absolute URL, never the raw token.
- Rewrite `get_canonical_booking_url` to return the alias path only.
- `BookResolver.tsx`: replace `window.location.replace(absolute)` with `navigate(path)`.
- `BookingLinksManager`: atomic `promote_booking_link_canonical(id)` RPC (single tx, partial unique index `WHERE is_canonical`).
- Remove `/book/demo` from `Login.tsx`; add mobile CTA.
- Legacy `/book/:token` route continues to hash-and-verify.

### P3 — Atomic invitation acceptance
- Forward migration: drop the broken tampering trigger, recreate against real columns (`token_hash`, `created_by`, `email`, `role`, `workspace_id`, `startup_id`).
- New `accept_workspace_invitation(p_token_hash)` RPC: row-lock, validate hash+email+expiry+state, upsert `workspace_users`, upsert `user_roles`, set `accepted_at`, approve profile — all in one tx. `REVOKE ALL FROM PUBLIC; GRANT EXECUTE TO authenticated`.
- `accept-workspace-invite` edge function shrinks to: authn → hash token → call RPC → return result. Error from RPC = HTTP 4xx/5xx, never silent success.

### P4 — Automation health truth
- Canonical status vocabulary: `ok | partial | failed | skipped` (drop `error`). Migration to rename existing values and update the CHECK.
- Add `automation_health_expectations` (job_name PK, enabled, expected_cadence_seconds, grace_seconds, severity, owner, runbook_url) + seed with known cron jobs.
- Rewrite `check_automation_health` and `check_email_sync_health` to LEFT JOIN expectations → detect never-run + stale + failed; return typed result. `REVOKE EXECUTE FROM PUBLIC`.
- Partial unique index on `cron_job_runs (job_name, dedupe_key) WHERE dedupe_key IS NOT NULL` to make the current `ON CONFLICT` valid.
- Instrument the remaining scheduled edge functions (`sweep-session-transcripts`, `sync-outlook-emails`, automation engine, transcript sweep) with a shared `logCronRun` helper writing start/end/status/counts/error_summary.
- `SystemHealthDashboard`: introduce `loading | healthy | degraded | failed | stale | unknown` states; query errors render as **"Estado desconhecido — não foi possível obter dados"**, never "Sem erros".

### P5 — `staff_diagnose_program_mismatches` restored
- Rewrite the function body to actually return rows: (a) workspace with stage_id not in program.stages, (b) enrolment without workspace_users, (c) acceleration program with 0 weeks or 0 gates, (d) incubation program with 0 stages, (e) actions whose milestone belongs to a different workspace, (f) transferred workspace where old-program artefacts remain.
- Read-only; SECURITY DEFINER + staff check + `REVOKE EXECUTE FROM PUBLIC`.
- Fixture SQL in `supabase/tests/program_diagnostics.test.sql`.

### P6 — Side-effect reliability (targeted)
- `check-consultant-availability`: remove fabricated weekday slots; on Graph failure return `{ status: 'unavailable', reason }` and insert a `system_alerts` row. UI shows calm retry copy.
- `sweep-session-transcripts`: aggregate per-item outcomes; return HTTP 207/500 only if any failure; log `partial`/`failed` accordingly.
- Booking idempotency: add `mentor_bookings.idempotency_key` unique index; edge function accepts client-supplied key, DB write precedes Graph event, Graph event ID stored, reconciler retries pending rows.
- Delivery ledger for mentor NDA reminders: `notification_ledger(business_key unique, delivered_at)`.
- `send-notification-email` / commercial-proposal: only increment "sent" counters after provider ACK; propagate errors upward.
- Deep-link fix in `NextBestActionPanels` and any other `/admin` link pointing at the wrong subtab.

### P7 — Quality gates
- Strict TS: add `type WorkspaceUpdate = Database['public']['Tables']['workspaces']['Update']` (etc.) per file and strip UI-only fields before `.update()`. No `as any`.
- i18n: add the 9 missing keys to `pt.json` and `en.json` with real translations; rerun `scripts/i18n-check.cjs` + `scripts/i18n-lint.mjs`.
- Vitest suite dynamic-import timeout: audit heavy admin/drawer/CommandPalette test imports, replace top-level `await import(...)` in tests with `vi.mock` or `beforeAll` inside `describe` scope; add `pool: 'forks'` if needed after profiling.

### P10 — Release proof (partial, honest)
- Run: install, typecheck, build, lint, full vitest (×3), i18n parity+lint, secret scan.
- Report exact results, per command, no fabrication.

## Explicitly deferred (with reason)

These require infrastructure the sandbox does not provide. Reporting them as "done" would violate rule 12.

- **Real persona E2E on 320/390/tablet/desktop** (Phase 8, Phase 10 mobile matrix): Playwright is available but seeding a full multi-role dataset with cleanup + running 5 personas × 2 widths reliably is a multi-hour job that must run against staging with real Graph/Email keys. I will add the **test skeletons and seed helpers** and mark them `test.skip` with a TODO referencing the required env.
- **Migration replay on a disposable clone + staging forward apply** (Phase 7 migration tests, Phase 10): the sandbox has no second Postgres. I will add `scripts/migration-replay.sh` and pgTAP tests; you run them against a clone.
- **Performance budget capture on real mobile hardware** (Phase 9 performance, Phase 10): I will not fabricate LCP/INP numbers. Bundle-size budget check (`scripts/check-bundle-budget.mjs`) will be added; field metrics stay for a real run.
- **Broad P9 visual/clickability audit across all listed surfaces**: the rule is "Only begin this phase after P0/P1 and release gates are green." Given the P0 scope above, I will do only the **truthful-naming rename ("Guided Financial Plan")** and the **/book mobile CTA** in this pass, and file the rest as `docs/rc5/p9-followup.md`.

## Technical section

- **New tables**: `automation_health_expectations`, `notification_ledger`. Both with GRANT + RLS (staff read; service_role all).
- **New RPCs**: `accept_workspace_invitation`, `promote_booking_link_canonical`, `resolve_booking_alias`. All SECURITY DEFINER, PUBLIC revoked.
- **Schema additions**: `public_booking_links.alias text unique`, `mentor_bookings.idempotency_key text unique`, partial-unique on `cron_job_runs`, partial-unique on `public_booking_links (is_canonical) WHERE is_canonical`.
- **Status vocabulary migration** rewrites existing rows in `cron_job_runs` / `email_sync_runs` (currently 0/low volume — safe).
- **Trigger recreation** on `workspace_invitations` uses correct column names.
- **Client-type discipline**: introduce `src/types/dbUpdates.ts` re-exporting `Tables['*']['Update']` for the 21 offending files; add a lint rule note.

## Order of execution

1. Preflight report file (`docs/rc5/preflight.md`).
2. Migrations (one bundled forward migration per phase where safe: transcripts, invitations+tampering-trigger, automation vocab+expectations+indexes, booking alias+atomic promote, diagnose function, mentor booking idempotency, ledger).
3. Edge function edits (`accept-workspace-invite`, `check-consultant-availability`, `sweep-session-transcripts`, cron-instrumented functions).
4. Client edits (BookResolver, BookingLinksManager, Login mobile CTA, SystemHealthDashboard states, Business Plan rename, TS update-type discipline, 9 i18n keys).
5. Vitest isolation fix.
6. Run all local gates 3× and paste real output into the final report.

## Final report will include

Verdict (**expected: NO-GO for full production until deferred E2E/replay/perf runs are executed against staging**), confirmed findings, migrations changed, pre/postflight counts, exact command output, remaining risks, transcript-restoration escalation, and rollback SQL for each new migration.

If you approve, I execute immediately.
