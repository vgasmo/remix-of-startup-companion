/**
 * E1 — Founder invite acceptance + persisted access.
 *
 * Full E2E of the atomic accept_workspace_invitation RPC path:
 *   1. Admin creates an invitation for a fresh email.
 *   2. Fresh user signs up with that email.
 *   3. User visits /accept-invite?token=... — server RPC atomically:
 *      - marks invitation accepted
 *      - links workspace_users row
 *      - flips profile.account_status to 'approved'
 *   4. User is redirected out of the pending gate to the workspace.
 *   5. After a hard reload the workspace access persists (no "stuck at
 *      pending" regression from earlier turns).
 *
 * NOTE: This spec requires E2E_INVITE_TOKEN + E2E_INVITE_EMAIL in the
 * environment, seeded by the ops harness before the run. Without them the
 * test skips — it never invents a token, because that would silently pass
 * a false-green on the release gate.
 */
import { test, expect } from '@playwright/test';

const INVITE_TOKEN = process.env.E2E_INVITE_TOKEN;
const INVITE_EMAIL = process.env.E2E_INVITE_EMAIL;
const INVITE_PASSWORD = process.env.E2E_INVITE_PASSWORD ?? 'Test1234!';

test.describe('Founder invite acceptance', () => {
  test.skip(
    !INVITE_TOKEN || !INVITE_EMAIL,
    'Requires E2E_INVITE_TOKEN + E2E_INVITE_EMAIL seeded by ops harness',
  );

  test.use({ storageState: { cookies: [], origins: [] } });

  test('accepts invitation atomically and persists workspace access across refresh', async ({
    page,
  }) => {
    // Step 1: sign in with the pre-seeded invitee credentials.
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByLabel(/email/i).fill(INVITE_EMAIL!);
    await page.locator('input[type="password"]').fill(INVITE_PASSWORD);
    await page.getByRole('button', { name: /entrar|sign in|log in/i }).click();

    // Step 2: navigate to the invite acceptance route.
    await page.goto(`/accept-invite?token=${encodeURIComponent(INVITE_TOKEN!)}`, {
      waitUntil: 'domcontentloaded',
    });

    // Step 3: acceptance UI resolves and forwards us into the app (not the
    // pending-approval waiting room).
    await expect(page).not.toHaveURL(/\/pending|\/approval/i, { timeout: 20_000 });

    // Step 4: workspace access is now visible.
    await page.goto('/my-workspaces', { waitUntil: 'domcontentloaded' });
    const workspaceCards = page.locator('a[href*="/workspace/"]');
    await expect(workspaceCards.first()).toBeVisible({ timeout: 15_000 });

    // Step 5: hard reload — persistence across the RC5 "stuck at pending" fix.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page).not.toHaveURL(/\/pending|\/approval/i);
    await expect(workspaceCards.first()).toBeVisible({ timeout: 15_000 });
  });
});
