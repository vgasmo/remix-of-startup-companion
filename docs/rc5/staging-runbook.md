# RC12 staging verification runbook

Use an isolated local/disposable stack or an authorised staging clone. Preview and published app share live data;
preview is not staging. Do not seed, clean up, invoke providers or run destructive suites against the shared app.

## Credentials and isolation

Local CI may obtain credentials from its disposable stack. Hosted Lovable Cloud service keys/passwords are not
available to the operator and must not be requested. Use authorised platform tools for hosted read-only checks.
For external staging, inject credentials only through the CI/secret manager; never paste them in chat or log them.
Provider tests require sandbox email/signature services and a dedicated test Graph mailbox/calendar (not yet supplied).
`RC5_ALLOW_STAGING_TESTS=true` is required for remote read-only automation reconciliation; existing seed/cleanup
preflights additionally enforce their own staging guard. Passing a guard is not authorisation to touch real data.

## Empty database reconstruction

Use PostgreSQL 17 and installed pgTAP. Run from project root with a new directory and **without** `RC5_REUSE=1`:

```bash
export RC5_PG_RUN_DIR=/tmp/rc12-fresh-verified
export RC5_PGTAP_SQL=/path/to/installed/pgtap--version.sql
bash scripts/rc5/local-pg-harness.sh
```

The harness creates a disposable Unix-socket-only database, replays `supabase/migrations`, and executes all
`supabase/tests/*.test.sql`. Nonzero exits, SQL errors, empty/missing suites and failed assertions block release.
The shim models auth/storage/cron/network interfaces; it does not deliver emails, validate hosted auth settings,
certify native bucket bootstrap or prove provider behaviour. Legacy dump default-grant emulation is not evidence
that a newly introduced table has proper explicit grants; review every new public table separately.
`RC5_EXTRA_MIGRATIONS` is additive and accepts explicit colon-separated paths; only use it for a not-yet-mirrored
candidate. Do not replay both a mirrored migration and its source. Never pass hosted database environment variables.

## Application and automation gates

```bash
bunx vitest run
node --test scripts/rc5/automation-manifest.test.mjs
bun run lint
node scripts/i18n-check.cjs
node scripts/i18n-lint.mjs
node scripts/secret-scan.cjs
```

The platform runs compilation automatically. CI separately runs the actual release build.
Run `node scripts/rc5/reconcile-automations.mjs` with injected isolated `STAGING_DATABASE_URL`.
It is read-only, fails closed, and compares exact schedules/targets/active state/health cadence.
Run the fourteen read-only SQL checks in `docs/rc12/operations-checks.sql` as an authorised operator.
Provision buckets through native tools before uploads; follow `docs/runbooks/storage-buckets-bootstrap.md`.

## Real flow acceptance

On isolated test accounts, preserve positive AND forbidden evidence for pending, suspended, founder, primary
consultant, assigned mentor with/without NDA, and admin. Drive each actual screen and confirm saved data reads back:

1. Invitation → verified email → correct login return target → intended workspace, exactly one membership.
2. Sandbox email failure/partial delivery → saved session remains; only verified recipients receive mail.
3. Signature → immutable terms → verified activation → pending recovery drains and retry cron disarms; duplicates do not repeat activation.
4. Import supported configuration → persisted startup/workspace link without duplication; denied configuration cannot inject job metadata.
5. Copilot real authenticated input → bounded response stream → second turn works without replay on timeout.
6. Archived milestone action is absent from operational overdue count; primary-assigned-only portfolio excludes historical membership.
7. Private Data Room and mentor notes enforce access and workspace containment, including suspended staff accounts.

Network mocks prove failure handling, not delivery. Record run identifiers and redacted screenshots; no tokens,
signer links, calendar attendee data or raw request URLs in evidence. If accounts/providers/isolated stack are absent,
leave these gates unverified; do not mark them passed by testing login or empty pages only.

## Cleanup and restore

Rollback transactional SQL fixtures automatically. Archive created test startups/workspaces using existing commands,
never delete real/imported data. Review cleanup scripts before execution; no production cleanup is permitted.
Restore backup manifests, checksums, private object metadata and access in isolation. Preserve audit history and
original legal timestamps. Use the release checklist and go-live weekly/failure procedures for handover.
