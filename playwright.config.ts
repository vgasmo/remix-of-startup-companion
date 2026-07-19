import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || process.env.STAGING_APP_URL || 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['html', { outputFolder: 'playwright-report' }], ['github']]
    : [['html', { open: 'never' }]],
  timeout: 60_000,
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      // RC5 staging personas: anonymous, founder, consultant, mentor, admin/backoffice.
      name: 'staging-personas',
      use: { ...devices['Desktop Chrome'], baseURL: BASE_URL },
      testMatch: [
        'public-booking.spec.ts',
        'founder-flow.spec.ts',
        'founder-autosave.spec.ts',
        'founder-invite-acceptance.spec.ts',
        'consultant-flow.spec.ts',
        'mentor-flow.spec.ts',
        'mentor-double-booking.spec.ts',
        'admin-flow.spec.ts',
        'admin-system-health.spec.ts',
        'backoffice-flow.spec.ts',
        'permission-gate.spec.ts',
      ],
    },
    {
      // Mobile viewport pass for the anonymous booking surface (RC5 requires 320–desktop).
      name: 'staging-personas-mobile',
      use: { ...devices['iPhone 12'], baseURL: BASE_URL },
      testMatch: ['public-booking.spec.ts'],
    },
    {
      name: 'failure-injection',
      use: { ...devices['Desktop Chrome'], baseURL: BASE_URL },
      testMatch: ['failure-injection.spec.ts'],
    },
  ],
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 30_000,
      },
});
