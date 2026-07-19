/**
 * E1 — Founder autosave persists across a hard refresh.
 *
 * Regression guard for the RC5 "stale cache after invalidation" class of bugs:
 * a founder edits a workspace field (KPI value or milestone note), the client
 * mutates the row, the query cache invalidates, and after a full page reload
 * the persisted value must still be visible.
 *
 * If autosave is truly wired, this test passes without any "Save" click.
 * If the surface behind the fixture requires an explicit save button, we click
 * it — the test's job is to prove server persistence, not the trigger.
 */
import { test, expect } from './fixtures/auth';

test.describe('Founder autosave — persists across refresh', () => {
  test('workspace note survives a hard reload', async ({ founderPage: page }) => {
    await page.goto('/my-workspaces', { waitUntil: 'domcontentloaded' });

    // Enter the first workspace card
    const firstWorkspace = page.locator('a[href*="/workspace/"]').first();
    await firstWorkspace.waitFor({ state: 'visible', timeout: 15_000 });
    await firstWorkspace.click();

    // Navigate to milestones/actions tab where autosave lives on notes
    await page.getByRole('tab', { name: /milestone|marco|ações/i }).first().click().catch(() => {
      // Not every workspace opens on a tab layout — silently continue.
    });

    // Pick the first textarea we can find (session notes / milestone note)
    const textarea = page.locator('textarea').first();
    await textarea.waitFor({ state: 'visible', timeout: 15_000 });

    const marker = `e2e-autosave-${Date.now()}`;
    await textarea.fill(marker);

    // If an explicit save exists, use it; otherwise rely on debounced autosave.
    const saveBtn = page.getByRole('button', { name: /guardar|salvar|save/i }).first();
    if (await saveBtn.isVisible().catch(() => false)) {
      await saveBtn.click();
    }

    // Wait for the outstanding mutation to settle. 2s covers typical debounce.
    await page.waitForTimeout(2_500);

    // Hard reload — bypass cache to prove server-side persistence.
    await page.reload({ waitUntil: 'domcontentloaded' });

    // The marker must be present somewhere on the reloaded page.
    await expect(page.getByText(marker, { exact: false })).toBeVisible({ timeout: 15_000 });
  });
});
