import { test, expect } from '@playwright/test';

// RC5 failure-injection contract. Proves the app fails CLOSED, not open.
// Every test asserts an explicit failure UI; a passing green screen is a regression.

test.describe('RC5 failure injection @failure-injection', () => {
  test('public-get-availability 503 shows fail-closed message', async ({ page }) => {
    await page.route('**/functions/v1/public-get-availability**', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'integration_unavailable' }) }),
    );
    await page.goto('/book');
    await expect(page.getByText(/disponibilidade não pode ser confirmada|availability cannot be confirmed/i)).toBeVisible();
  });

  test('Graph 429 rate limit surfaces retry, not silent success', async ({ page }) => {
    test.fixme(true, 'Sem widget email-sync-status com data-testid');
    await page.route('**/graph.microsoft.com/**', (route) => route.fulfill({ status: 429, body: '{}' }));
    await page.goto('/dashboard');
    // The email sync widget must show a warning, not a green tick.
    await expect(page.getByTestId('email-sync-status')).toContainText(/erro|error|falha|retry/i, { timeout: 10_000 });
  });

  test('duplicate mentor booking is rejected by idempotency key', async ({ request }) => {
    const api = process.env.STAGING_SUPABASE_URL, anon = process.env.STAGING_SUPABASE_ANON_KEY;
    const mentorId = process.env.RC5_TEST_MENTOR_ID, workspaceId = process.env.RC5_TEST_WORKSPACE_ID;
    test.skip(!api || !anon || !mentorId || !workspaceId, 'staging API/persona ids not set');
    const login = await request.post(`${api}/auth/v1/token?grant_type=password`, {
      headers: { apikey: anon! },
      data: { email: process.env.RC5_TEST_FOUNDER_EMAIL, password: process.env.RC5_TEST_FOUNDER_PASSWORD },
    });
    expect(login.ok()).toBe(true);
    const { access_token } = await login.json();
    const headers = { apikey: anon!, Authorization: `Bearer ${access_token}` };
    const data = {
      p_mentor_id: mentorId, p_workspace_id: workspaceId, p_requested_date: '2030-01-07',
      p_requested_start_time: '10:00', p_requested_end_time: '11:00', p_message: 'rc5-e2e',
      p_idempotency_key: `rc5-e2e-${Date.now()}`,
    };
    const first = await request.post(`${api}/rest/v1/rpc/create_mentor_booking_idempotent`, { headers, data });
    const second = await request.post(`${api}/rest/v1/rpc/create_mentor_booking_idempotent`, { headers, data });
    expect(first.status()).toBe(200);
    expect(second.status()).toBe(200);
    expect((await second.json()).id).toBe((await first.json()).id);
  });
});
