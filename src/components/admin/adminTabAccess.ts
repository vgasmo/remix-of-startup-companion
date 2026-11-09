/**
 * Single source of truth for which /admin tabs each staff role can see.
 * Used by the Admin page (tab groups) and by the Mission Control directory, so the directory never
 * offers an entry that the page would silently ignore.
 */

// P0 fix: `enrollment` (EnrollmentControlCenter) exposes the global open_registration
// toggle and other admin-only controls. Consultores must not see this tab.
// P4: broaden to match RLS — backoffice/announcements/compliance/health/mentors/template-requests
// require is_admin() at the data layer, so hide their tabs from non-admin staff to avoid
// dead-end UI that renders empty or throws on mutations.
export const ADMIN_ONLY_TABS = new Set([
  'users',
  'data-quality',
  'system-health',
  'enrollment',
  'announcements',
  'compliance',
  'health',
  'mentors',
  'template-requests',
  // P2.9: every write on survey_* is is_admin() at the data layer.
  'surveys',
]);

// Tabs that require any staff role (admin, consultor, backoffice) but not
// admin-only. `backoffice` (contracts / pricing / spaces) is one of those:
// backoffice operators need it, admins too. Consultants stay locked out.
export const STAFF_ONLY_TABS = new Set(['backoffice']);

// P2.2: Programs/KPIs/Templates/Support materials are owned by admin and
// consultor; backoffice is operational (contracts/spaces) and must not see these.
// `analytics` reads action_items / milestones / sessions / kpi_values, which RLS only gives to
// admin, consultor and workspace members: for backoffice every total would be a silent 0.
export const CONSULTOR_TABS = new Set(['programs-setup', 'kpis', 'templates', 'support-materials', 'analytics']);

export interface AdminTabRoles {
  isAdmin: boolean;
  isBackoffice: boolean;
  isConsultor: boolean;
}

export function canSeeAdminTab(tab: string, roles: AdminTabRoles): boolean {
  if (ADMIN_ONLY_TABS.has(tab)) return roles.isAdmin;
  if (STAFF_ONLY_TABS.has(tab)) return roles.isAdmin || roles.isBackoffice;
  if (CONSULTOR_TABS.has(tab)) return roles.isAdmin || roles.isConsultor;
  return true;
}
