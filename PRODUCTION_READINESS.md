# Production Readiness Audit Report

> **SUPERSEDED — historical document.** The authoritative release status is
> `docs/rc5/evidence-ledger.md` (verdict: **NO-GO** until the staging gates run).
> Do not treat the checkmarks below as a current release approval.


**Audit Date**: 2026-01-09 (Updated)  
**Status**: ✅ Production Ready

---

## Executive Summary

This document summarizes the production readiness audit findings and implemented improvements. All critical (P0) and high-priority (P1) issues have been addressed.

---

## What Was Breaking After Publish

| # | Symptom | Root Cause | Fix |
|---|---------|------------|-----|
| 1 | SPA routes return 404 on page refresh | PWA `navigateFallback: null` + no host config | Set `navigateFallback: '/index.html'` with denylist + added netlify.toml/vercel.json/_redirects |
| 2 | PWA caches stale bundles after deploy | Missing `skipWaiting` + `clientsClaim` | Added both to workbox config for immediate updates |
| 3 | Dual lockfiles cause CI inconsistency | Both bun.lockb and package-lock.json present | Added CI warning; project uses npm |
| 4 | No way to verify build before publish | No smoke test | Added `scripts/smoke-test.sh` |
| 5 | Silent env failures in production | Env validation only logs | Added friendly error screen for critical missing vars |

---

## Files Changed

| File | Change Type | Why |
|------|-------------|-----|
| `vite.config.ts` | Modified | Fixed PWA + Vite alias for unified Supabase client |
| `tsconfig.typecheck.json` | Created | TypeScript paths for typecheck with alias |
| `src/lib/supabaseClient.ts` | Created | Production Supabase wrapper with detectSessionInUrl |
| `public/_redirects` | Created | Netlify SPA fallback |
| `netlify.toml` | Created | Netlify full config (build + redirects) |
| `vercel.json` | Created | Vercel SPA rewrite |
| `scripts/smoke-test.sh` | Created | Production smoke test script |
| `.github/workflows/ci.yml` | Modified | TypeScript check uses tsconfig.typecheck.json |
| `src/lib/env.ts` | Modified | Friendly error screen for missing env vars |
| `PRODUCTION_READINESS.md` | Modified | Updated with deployment checklist |

---

## Deployment Checklist

### Required Environment Variables

These must be set in your deployment platform:

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | ✅ Yes | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | ✅ Yes | Supabase anon/public key |
| `VITE_SUPABASE_PROJECT_ID` | ✅ Yes | Supabase project ID |
| `VITE_APP_URL` | ❌ No | Optional override for app URL |

### Host Configuration (SPA Fallback)

The repo now includes configs for common hosts:

| Host | Config File | Notes |
|------|-------------|-------|
| Netlify | `netlify.toml` + `public/_redirects` | Both included for maximum compatibility |
| Vercel | `vercel.json` | Rewrite rule for SPA |
| Lovable | Built-in | Lovable handles SPA routing automatically |
| Other (Nginx, Apache, etc.) | Manual | Configure to serve index.html for unknown routes |

### PWA/Service Worker Notes

- **Auto-update enabled**: New versions install immediately via `skipWaiting` + `clientsClaim`
- **Navigate fallback**: Routes to index.html (SPA behavior)
- **API requests NOT cached**: Supabase API, auth, storage, and functions are in denylist
- **Cache cleanup**: `cleanupOutdatedCaches: true` removes stale bundles after redeploy
- **Cache busting**: Vite hashes assets; SW updates when bundle changes

#### Verifying No Stale Bundles After Deploy

After a deploy, check for `ChunkLoadError`:
1. Open browser DevTools Console
2. Hard-refresh the page (Ctrl+Shift+R)
3. Check console for errors like `ChunkLoadError: Loading chunk X failed`
4. If errors appear, clear the SW cache: DevTools → Application → Storage → Clear site data

---

## Verification Checklist

Run these checks after deployment:

```bash
# Local verification (run before deploy)
npm run build
npm run preview
# In another terminal: ./scripts/smoke-test.sh http://localhost:4173

# Production verification (after deploy)
./scripts/smoke-test.sh https://your-production-url.com
```

### Manual Checks

- [ ] Build passes (`npm run build`)
- [ ] Preview passes (`npm run preview`)
- [ ] Auth login works
- [ ] Auth logout works
- [ ] Protected routes work on direct URL access
- [ ] Protected routes work on browser refresh
- [ ] Dashboard loads with data
- [ ] Create/update a KPI (write action)
- [ ] Edge function calls work (e.g., AI template coach)

---

## Security Architecture

### Access Control Model

The application implements a role-based access control (RBAC) system with workspace-scoped permissions:

| Role | Scope | Capabilities |
|------|-------|--------------|
| `admin` | Global | Full system access, manage programs, block workspaces |
| `consultor` | Global + Workspace | Access all workspaces, manage playbooks, view all data |
| `founder` | Workspace | Own startup's data, submit check-ins, manage team |
| `mentor_externo` | Workspace | Assigned workspaces only, session management |

### Row-Level Security (RLS) Patterns

All 108 tables have RLS enabled with RESTRICTIVE policies. Common patterns:

```sql
-- Workspace-scoped access (most tables)
has_workspace_access(workspace_id)

-- Write access for founders/staff/mentors
can_write_workspace(workspace_id)

-- Startup-scoped access (financial data)
is_startup_founder(startup_id)
can_manage_startup(startup_id)

-- Staff-only operations
is_staff()  -- admin OR consultor
is_admin()  -- admin only
```

### SECURITY DEFINER Functions

All security functions implement:
- `SET search_path TO 'public'` to prevent search_path attacks
- `auth.uid()` validation for user context
- Workspace/startup scoping for least privilege
- Boolean returns (no data leakage)

Key functions:
- `has_workspace_access(workspace_id)` - Core access check
- `can_write_workspace(workspace_id)` - Write permission check
- `is_staff()` - Staff role verification
- `can_manage_startup(startup_id)` - Startup-level access

### PII-Masking Views (SECURITY INVOKER)

Sensitive tables expose data through safe views that mask PII:

| View | Base Table | Masked Fields | Access Function |
|------|------------|---------------|-----------------|
| `profiles_safe` | `profiles` | email, phone | Owner or admin only |
| `startups_safe` | `startups` | nif, phone, address, main_contact_* | `can_see_startup_pii()` |
| `team_members_safe` | `team_members` | email, phone, linkedin_url | `can_see_team_member_pii()` |

### Edge Function Authentication Patterns

```typescript
// Category A - User-facing (JWT required)
const authResult = await requireUser(req, supabaseClient);
if ('error' in authResult) return authResult.error;

// Category B - Cron/System (CRON_SECRET header)
const cronResult = requireCronSecret(req);
if ('error' in cronResult) return cronResult.error;

// Category C - Webhooks (WEBHOOK_SECRET header)
const webhookResult = requireWebhookSecret(req);
if ('error' in webhookResult) return webhookResult.error;

// Category D - Public (token-based validation)
// Token validated against database hash, no auth header
```

### Secrets Management Rules

1. **Never commit secrets** - All sensitive values in environment variables
2. **Use Lovable Cloud secrets** - Stored encrypted, injected at runtime
3. **Rotate via dashboard** - No secret values in code or logs
4. **Separate secrets by function**:
   - `CRON_SECRET` - Scheduled job authentication
   - `WEBHOOK_SECRET` - External webhook validation
   - `RESEND_API_KEY` - Email delivery
   - Service role key - Backend-only, never exposed to client

### Audit Trail Integrity

These tables are effectively append-only (no UPDATE/DELETE for non-admins):
- `activity_log` - All user actions
- `email_log` - Delivery records
- `mentor_nda_acceptances` - Legal compliance

### Security Regression Tests

Run `scripts/rls-regression-tests.sql` to verify:
- Cross-workspace data isolation
- Private consultant notes protection
- Financial data (cap table, funding) isolation
- PII masking in safe views
- Audit log immutability

---

## Previous Audit Findings & Resolutions

---

## i18n Guide

### Current Languages

| Code | Language | File |
|------|----------|------|
| `en` | English | `src/i18n/locales/en.json` |
| `pt` | Portuguese | `src/i18n/locales/pt.json` |

### Adding a New Language

1. Create translation file: `src/i18n/locales/{code}.json`
2. Copy structure from `en.json`
3. Register in `src/i18n/index.ts`:

```typescript
import fr from './locales/fr.json';

i18n.init({
  resources: {
    en: { translation: en },
    pt: { translation: pt },
    fr: { translation: fr }, // New language
  },
  // ...
});
```

4. Add to `LanguageSelector.tsx`:

```typescript
const languages = [
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'pt', name: 'Português', flag: '🇵🇹' },
  { code: 'fr', name: 'Français', flag: '🇫🇷' }, // New
];
```

### Adding New Strings

1. Add key to both `en.json` and `pt.json`
2. Use in component:

```tsx
import { useTranslation } from 'react-i18next';

function MyComponent() {
  const { t } = useTranslation();
  return <h1>{t('mySection.myKey')}</h1>;
}
```

---

## Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| `src/lib/env.ts` | Created | Zod-based env validation |
| `src/main.tsx` | Modified | Added env validation on startup |
| `src/components/ui/ErrorBoundary.tsx` | Modified | Sanitized error display in production |
| `.env.example` | Modified | Improved documentation |
| `.github/workflows/ci.yml` | Modified | Added typecheck step |
| `supabase/functions/webhook-meeting-ingest/index.ts` | Modified | Sanitized error response |
| `supabase/functions/inbound-email-webhook/index.ts` | Modified | Sanitized error response |
| `PRODUCTION_READINESS.md` | Created | This document |

---

## Edge Function Categories

For reference, edge functions are categorized:

### Category A - User-facing (verify_jwt=true)
- `analyze-template`, `generate-template-coach`, `generate-investor-update`
- `sync-financial-kpis`, `generate-session-*`, `import-kpi-data`
- `transcribe-audio`, `dataroom-create-link`, `accept-mentor-nda`

### Category B - System/Cron (verify_jwt=false, require CRON_SECRET)
- `recompute-health-scores`, `recompute-workspace-alerts`
- `run-checkin-reminders`, `check-missed-milestones`
- `send-*` (email/notification functions)

### Category C - Webhooks (verify_jwt=false, require WEBHOOK_SECRET)
- `webhook-meeting-ingest`, `inbound-email-webhook`

### Category D - Public (verify_jwt=false, token-based)
- `get-shared-workspace`, `dataroom-get-by-token`, `calendar-feed`

---

## Contact

For questions about this audit, refer to the codebase documentation or the development team.
