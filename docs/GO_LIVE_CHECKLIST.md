# GO-LIVE CHECKLIST — 2026-03-04

## Architecture Overview

The launch uses a **two-phase approach** via the `open_registration` feature flag:

| Phase | Flag State | Behaviour |
|-------|-----------|-----------|
| **Prelaunch** | `OFF` (default) | Only emails/domains in `signup_allowlist` can register |
| **Live** | `ON` | Open registration; claim flow + pending approval still enforced |

### Security Layers (always active)

1. Account status defaults to `pending` → staff approves via PendingUsersManager
2. Workspace access gated by `has_active_workspace_access` (only `active`/`claimed`)
3. `imported_unclaimed` workspaces invisible to non-staff
4. Claim flow at `/claim-startup` for founder↔startup association

---

## PRE-FLIGHT (before sending the link)

- [ ] **CI green on `main`** — all jobs: lint-and-build, db-tests, test, e2e
- [ ] **Production domain in Auth redirect URLs**
  - Lovable Cloud → Auth Settings → Redirect URLs
  - Must include: `https://leiria-launchpad-pro.lovable.app`
- [ ] **Feature flag `open_registration` = OFF** (prelaunch mode)
- [ ] **Allowlist seeded** with founder emails from HubSpot import + `@startupleiria.com` domain
- [ ] **Imported workspaces** status = `imported_unclaimed`
- [ ] **Publish latest build** to production

---

## SMOKE TESTS (5 min each)

- [ ] **Staff login** → sees all workspaces + claim queue in Staff Cockpit
- [ ] **Founder signup (allowlisted email)** → pending approval → approve → claim → workspace visible
- [ ] **Founder signup (non-allowlisted email)** → blocked with "invite-only" message
- [ ] **Founder login** → only sees own workspace, not others'
- [ ] **Mentor login** → NDA gate → only assigned workspaces visible

---

## GO LIVE

- [ ] Send link to founders: `https://leiria-launchpad-pro.lovable.app`
- [ ] Monitor claim queue in **Staff Cockpit → Associações** tab
- [ ] Watch for errors in Lovable Cloud → Edge Function logs

---

## POST-LAUNCH (when ready for open registration)

- [ ] Set `open_registration` flag to **ON** via Admin → Feature Flags
- [ ] All new signups go through: signup → pending → approve → claim
- [ ] Optionally add more emails/domains to `signup_allowlist` for targeted invites

---

## ROLLBACK PROCEDURES

| Scenario | Action |
|----------|--------|
| **Critical bug** | Set `open_registration` OFF. Remove entries from `signup_allowlist` if needed. |
| **Data leak suspected** | Verify RLS — `imported_unclaimed` workspaces hidden from non-staff. Check `has_active_workspace_access`. |
| **Claim flow broken** | Staff can manually link users via Staff Cockpit → Associações tab. |
| **Need to block all signups** | Set `open_registration` OFF and clear `signup_allowlist` table. |

---

## Key Database Objects

| Object | Purpose |
|--------|---------|
| `feature_flags` row `open_registration` | Master toggle for prelaunch vs live |
| `signup_allowlist` table | Email/domain allowlist for prelaunch |
| `check_signup_allowed(p_email)` RPC | Server-side allowlist check (SECURITY DEFINER) |
| `startup_claim_requests` table | Claim queue for founder↔startup association |
| `claim_startup()` RPC | Auto-claim by email match or queue for staff review |

## RC12 release gate (supersedes earlier operational advice)

- [ ] Current canonical public origin: `https://fb.startupleiria.com`; verify actual hosted auth redirect settings without changing them to obtain a read.
- [ ] Do not enable open registration or change the allowlist as part of this patch. Email confirmation and staff approval remain required under their existing policies.
- [ ] PostgreSQL 17 fresh replay and all SQL suites pass; shimmed local replay alone does not certify managed services.
- [ ] All frontend, language, security and automation manifest tests pass; CI execution evidenced separately from local runs.
- [ ] Execute the fourteen read-only checks in `docs/rc12/operations-checks.sql`, save redacted results and triage every returned exception.
- [ ] Provision/verify all seven package buckets via native storage operations per `docs/runbooks/storage-buckets-bootstrap.md`; retain existing private visibility.
- [ ] Isolated real email/invitation, signature/activation recovery, import and Copilot flows read back successfully; no provider-success claim from mocks.
- [ ] Named release owner verifies fresh backup + checksum and rehearses restore in isolation, including bucket/object metadata and private access checks.
- [ ] Publish frontend only after release approval; edge deployment is not frontend publication.

### Weekly operations

The release owner (to be named by the organisation) reviews the fourteen checks and automation health weekly,
with daily follow-up for failures or overdue runs. Verify the latest ecosystem snapshot is completed, compare its
manifest checksums with privately retrieved objects, and verify signed-contract SharePoint archive outcomes.
A snapshot is an ecosystem export, not proof of a complete managed database/PITR backup.
Record verified restore evidence and retention supplied by the organisation; no new retention period is invented here.

### Failure response

- Health lookup failure or stale/missing evidence: mark UNKNOWN/blocked, never green/zero. Check catalogue and logs read-only before rerunning anything.
- Suspected exposure: restrict affected access through existing account/workspace controls; preserve audit trail and timestamps. Do not clear tables, remove allowlists or delete startups.
- Failed email/calendar/signature dispatch: inspect persisted delivery/idempotency state; ambiguous provider outcome requires reconciliation, not a blind resend.
- Pending activation: verify signature proof and unblocked workspace first; use established audited recovery commands, never direct status edits.
- Broken frontend: roll back the frontend artifact; do not roll back legal snapshots or rewrite signed terms. Additive database changes require reviewed recovery.
- Backup failure: pause the release and verify the last good restore; do not call an incomplete export a backup.
