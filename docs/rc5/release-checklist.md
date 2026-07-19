# RC5 Release Checklist

Every box must be ticked with linked evidence (command output, screenshot, or file path) before declaring **GO**.

## Code quality gates (repeatable locally)

- [ ] `bun install --frozen-lockfile` — clean install, no lockfile drift.
- [ ] `bunx tsgo -p tsconfig.typecheck.json --noEmit` — exit 0.
- [ ] `bun run lint` — exit 0.
- [ ] `bun run build` — exit 0, no warnings promoted to errors.
- [ ] `bunx vitest run` **three consecutive runs**, all green (25 files / 206 tests as of this cut).
- [ ] `node scripts/i18n-check.cjs` — PT/EN parity, exit 0.
- [ ] `node scripts/i18n-lint.mjs` — exit 0.
- [ ] `node scripts/secret-scan.cjs` — exit 0.
- [ ] `bun run release-check` — full pipeline, exit 0.

## Migration gates (staging)

- [ ] `scripts/rc5/migrate-fresh.mjs` — fresh replay on disposable Postgres, all pgTAP assertions pass.
- [ ] `scripts/rc5/migrate-forward.mjs` — forward apply on staging clone, safe preflight/postflight diff.
- [ ] `SECURITY DEFINER` ownership audit (`docs/rc5/queries/definer-audit.sql`) — every definer function is owned by `postgres`, has pinned `search_path`, and its EXECUTE grant is minimal.
- [ ] No historical migration references a missing column (verified by fresh replay).

## Behavioural gates (staging E2E)

- [ ] Anonymous `/book` — same-origin, no token leak (network trace + `document.URL` assertion).
- [ ] Anonymous `/book` — Graph outage returns fail-closed banner.
- [ ] Anonymous `/book` — booking retry produces exactly one DB row + one calendar event.
- [ ] Founder — invitation → workspace → long template → refresh → all fields persist.
- [ ] Founder — mobile 320 / 390 dialog scrolling proven.
- [ ] Consultant — portfolio, stage move, session complete, dashboard metrics update.
- [ ] Consultant — partial bulk-action failure retry converges.
- [ ] Mentor — NDA gate, availability, booking, conflict prevention.
- [ ] Admin — automation health surfaces UNKNOWN on forced query failure (not green).
- [ ] Admin — programme diagnostics returns seeded mismatch row.
- [ ] Admin — notification ledger shows `skipped_duplicate` on second submission.

## Failure-injection gates

- [ ] Graph 401 / 429 / 500 / timeout — UI truthful, DB consistent.
- [ ] Timeout after Graph accepted — reconciler resolves to single event.
- [ ] Email provider rejection — no ledger `delivered` stamp.
- [ ] Concurrent invitation acceptance — exactly one membership.
- [ ] Duplicate booking submission — exactly one `mentor_bookings` row.

## Ops readiness

- [ ] Rollback runbook rehearsed against staging (`docs/rc5/rollback-runbook.md`).
- [ ] All secrets present in the production secret manager (checklist in `docs/rc5/staging-runbook.md §0`).
- [ ] On-call rotation named for launch window.
- [ ] Production smoke checklist (below) prepared and time-boxed.

## Production smoke (manual, after promote)

1. Load `/book` in a private window on desktop → confirm same-origin, no token.
2. Load `/book` on iPhone 12 mini viewport (390×844) → confirm layout.
3. Force a Graph outage in a paired sandbox tenant (do NOT touch prod Graph) → confirm fail-closed banner in the sandbox.
4. Trigger `/admin` → System Health → confirm all expected jobs listed, none stuck at `never_run`.
5. Trigger `/admin` → Programme diagnostics → confirm zero rows (production should be clean).
6. Send one commercial proposal to a test address → confirm ledger row + `delivered` stamp.
7. Accept one invitation as a founder → confirm workspace opens on the intended route.
8. Verify no `system_alerts` row inserted during the smoke window.
