import { describe, it, expect } from 'vitest';

describe('AdminDashboard module', () => {
  it('should import AdminDashboard without error', async () => {
    const mod = await import('@/components/dashboard/AdminDashboard');
    expect(mod.AdminDashboard).toBeDefined();
    // React.memo() returns an exotic object, not a plain function
    expect(typeof mod.AdminDashboard).toMatch(/function|object/);
  }, 30000);

  it('should import useAdminDashboardStats without error', async () => {
    const mod = await import('@/hooks/useAdminDashboardStats');
    expect(mod.useAdminDashboardStats).toBeDefined();
    expect(typeof mod.useAdminDashboardStats).toBe('function');
  });
});
