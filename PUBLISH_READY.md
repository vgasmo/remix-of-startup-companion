# Publish Readiness Checklist

> **SUPERSEDED — historical document.** The authoritative release status is
> `docs/rc5/evidence-ledger.md` (verdict: **NO-GO** until the staging gates run).
> Do not treat the checkmarks below as a current release approval.


**Date:** 2026-01-15  
**Status:** ✅ READY TO PUBLISH

---

## 1. Build Verification

| Check | Status |
|-------|--------|
| TypeScript compiles | ✅ Pass |
| No console errors | ✅ Pass (1 minor warning - Badge ref, non-breaking) |
| Edge functions compile | ✅ Pass |
| RLS policies applied | ✅ 15 tables secured |

---

## 2. Commit Summary

### Security Fixes
- Added RLS policies to 15 publicly readable tables
- All business-critical data now requires authentication
- Staff-only tables (workflow_rules) properly restricted

### Features Verified
- CRM v1.1-1.3 complete and functional
- Founder dashboard with soft urgency tones
- Notification system with proper scoping
- AI recap feature gated by feature flag

### UI Polish
- Amber tones replace red for overdue items
- Consistent button and card styling
- Dark mode compatible colors

---

## 3. Environment Variables

### Required (Auto-configured by Lovable Cloud)
```
VITE_SUPABASE_URL=<auto>
VITE_SUPABASE_PUBLISHABLE_KEY=<auto>
VITE_SUPABASE_PROJECT_ID=<auto>
```

### Edge Function Secrets (Already Configured)
- `RESEND_API_KEY` - Email sending
- `SUPABASE_SERVICE_ROLE_KEY` - Background jobs
- `CRON_SECRET` - Scheduled tasks

### Optional (For Graph Integration)
- `MS_GRAPH_CLIENT_SECRET` - Microsoft Graph API

---

## 4. Graph API Setup (Optional)

If enabling email sync:

1. **Azure AD App Registration**
   - Create app with Mail.Read permissions (Application type)
   - Grant admin consent
   - Add consultant email domains to tenant

2. **FoundersBook Configuration**
   - Admin → Integrations → Microsoft Graph
   - Enter: Tenant ID, Client ID, Client Secret
   - Enable the integration

3. **Feature Flag**
   - Enable `crm_graph_email_sync` in Admin → Flags

---

## 5. Diagnostics

### CRM Diagnostics
Navigate to `/admin/crm-diagnostics` to run:
- Schema validation
- Permissions check
- Notification dry run
- Email sync dry run

### Health Check
All workspaces should show health scores. If missing:
- Run `recompute-health-scores` edge function
- Check `workspace_health_history` table

---

## 6. Post-Publish Monitoring

### First Hour
- [ ] Check edge function logs for errors
- [ ] Verify login flow works
- [ ] Spot-check workspace access

### First Day
- [ ] Monitor notification generation
- [ ] Check health alert emails
- [ ] Verify scheduled jobs run

### First Week
- [ ] Review activity logs
- [ ] Check for RLS-related empty states
- [ ] Gather user feedback

---

## 7. Rollback Notes

### If RLS Breaks Queries
```sql
-- Emergency: Temporarily allow authenticated reads
-- (Use only if critical, then fix properly)
CREATE POLICY "temp_authenticated_read"
ON public.<table_name> FOR SELECT
TO authenticated
USING (true);
```

### If UI Regression
- Revert to previous commit
- Check index.css and tailwind.config.ts

### If Edge Function Fails
- Check edge function logs
- Verify secrets are configured
- Check feature flags are enabled

---

## 8. Support Contact

For issues after publish:
- Check console logs in browser
- Check edge function logs in Lovable Cloud
- Review REGRESSION_CHECKLIST.md for test steps

---

## Approval

**Security Audit:** ✅ Passed (see SECURITY_REPORT.md)  
**Regression Testing:** ✅ Passed (see REGRESSION_CHECKLIST.md)  
**UI Polish:** ✅ Completed  

**Approved for Production:** ✅ YES
