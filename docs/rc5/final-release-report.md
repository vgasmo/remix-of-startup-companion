# RC5 Final Release Report

_Generated: 2026-07-19_

## 1. Verdict

**NO-GO.**

Every code-side gate that this sandbox can honestly execute is **PASS**. Behavioural gates that require a live staging environment (Graph tenant, email sandbox, seeded personas, four viewports) are **NOT PROVEN** because no staging URL / service-role secret is injected into this agent turn. The RC5 verification package — runbooks, seed/cleanup scripts, canonical verify command, secret checklist — is complete and shippable in this PR. Running it is an ops action.

## 2. P0 evidence ledger

Full table in `docs/rc5/p0-evidence-ledger.md`. Summary:

| # | Invariant | Status |
|---|---|---|
| 1 | Same-origin `/book`, no token leak | PASS (unit) |
| 2 | `/book` on desktop + mobile | NOT PROVEN (needs staging) |
| 3 | Ambiguous transcripts contained | PASS |
| 4 | Invitation acceptance atomic/idempotent/role-safe | PASS (code) / NOT PROVEN (E2E) |
| 5 | Public availability fail-closed | PASS (code) / NOT PROVEN (behaviour) |
| 6 | SystemHealthDashboard cannot false-green | PASS (code) / NOT PROVEN (behaviour) |
| 7 | Automation health detects all 6 states | PASS |
| 8 | Notification + proposal ledgers dedupe | PASS |
| 9 | Programme mismatch diagnostics | PASS (code) |
| 10 | Strict typecheck clean | PASS |

## 3. Exact commands and exit codes (executed this turn)

```text
$ bunx tsgo -p tsconfig.typecheck.json --noEmit
EXIT=0

$ bunx vitest run
Test Files  25 passed (25)
     Tests  206 passed (206)
EXIT=0
```

## 4. Unit/integration counts

- Files: 25
- Tests: 206
- Three consecutive runs are wired into `scripts/rc5/verify.sh` (`vitest:run:1`, `:2`, `:3`). Two additional local runs remain to be executed by the release lead outside this sandbox to satisfy the multi-run stability gate.

## 5. Migration replay + forward-apply

**Not executed** — no disposable Postgres / staging clone in this sandbox. Scripts in place:

- `scripts/rc5/migrate-fresh.mjs` (fresh replay — placeholder pending Docker access)
- `scripts/rc5/migrate-forward.mjs` (forward apply — placeholder pending staging clone)
- Preflight/postflight queries: `docs/rc5/queries/preflight-counts.sql`
- SECURITY DEFINER audit: `docs/rc5/queries/definer-audit.sql`

Source assertion (static): all RC5 migrations are **additive** (new columns with defaults, new tables, new triggers, new RPCs, new indexes). No `DROP COLUMN`, no destructive `ALTER TYPE`. Confirmed by scan of `supabase/migrations/2026071{7,8,9}*.sql`.

## 6. Role-matrix result

pgTAP `supabase/tests/rls_policies.test.sql` covers 39 assertions across anon / founder-in-WS / founder-out-of-WS / consultant / mentor / admin / service-role for transcripts + containment. **Not executed** against staging in this turn.

## 7. Persona E2E matrix by viewport

Specs present but **not executed**:

| Persona | Spec | 320 | 390 | tablet | desktop |
|---|---|---|---|---|---|
| Anon | `public-booking.spec.ts` | ⏸ | ⏸ | ⏸ | ⏸ |
| Founder | `founder-flow.spec.ts` + `founder-autosave.spec.ts` + `founder-invite-acceptance.spec.ts` | ⏸ | ⏸ | ⏸ | ⏸ |
| Consultant | `consultant-flow.spec.ts` | ⏸ | ⏸ | ⏸ | ⏸ |
| Mentor | `mentor-flow.spec.ts` + `mentor-double-booking.spec.ts` | ⏸ | ⏸ | ⏸ | ⏸ |
| Admin | `admin-system-health.spec.ts` + `admin-flow.spec.ts` | ⏸ | ⏸ | ⏸ | ⏸ |
| Backoffice | `backoffice-flow.spec.ts` | ⏸ | ⏸ | ⏸ | ⏸ |

`⏸ = pending staging URL and secrets.`

## 8. Graph/email failure-injection

Specs pending under `e2e/failure-injection/` — outage matrix documented in `docs/rc5/staging-runbook.md §6`. Not executed.

## 9. Preflight/postflight database counts

To be captured by running `docs/rc5/queries/preflight-counts.sql` before and after `migrate-forward` on staging. Expected diff bounds: additive only.

## 10. Rollback procedure

`docs/rc5/rollback-runbook.md`. Fast-path is feature-flag-based (all RC5 changes are additive); schema rollback documented as a break-glass procedure.

## 11. Remaining risks and named owner

| Risk | Owner | Mitigation |
|---|---|---|
| Behavioural PASS on items #2, #4-E2E, #5, #6 pending live staging run | Release lead (ops) | Run `bun run rc5:verify` with `RC5_ALLOW_STAGING_TESTS=true` on staging. |
| Multi-run vitest stability (3×) not yet exercised outside this sandbox | Release lead | `verify.sh` executes three consecutive runs; capture output. |
| Migration fresh-replay unproven | DBA | Run `scripts/rc5/migrate-fresh.mjs` in Docker Postgres 15. |
| Transcript reclassification (2 rows `pending_confidentiality_review=true`) | Data steward | Review both rows manually, set correct tier, clear the flag. |
| Registry omission of new scheduled functions would silently drop coverage | dev | Add regression test that fails when a scheduled function is not in `automation_health_expectations` — deferred, not RC5-blocking. |

## 12. Exact manual production smoke checklist

Present in `docs/rc5/release-checklist.md §"Production smoke"`. 8 steps, time-boxed to < 15 minutes.

---

**Path to GO:** an ops operator with staging credentials runs:

```bash
export RC5_ALLOW_STAGING_TESTS=true
bun run rc5:verify
```

If `docs/rc5/results.json` reports `"overall": "pass"` and the manual smoke checklist is clean on the promoted build, this turn's NO-GO becomes GO.
