import { describe, expect, it } from 'vitest';
import { canSeeAdminTab } from './adminTabAccess';

describe('RC12 admin navigation permissions', () => {
  const admin = { isAdmin: true, isConsultor: false, isBackoffice: false };
  const consultant = { isAdmin: false, isConsultor: true, isBackoffice: false };
  const backoffice = { isAdmin: false, isConsultor: false, isBackoffice: true };
  it('registration controls are admin-only', () => {
    expect(canSeeAdminTab('enrollment', admin)).toBe(true);
    expect(canSeeAdminTab('enrollment', consultant)).toBe(false);
    expect(canSeeAdminTab('enrollment', backoffice)).toBe(false);
  });
  it('backoffice operators and admins can manage contracts and spaces', () => {
    expect(canSeeAdminTab('backoffice', admin)).toBe(true);
    expect(canSeeAdminTab('backoffice', backoffice)).toBe(true);
    expect(canSeeAdminTab('backoffice', consultant)).toBe(false);
  });
  it('analytics remains available to consultants but not backoffice', () => {
    expect(canSeeAdminTab('analytics', consultant)).toBe(true);
    expect(canSeeAdminTab('analytics', backoffice)).toBe(false);
  });
});