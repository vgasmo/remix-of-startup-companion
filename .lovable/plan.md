
# v4.0 Integrity Closure — Plan (Product Truth only)

Scope is bounded by the "DO NOT TOUCH" list. Release Wrapper items (`.env`, lockfiles, CI pins, GO docs) are enumerated at the end as a separate handoff — no wrapper files will be edited in this batch.

---

## A. Risk assessment & frozen surfaces

Sensitive surfaces touched (read/tested only, never re-architected):
- `auth/*`, route guards, `useAuth`, `RequireAuth` — read-only.
- `useWorkspaces` active-only default & per-user cache keys — read-only, guarded by a new regression test.
- `startup_contracts` (canonical) / `public.contracts` (legacy inert) — no schema change; a runtime guard test asserts zero reads/writes to `public.contracts`.
- V9 minuta / V11 pricing / lifecycle / signature provider history — untouched; only assertion tests added.
- SharePoint archiver, ecosystem snapshots, imported HubSpot rows, `open_registration` default — untouched.
- RLS — no broad rewrites; new mentor RPC is `SECURITY DEFINER` following existing `has_role` / `has_workspace_access` patterns.

Top risks & mitigations:
1. **Claim regression** — the 20260703130240 replacement broadened auto-claim. Mitigation: revert semantics via new migration (keep function name/signature stable) + 6 SQL tests.
2. **Mentor RPC misuse** — Mitigation: RPC only allows the caller if they are (a) the mentor for `accept_mentor_request`, or (b) staff for `assign_mentor_request`. Legacy rows w/o `workspace_id` return a typed error; no silent success.
3. **Code-split visual regressions** — Mitigation: wrap only route boundaries with existing `lazyWithRetry`; no component-shape changes; screenshot diff per role.
4. **Type-fix drift** — Mitigation: use generated `Database` types verbatim; no `any`, no `ts-ignore`, no lint downgrade.

---

## B. Stream A — Safe claim containment

**Audit finding (confirmed via migrations grep):** `20260703130240_*.sql` replaced `public.claim_startup(...)` and dropped the imported-only guard, so a founder signing up with an email that happens to match a `pending` / `claimed` / `active` workspace could be auto-added.

**Fix:**
- New migration `restore_safe_claim_boundary.sql` that `CREATE OR REPLACE FUNCTION public.claim_startup(_startup_id uuid)` with the original invariants:
  - Only workspaces with `status = 'imported_unclaimed'` may auto-claim; requires `email_confirmed_at IS NOT NULL` on the caller **and** exact case-insensitive match against `workspaces.imported_founder_email` (or `startups.contact_email` fallback used historically).
  - For any other status, insert into `startup_claim_requests` with `status='pending'` and return `{ status: 'pending_review', request_id }`. Never insert into `workspace_users`, never flip workspace status.
  - Idempotent: if the caller is already an active member, return `{ status: 'already_member', workspace_id }` without side-effects.
  - Never add a second founder to an `active` workspace under any code path.
- Route protection on `/claim-startup` and its UI copy stay identical.

**SQL tests** (`supabase/tests/claim_startup.test.sql`, executed via `psql` in local supabase; added to `scripts/rls-regression-tests.sql` runner index):
1. imported_unclaimed + exact email → membership + status→claimed.
2. active workspace + matching email → no membership, one `startup_claim_requests` row.
3. pending workspace + matching email → pending review row, no membership.
4. claimed workspace + matching email → pending review row, no membership.
5. no match at all → typed error, no side-effect.
6. repeated invocation with same active membership → `already_member`, no duplicate row.

---

## C. Stream B — Atomic mentor operations

Two new `SECURITY DEFINER` RPCs, both wrapping their writes in a single implicit transaction (Postgres function = one tx) with `EXCEPTION WHEN OTHERS THEN RAISE` to guarantee rollback:

- `public.accept_mentor_request(_request_id uuid)`
  - Auth: `auth.uid()` must equal `mentor_requests.mentor_id`.
  - Preconditions: request `status='pending'` and `workspace_id IS NOT NULL` (else raise `legacy_request_needs_staff` typed error).
  - Steps: upsert `workspace_users(role='mentor_externo', active=true)` → update `mentor_requests` to `accepted_at=now(), status='accepted'`. Both or neither.

- `public.assign_mentor_request(_request_id uuid, _mentor_id uuid)`
  - Auth: `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'backoffice')`.
  - Same atomic pair + `assigned_by=auth.uid()`.
  - Legacy rows w/o `workspace_id` → typed error `legacy_request_needs_manual_workspace`; caller must pick a workspace.

Client wiring:
- `PendingMentorRequestsPanel.assignMentor` and the mentor accept action call the RPCs via `supabaseClient.rpc(...)`.
- Error surface uses `notify.error(t('mentor.assign.legacyNeedsWorkspace'))` etc. — no silent swallow.

Tests (`supabase/tests/mentor_rpc.test.sql`): success path (both rows written), unauthorized caller (no rows), missing `workspace_id` (typed error, no rows), duplicate accept (idempotent second call returns already_member), rollback (simulate constraint violation on second step → first step also absent).

---

## D. Stream C — Runtime & type integrity

- **Direct-client imports** (2 remaining): `src/pages/AdminContracts.tsx` and `src/hooks/backoffice/useBackofficeSidebarBadges.ts` → switch to `@/lib/supabaseClient`. `src/integrations/supabase/client.ts` is auto-generated and left alone; the comment-only reference is inert.
- **Conditional hooks**: sweep with `eslint --rule react-hooks/rules-of-hooks:error` (already active) — findings from the last CI log to be fixed in place by reordering hook calls above early returns, without behavior change.
- **ESLint plugin scope**: `eslint.config.js` — ensure `@typescript-eslint/eslint-plugin` is registered where any file uses `// eslint-disable-next-line @typescript-eslint/…` for a hook suppression, so suppressions reference a defined rule.
- **24 TS errors**: fix using exact generated payload types from `src/integrations/supabase/types.ts` (`Database['public']['Tables'][...]['Row']`); no `any`, no `ts-ignore`, no `tsconfig` relaxation. Concrete list resolved during Agent phase — current `tsgo` run shows clean at HEAD, so the 24 the brief cites will surface only after the migrations regenerate types; will be addressed then.

---

## E. Stream D — PT-PT & copy closure

- Add all missing keys reported by `i18n-lint` (16 EN + 18 PT keys visible above) with correct PT-PT (não Brasil).
- Manually re-audit and rewrite PT-PT in: `dataImport`, `enrollment`, `contractDetail`, `mentor`, `sessions`, `workspace`, `navigation`, `integrations`, `admin/backoffice` namespaces.
- Replace unsupported timing promises:
  - `pt.json → mentorsPage.responseTime` and `mentorsPage.expectedResponse`: use state-based copy ("Assim que um mentor aceitar, receberás notificação").
  - `ClaimStartup.tsx` and `FounderMentorRequestPanel.tsx` inline `defaultValue` fallbacks updated to observable wording.
- Bulk CTA copy: change to `"Criar {{count}} contratos em rascunho"` (PT) / `"Create {{count}} draft contracts"` (EN) in the bulk import screen.
- Localization test hardening (`src/test/i18n-runtime-gate.test.ts`): add a check that specific known-broken phrases (`"1-3 dias"`, `"2-3 dias"`, and a curated list of pt-BR markers e.g. `você`, `arquivo` in the affected namespaces) are absent from `pt.json`, so parity-green does not mask copy regressions.

---

## F. Stream E — Low-risk code splitting

- Build once, record baseline chunk sizes (raw + gzip) via `bun run build` + `du`/rollup stats.
- Wrap heavy route entries with existing `lazyWithRetry` where not already lazy:
  - `Admin`, `WorkspaceDetail`, `MyWorkspaces`, `AdminContracts`, `SystemSettings`.
  - Extract chart-heavy sub-panels (`CohortAnalytics`, `MentorImpactDashboard`, `OccupancyDashboard`) behind `React.lazy` within their parent routes.
  - PDF tooling (`src/lib/pdfRenderer.ts`) already dynamic-imported at call site — verify no eager import remains.
- Acceptance: **no route chunk > 500 KiB** without documented reason; report full before/after table.

---

## G. Verification matrix

Automated (must all pass; any failure = Product NO-GO):
- `bun run lint`
- `bunx tsgo -p tsconfig.typecheck.json`
- `bun run build`
- `bunx vitest run` (all unit + new mentor/claim unit stubs + i18n runtime gate)
- `node scripts/i18n-check.cjs`
- `node scripts/i18n-lint.mjs`
- `node scripts/secret-scan.cjs`
- SQL tests via local supabase (skipped-with-explicit-note only if local supabase unavailable in the sandbox; the SQL files still ship and run in CI).
- Static grep asserting zero `from ['"]@/integrations/supabase/client['"]` outside the generated file, and zero `.from('contracts')` runtime calls.

Browser (Playwright headless, viewports 1280×1800 and 390×844):
- Founder claim gate: imported match → success; active-email match → "pedido em revisão", no membership.
- Mentor request → mentor accept → workspace_users row appears; simulated failure leaves no partial state.
- Staff assignment through `PendingMentorRequestsPanel`.
- Bulk draft creation CTA copy.
- Manual signature lifecycle (mark-as-signed) with provider history preserved.
- Role isolation: founder cannot see admin-only routes; mentor cannot see other workspaces.
- Console/network error capture on each screen.

If any persona cannot be seated (session injection failure / missing seed), the report is **Product NO-GO** with the blocker named — no conditional GO.

---

## H. Deliverables order (Agent phase)

1. `supabase/migrations/*_restore_safe_claim_boundary.sql`
2. `supabase/migrations/*_atomic_mentor_rpcs.sql`
3. `supabase/tests/claim_startup.test.sql`, `supabase/tests/mentor_rpc.test.sql`
4. Client wiring: `AdminContracts.tsx`, `useBackofficeSidebarBadges.ts` import swap; mentor panels call RPCs.
5. Hook order fixes + TS payload fixes (post-migration types regen).
6. i18n keys added + PT-PT rewrite + timing-copy removal + bulk CTA + runtime gate test.
7. Route-level lazy loading pass + bundle diff.
8. Full automated verification + Playwright evidence.
9. Report.

---

## I. Release Wrapper handoff (report only — not in this batch)

Called out per `RELEASE_WRAPPER_MANUAL_STEPS.md` — no wrapper files edited here:
- `git rm --cached .env`, expand `.gitignore`, rotate publishable key.
- Delete `bun.lockb` and `package-lock.json`; keep `bun.lock`.
- Pin CI (`.github/workflows/ci.yml`) to Bun 1.2.0 end-to-end.
- Retire stale `PUBLISH_READY.md` / `RELEASE_AUDIT.md` snapshots and regenerate from this run's evidence.
- Define an isolated seeded Supabase project for CI browser tests (documented in `E2E_VERIFICATION_BLOCKER.md`).

---

Approve to switch to Agent mode and execute in the order above.
