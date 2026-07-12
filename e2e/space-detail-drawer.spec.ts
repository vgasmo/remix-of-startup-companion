import { test, expect } from './fixtures/auth';

/**
 * Regression: SpaceDetailDrawer must render without crashing when opened from
 * either the space list (card grid) or the interactive floor map.
 *
 * Guards against the "Rendered more hooks than during the previous render"
 * crash caused when `useBuildingOccupancy` (or any hook) was called after the
 * `if (!room) return null` early return inside SpaceDetailDrawer.
 */
test.describe('SpaceDetailDrawer — no-crash smoke', () => {
  test('opens from space list without React error', async ({ backofficePage: page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto('/admin?tab=backoffice&subtab=spaces&view=list');
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2_000);

    // First room card (list view uses role="button" cards keyed by room.name).
    const firstRoom = page.locator('[role="button"][aria-label]').first();
    const hasRoom = await firstRoom.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(!hasRoom, 'No rooms seeded — skipping list-open smoke');

    await firstRoom.click();

    // Drawer is a Sheet with role="dialog".
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    const hookCrash = [...consoleErrors, ...pageErrors].filter(e =>
      /Rendered more hooks|Rendered fewer hooks|Rules of Hooks/i.test(e),
    );
    expect(hookCrash, `Hook-order crash on list open:\n${hookCrash.join('\n')}`).toHaveLength(0);
  });

  test('opens from floor map without React error', async ({ backofficePage: page }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    const pageErrors: string[] = [];
    page.on('pageerror', err => pageErrors.push(err.message));

    await page.goto('/admin?tab=backoffice&subtab=spaces&view=map');
    await expect(page.locator('main')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(2_000);

    // Rooms on the SVG floor map are <g role="button"> nodes.
    const mapRoom = page.locator('svg g[role="button"]').first();
    const hasMapRoom = await mapRoom.isVisible({ timeout: 5_000 }).catch(() => false);
    test.skip(!hasMapRoom, 'No floor-map rooms seeded — skipping map-open smoke');

    await mapRoom.click();

    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5_000 });

    const hookCrash = [...consoleErrors, ...pageErrors].filter(e =>
      /Rendered more hooks|Rendered fewer hooks|Rules of Hooks/i.test(e),
    );
    expect(hookCrash, `Hook-order crash on map open:\n${hookCrash.join('\n')}`).toHaveLength(0);
  });
});
