# Batch E — Profiles / peer-boundary audit

_Last updated: 2026-07-22 · Owner: release-rescue agent · Scope: every `from('profiles')` call in `src/` and `supabase/functions/`._

Classification legend:

- **self** — caller reads/writes only `auth.uid()`'s own row. Safe to keep on `profiles`.
- **staff** — caller is guarded by `is_staff()` / staff-scoped RLS on the referring table. Safe to keep on `profiles` (but should still prefer `profiles_safe` where columns permit).
- **peer** — caller reads another user's profile row without a staff guard. MUST route through `profiles_safe`.

## `src/` — application code

| File | Line(s) | Persona | Columns | Verdict | Notes |
|---|---|---|---|---|---|
| `src/pages/UserProfile.tsx` | 31 | self | `*` on `auth.uid()` | **keep** | Own profile page. |
| `src/pages/Settings.tsx` | 156 | self | own row | **keep** | User settings. |
| `src/pages/PendingApproval.tsx` | 22 | self | own row | **keep** | Pending-approval screen. |
| `src/components/workspace/sessions/SessionDetailDialog.tsx` | 183 | self | `full_name,email` on `user.id` | **keep** | Reads own name/email to build organiser label for calendar invite. |
| `src/components/workspace/sessions/CreateSessionDialog.tsx` | 176 | self | own row | **keep** | Own row lookup. |
| `src/components/dashboard/FirstStepsCard.tsx` | 47, 63 | self | `dismissed_prompts` on `user.id` | **keep** | Reads/writes own dismissed-prompt state. |
| `src/components/founder/FounderWelcomeWizard.tsx` | 41, 55 | self | `has_seen_welcome_wizard` on `user.id` | **keep** | Own state. |
| `src/components/mentors/MentorImpactDashboard.tsx` | 48 | self | `mentor_monthly_target_hours` for `mentorId` | **keep** | `mentorId` is derived from the signed-in mentor. Column is not sensitive PII and not in `profiles_safe`. |
| `src/components/backoffice/OpsActionPrompts.tsx` | 72, 87 | self | own `dismissed_prompts` | **keep** | Own state. |
| `src/hooks/useHasSeenWelcomeWizard.ts` | 26 | self | own `has_seen_welcome_wizard` | **keep** | Own state. |
| `src/contexts/AuthContext.tsx` | 59 | self | own profile hydrate | **keep** | Auth bootstrap. |
| `src/hooks/useAdminData.ts` | 144, 223 | staff | admin panel | **keep** | Guarded by admin route + RLS. |
| `src/hooks/useAdminDashboardStats.ts` | 25 | staff | counts | **keep** | Admin dashboard. |
| `src/components/admin/*` (`AdminUsersManager`, `PendingApprovalsManager`, `BookingLinksManager`, `EnrollmentControlCenter`, `EcosystemPulseCard`) | multiple | staff | staff-scoped | **keep** | Admin surfaces. |
| `src/hooks/backoffice/useBackofficeSidebarBadges.ts` | 32 | staff | counts | **keep** | Backoffice surface. |
| `src/components/workspace/ChatTab.tsx` | 91, 115 | **peer** | `id,full_name,avatar_url` for message senders and workspace members | **FIXED → `profiles_safe`** | This turn. |
| `src/hooks/useConsultantNotes.ts` | 38 | staff | author profiles (with `email`) | **FIXED → `profiles_safe`** | Consultant notes are staff-only; `profiles_safe` still exposes `email` to staff via its `CASE` branch, and returns `NULL` for anyone who ever slips past RLS. Defence in depth. |

Total `src/` hits: 28. Peer hits before fix: **2** (`ChatTab.tsx`). Peer hits after fix: **0**.

## `supabase/functions/` — edge functions

All edge-function callers listed by `rg` (`send-workspace-invite`, `send-session-invite`, `send-notification-email`, `send-message-email-alert`, `send-commercial-proposal`, `sync-outlook-emails`, `sync-outlook-calendar`, `sync-graph-email-history`, `validate-booking-slot`, `import-teams-transcript`, `check-consultant-availability`, `check-mentor-nda-expiry`, `pandadoc-send-document`, `docusign-send-envelope`, `generate-mentor-impact-report`, `generate-progress-report-pdf`, `generate-invoices`, `generate-board-pack`, `export-cohort-health-pdf`, `automation-engine`, `public-book-first-contact`, `request-playbook`, `_shared/i18n.ts`, `_shared/founderAccount.ts`, `_shared/first-contact-routing.ts`) run under the **service-role key** (or an equivalent SECURITY DEFINER path). RLS does not fire; the view/table split is irrelevant for privacy. These reads are **out of scope** for peer-boundary hardening — they remain on `profiles`.

## Follow-ups (not in this batch)

- Extend `profiles_safe` to expose `mentor_monthly_target_hours` if we ever want the mentor dashboard to hydrate someone else's target. Today it is self-only, so keeping the direct read on `profiles` is correct.
- Consider a dedicated `profiles_staff_directory` view for the consultant-notes case if we later want staff-to-staff reads to also drop `email` unless explicitly needed.
