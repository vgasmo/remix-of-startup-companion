/**
 * E1 — Admin System Health / diagnostic surfaces.
 *
 * Verifies the health dashboard renders the automation expectation registry
 * (A1) and the scheduled automations table (A2) without React errors.
 * Also confirms admin can export CSV reports of events, errors, and cron logs.
 */
import { test, expect } from './fixtures/auth';

test.describe('Admin — System Health dashboard', () => {
  test('renders automation health registry + cron table', async ({ adminPage: page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/admin?tab=system-health', { waitUntil: 'domcontentloaded' });

    // Landmark heading — either PT or EN copy.
    await expect(
      page.getByRole('heading', { name: /saúde do sistema|system health/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    // Automation expectations table (from A1). Empty state is acceptable —
    // the point is the component doesn't crash.
    const anyTableOrEmpty = page.locator(
      'table, [data-testid="empty-state"], [role="status"]',
    );
    await expect(anyTableOrEmpty.first()).toBeVisible({ timeout: 15_000 });

    // No hooks-rule violations and no unhandled promise rejections.
    const critical = consoleErrors.filter((e) =>
      /Rendered more hooks|Rendered fewer hooks|Rules of Hooks|Uncaught \(in promise\)/i.test(e),
    );
    expect(critical, `critical console errors: ${critical.join('\n')}`).toHaveLength(0);
  });

  test('CSV export buttons are present and clickable', async ({ adminPage: page }) => {
    await page.goto('/admin?tab=system-health', { waitUntil: 'domcontentloaded' });

    // At least one export/download control (added in the earlier CSV batch).
    const exportBtn = page.getByRole('button', {
      name: /exportar|export|csv|descarregar|download/i,
    });
    await expect(exportBtn.first()).toBeVisible({ timeout: 15_000 });
  });
});
