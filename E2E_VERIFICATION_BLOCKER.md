# Browser E2E Verification — 6 Role Flows (Blocker Note)

## Status

**Blocked** inside the Lovable sandbox. The 6 role-based browser flows
(founder, founder-unclaimed, consultant, mentor, admin, backoffice +
public-booking) are wired in `e2e/*.spec.ts` and run via Playwright using
storage-state from `e2e/global-setup.ts`. They cannot be executed from
the Lovable agent for two reasons:

1. **No service-role key in the sandbox.** `scripts/e2e/seed-local-supabase.ts`
   needs `SUPABASE_SERVICE_ROLE_KEY` to provision the 6 deterministic
   accounts (`e2e-admin@startup-leiria.test`, etc.) with the correct roles
   and a claimed founder workspace. The Lovable agent only has the
   anon/publishable key.
2. **Browser tool is single-session.** Even if accounts existed in the
   live Cloud project, the Lovable browser tool's auth model expects a
   single user already signed in via the preview iframe; it cannot
   storage-swap between 6 personas the way Playwright can.

## How to unblock (one of three options)

### Option A — Run E2E locally (recommended)
```bash
# requires: docker, supabase CLI
supabase start
bash scripts/e2e/test-e2e.sh
```
This will: start local Supabase → seed 6 deterministic users →
build the app → run all Playwright specs in headed Chromium.

### Option B — Run E2E in CI against staging
Create the 6 accounts once in your staging Supabase project, then set
the following GitHub repo secrets and trigger the `e2e` job:
```
E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD
E2E_BACKOFFICE_EMAIL / E2E_BACKOFFICE_PASSWORD
E2E_CONSULTANT_EMAIL / E2E_CONSULTANT_PASSWORD
E2E_FOUNDER_EMAIL / E2E_FOUNDER_PASSWORD
E2E_FOUNDER_UNCLAIMED_EMAIL / E2E_FOUNDER_UNCLAIMED_PASSWORD
E2E_MENTOR_EMAIL / E2E_MENTOR_PASSWORD
```

### Option C — Provide one persona to the Lovable agent
If you log into the live preview as a specific role and tell the agent
"I'm logged in as the founder, test the founder flow", the browser tool
can then exercise that single flow. Repeat per role. This is manual but
unblocks ad-hoc verification.

## What was *not* tested in this audit run

| Flow | Spec file | Status |
|------|-----------|--------|
| Founder (claimed) | `e2e/founder-flow.spec.ts` | not executed |
| Consultant | `e2e/consultant-flow.spec.ts` | not executed |
| Mentor | `e2e/mentor-flow.spec.ts` | not executed |
| Admin | `e2e/admin-flow.spec.ts` | not executed |
| Backoffice | `e2e/backoffice-flow.spec.ts` | not executed |
| Public booking | covered in `e2e/permission-gate.spec.ts` | not executed |

The specs themselves are present, typecheck-clean, and reviewed.
Only the **runtime verification** is deferred to local/CI execution.
