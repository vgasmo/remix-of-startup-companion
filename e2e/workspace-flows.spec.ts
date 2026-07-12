import { test, expect, type Page } from './fixtures/auth';

/**
 * Workspace end-to-end flows — verifies tab navigation, KPI check-ins,
 * and session/action-item creation surfaces for the founder and mentor
 * personas seeded by `scripts/e2e/seed-local-supabase.ts`.
 *
 * The founder persona has full CRUD on their workspace.
 * The mentor persona has read-only access to assigned workspaces and
 * therefore must see the tabs but must NOT see the create controls.
 *
 * Run locally with `bash scripts/e2e/test-e2e.sh` (needs the seeded
 * users; blocked inside the Lovable sandbox — see E2E_VERIFICATION_BLOCKER.md).
 */

const PRIMARY_TAB_LABELS = [
  /vis[aã]o geral|overview/i,
  /marcos e a[cç][oõ]es|milestones/i,
  /kpis/i,
  /agenda/i,
];

async function openFirstWorkspace(page: Page) {
  await page.goto('/my-workspaces');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2_000);

  // Prefer the "Ver Todas" view when the landing page is a cockpit
  const verTodas = page.getByRole('button', { name: /ver todas|see all/i });
  if (await verTodas.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await verTodas.click();
    await page.waitForLoadState('networkidle');
  }

  const link = page.locator('a[href^="/workspace/"]').first();
  await link.waitFor({ state: 'visible', timeout: 15_000 });
  const href = await link.getAttribute('href');
  expect(href, 'expected a workspace link').toBeTruthy();
  await page.goto(href!);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1_500);
}

async function expectPrimaryTabsRender(page: Page) {
  for (const rx of PRIMARY_TAB_LABELS) {
    const tab = page.getByRole('tab', { name: rx }).first();
    await expect(tab, `primary tab ${rx} should render`).toBeVisible({ timeout: 10_000 });
  }
}

async function clickTab(page: Page, rx: RegExp) {
  const tab = page.getByRole('tab', { name: rx }).first();
  await tab.click();
  await page.waitForTimeout(800);
}

// ─── Founder ────────────────────────────────────────────────────────────

test.describe('Founder — workspace flows', () => {
  test('primary tabs render and navigate without errors', async ({ founderPage: page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await openFirstWorkspace(page);
    await expectPrimaryTabsRender(page);

    for (const rx of PRIMARY_TAB_LABELS) {
      await clickTab(page, rx);
      // Panel must render some content (heading, empty state, or list)
      const panel = page.locator('[role="tabpanel"]:not([hidden])').first();
      await expect(panel).toBeVisible({ timeout: 5_000 });
    }

    const critical = errors.filter(
      (e) =>
        !e.includes('favicon') &&
        !e.includes('ResizeObserver') &&
        !e.includes('validateDOMNesting') &&
        !e.includes('Third-party') &&
        !e.includes('net::ERR'),
    );
    expect(critical, `unexpected console errors: ${critical.join(' | ')}`).toHaveLength(0);
  });

  test('can open KPI check-in / value entry surface', async ({ founderPage: page }) => {
    await openFirstWorkspace(page);
    await clickTab(page, /kpis/i);

    // Founder should see an entry point to record a KPI value — either
    // an explicit "add value" CTA or an inline input on each KPI card.
    const entryCta = page.getByRole('button', {
      name: /registar|introduzir|adicionar valor|novo valor|add value|record/i,
    });
    const inlineInput = page.locator('[data-testid^="kpi-value-input"], input[inputmode="numeric"]');

    const hasCta = await entryCta.first().isVisible({ timeout: 3_000 }).catch(() => false);
    const hasInline = (await inlineInput.count()) > 0;

    expect(hasCta || hasInline, 'founder needs a way to record a KPI value').toBeTruthy();

    if (hasCta) {
      await entryCta.first().click();
      // A dialog / drawer / inline form should appear
      const surface = page
        .getByRole('dialog')
        .or(page.locator('form input[inputmode="numeric"], form input[type="number"]'));
      await expect(surface.first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('can open new-action and new-session creation surfaces', async ({ founderPage: page }) => {
    await openFirstWorkspace(page);

    // Actions live under Marcos e Ações
    await clickTab(page, /marcos e a[cç][oõ]es|milestones/i);
    const newAction = page.getByRole('button', {
      name: /nova a[cç][aã]o|adicionar a[cç][aã]o|new action|add action/i,
    });
    await expect(newAction.first(), 'expected a new-action CTA').toBeVisible({ timeout: 10_000 });
    await newAction.first().click();
    await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 5_000 });
    // Close without saving
    await page.keyboard.press('Escape');

    // Sessions live under Agenda
    await clickTab(page, /agenda/i);
    const newSession = page.getByRole('button', {
      name: /nova sess[aã]o|agendar sess[aã]o|new session|schedule session/i,
    });
    await expect(newSession.first(), 'expected a new-session CTA').toBeVisible({ timeout: 10_000 });
    await newSession.first().click();
    await expect(page.getByRole('dialog').first()).toBeVisible({ timeout: 5_000 });
  });
});

// ─── Mentor ────────────────────────────────────────────────────────────

test.describe('Mentor — workspace flows (read-only)', () => {
  test('primary tabs render on an assigned workspace', async ({ mentorPage: page }) => {
    // Mentor may need to accept the NDA once — reuse the mentor-flow gate handling.
    await page.goto('/my-workspaces');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2_000);

    if (page.url().includes('mentor-nda')) {
      const checkbox = page.getByRole('checkbox').or(page.locator('input[type="checkbox"]'));
      if (await checkbox.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
        await checkbox.first().check();
      }
      await page.getByRole('button', { name: /aceitar|accept|concordo|agree/i }).click();
      await page.waitForURL((u) => !u.pathname.includes('mentor-nda'), { timeout: 15_000 });
    }

    const link = page.locator('a[href^="/workspace/"]').first();
    const hasWorkspace = await link.isVisible({ timeout: 8_000 }).catch(() => false);
    test.skip(!hasWorkspace, 'mentor persona has no assigned workspace in this env');

    await link.click();
    await page.waitForLoadState('networkidle');
    await expectPrimaryTabsRender(page);
  });

  test('does not expose founder-only create controls', async ({ mentorPage: page }) => {
    await page.goto('/my-workspaces');
    await page.waitForLoadState('networkidle');
    const link = page.locator('a[href^="/workspace/"]').first();
    const hasWorkspace = await link.isVisible({ timeout: 8_000 }).catch(() => false);
    test.skip(!hasWorkspace, 'mentor persona has no assigned workspace in this env');
    await link.click();
    await page.waitForLoadState('networkidle');

    // KPI check-in is a founder/consultor action; must not appear for mentor.
    await clickTab(page, /kpis/i);
    const kpiCta = page.getByRole('button', {
      name: /registar|introduzir|adicionar valor|novo valor|add value|record/i,
    });
    expect(await kpiCta.count()).toBe(0);

    // New-action CTA is founder/consultor only.
    await clickTab(page, /marcos e a[cç][oõ]es|milestones/i);
    const newAction = page.getByRole('button', {
      name: /nova a[cç][aã]o|adicionar a[cç][aã]o|new action|add action/i,
    });
    expect(await newAction.count()).toBe(0);
  });
});
