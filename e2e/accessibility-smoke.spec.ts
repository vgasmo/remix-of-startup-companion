import { test, expect } from './fixtures/auth';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility Smoke Tests
 *
 * Runs axe-core on key pages for each persona. We fail the build on
 * `critical` violations only — `serious` (incl. color-contrast) are
 * reported to the console for triage without blocking CI.
 */

const SHARED_DISABLED_RULES = [
  // shadcn/radix icon-only buttons; we audit aria-label coverage statically.
  'button-name',
];

type Persona = 'consultant' | 'admin' | 'founder' | 'mentor';

async function scan(page: import('@playwright/test').Page, persona: Persona, route: string) {
  await page.goto(route);
  await page.waitForTimeout(2_500);

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(SHARED_DISABLED_RULES)
    .analyze();

  const grouped = {
    critical: results.violations.filter(v => v.impact === 'critical'),
    serious: results.violations.filter(v => v.impact === 'serious'),
  };

  if (grouped.serious.length || grouped.critical.length) {
    // eslint-disable-next-line no-console
    console.warn(
      `[a11y] ${persona} ${route} —`,
      JSON.stringify(
        [...grouped.critical, ...grouped.serious].map(v => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.length,
        })),
        null,
        2,
      ),
    );
  }

  // Hard-fail only on critical.
  expect(grouped.critical, `Critical a11y violations on ${route}`).toHaveLength(0);
}

test.describe('Accessibility Smoke — Consultant', () => {
  for (const route of ['/', '/crm', '/my-workspaces', '/ecosystem']) {
    test(`consultant ${route} has no critical a11y violations`, async ({ consultantPage }) => {
      await scan(consultantPage, 'consultant', route);
    });
  }
});

test.describe('Accessibility Smoke — Admin', () => {
  for (const route of ['/admin', '/admin/programs', '/system-settings']) {
    test(`admin ${route} has no critical a11y violations`, async ({ adminPage }) => {
      await scan(adminPage, 'admin', route);
    });
  }
});

test.describe('Accessibility Smoke — Founder', () => {
  for (const route of ['/', '/documents']) {
    test(`founder ${route} has no critical a11y violations`, async ({ founderPage }) => {
      await scan(founderPage, 'founder', route);
    });
  }
});

test.describe('Accessibility Smoke — Mentor', () => {
  test('mentor / has no critical a11y violations', async ({ mentorPage }) => {
    await scan(mentorPage, 'mentor', '/');
  });
});

test.describe('ARIA landmark structure', () => {
  test('Consultant CRM exposes main landmark + heading', async ({ consultantPage: page }) => {
    await page.goto('/crm');
    await page.waitForTimeout(2_500);
    const main = page.locator('main').first();
    await expect(main).toBeVisible();
    await expect(main.locator('h1, h2, h3').first()).toBeVisible();
  });

  test('Admin backoffice exposes main landmark', async ({ adminPage: page }) => {
    await page.goto('/admin');
    await page.waitForTimeout(2_500);
    await expect(page.locator('main').first()).toBeVisible();
  });
});
