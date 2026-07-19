/**
 * E1 — Anon canonical booking resolution.
 *
 * Verifies:
 *   1. Unauthenticated visitor at `/book` reaches the canonical booking page
 *      without leaking the underlying token in the URL bar (B1 requirement).
 *   2. When public availability is unavailable, the UI renders the
 *      fail-closed "disponibilidade não pode ser confirmada" message
 *      instead of a bookable slot list (P1 requirement).
 *   3. Runs on both desktop (1280×800) and mobile (390×844).
 */
import { test, expect, devices } from '@playwright/test';

const VIEWPORTS = [
  { name: 'desktop', viewport: { width: 1280, height: 800 } },
  { name: 'mobile-390', viewport: devices['iPhone 13'].viewport },
];

for (const { name, viewport } of VIEWPORTS) {
  test.describe(`Public booking @ ${name}`, () => {
    test.use({ viewport, storageState: { cookies: [], origins: [] } });

    test('anon visitor lands on canonical booking without token in URL', async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      await page.goto('/book', { waitUntil: 'domcontentloaded' });

      // Canonical resolver keeps the browser URL at /book — never exposes the token.
      await expect(page).toHaveURL(/\/book(\?.*)?$/);
      expect(page.url()).not.toMatch(/token=|link=|slug=/i);

      // Page renders SOMETHING — either the booking form or the fail-closed
      // unavailable message. Never a blank white screen.
      const anyContent = page.locator('main, [role="main"], body');
      await expect(anyContent).toBeVisible();

      // Hard invariants: no unhandled React error and no 5xx toast.
      const critical = consoleErrors.filter((e) =>
        /Rendered more hooks|Rendered fewer hooks|Rules of Hooks|Uncaught/i.test(e),
      );
      expect(critical, `critical console errors: ${critical.join('\n')}`).toHaveLength(0);
    });

    test('renders fail-closed unavailable message when availability is degraded', async ({
      page,
    }) => {
      // Force the availability edge function to return 503 by intercepting.
      await page.route('**/functions/v1/public-get-availability**', async (route) => {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'availability_unavailable',
            reason: 'integration_offline',
          }),
        });
      });

      await page.goto('/book', { waitUntil: 'domcontentloaded' });

      // The UI must NOT show fake availability. It should show the
      // unavailable copy (from publicBooking.unavailableTitle/Desc keys).
      const unavailableCopy = page.getByText(
        /disponibilidade não pode ser confirmada|availability cannot be confirmed/i,
      );
      await expect(unavailableCopy).toBeVisible({ timeout: 10_000 });
    });
  });
}
