/**
 * Playwright global setup: logs in each role and saves storageState.
 *
 * Uses seeded local credentials by default. If E2E_<ROLE>_EMAIL env vars
 * are set, those override the defaults (for remote Supabase).
 */
import { chromium, type FullConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const DEFAULT_CREDENTIALS: Record<string, { email: string; password: string }> = {
  admin: { email: 'e2e-admin@startup-leiria.test', password: 'Test1234!' },
  backoffice: { email: 'e2e-backoffice@startup-leiria.test', password: 'Test1234!' },
  consultant: { email: 'e2e-consultant@startup-leiria.test', password: 'Test1234!' },
  founder: { email: 'e2e-founder@startup-leiria.test', password: 'Test1234!' },
  founder_unclaimed: { email: 'e2e-founder-unclaimed@startup-leiria.test', password: 'Test1234!' },
  mentor: { email: 'e2e-mentor@startup-leiria.test', password: 'Test1234!' },
};

function rc5EnvRole(role: string) {
  // seed-personas.mjs and the staging guide use RC5_TEST_CONSULTANT_* for the
  // 'consultant' role (the app role key is 'consultor' but the env var says
  // CONSULTANT); every other role's env name matches its role name.
  return role === 'consultant' ? 'CONSULTANT' : role.toUpperCase();
}

function getCredentials(role: string) {
  const envEmail = process.env[`E2E_${role.toUpperCase()}_EMAIL`]
    ?? process.env[`RC5_TEST_${rc5EnvRole(role)}_EMAIL`];
  const envPassword = process.env[`E2E_${role.toUpperCase()}_PASSWORD`]
    ?? process.env[`RC5_TEST_${rc5EnvRole(role)}_PASSWORD`];
  if (envEmail && envPassword) {
    return { email: envEmail, password: envPassword };
  }
  return DEFAULT_CREDENTIALS[role];
}

async function loginAndSave(
  baseURL: string,
  role: string,
  storageDir: string,
) {
  const creds = getCredentials(role);
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle', timeout: 30_000 });

    // Fill email
    const emailInput = page.getByLabel(/email/i);
    await emailInput.waitFor({ state: 'visible', timeout: 10_000 });
    await emailInput.fill(creds.email);

    // Fill password — use the input directly by id to avoid matching the toggle button
    const passwordInput = page.locator('input[type="password"]');
    await passwordInput.waitFor({ state: 'visible', timeout: 10_000 });
    await passwordInput.fill(creds.password);

    // Submit
    const submitBtn = page.getByRole('button', { name: /sign in|entrar|log in/i });
    await submitBtn.click();

    // Wait for navigation away from login
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 20_000 });

    // Wait a bit for auth state to settle
    await page.waitForTimeout(2_000);

    // Mark as E2E environment to disable onboarding tour (Joyride)
    await page.evaluate(() => localStorage.setItem('e2e-test', 'true'));

    // Save storage state
    const statePath = path.join(storageDir, `${role}.json`);
    await context.storageState({ path: statePath });
    console.log(`  ✓ ${role} → ${statePath}`);
  } catch (err) {
    console.error(`  ✗ Failed to login as ${role} (${creds.email}):`, err);
    throw err;
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL
    || process.env.PLAYWRIGHT_BASE_URL
    || 'http://localhost:5173';

  const storageDir = path.resolve('playwright/.auth');
  fs.mkdirSync(storageDir, { recursive: true });

  console.log('🔐 Playwright global setup — logging in all roles...');

  // Login sequentially to avoid rate limiting
  for (const role of Object.keys(DEFAULT_CREDENTIALS)) {
    await loginAndSave(baseURL, role, storageDir);
  }

  console.log('✅ All roles authenticated\n');
}
