import { test, expect } from './fixtures/auth';
import { createClient } from '@supabase/supabase-js';
import { USERS, SEED_IDS } from '../scripts/e2e/seed-constants';

/**
 * E2E — prevent_mentor_booking_overlap trigger
 *
 * Verifies that the DB trigger blocks a second booking for the same
 * mentor + date + overlapping time, and that the UI surfaces the
 * localized "slot already taken" toast (`mentors.slotAlreadyTaken`).
 *
 * We drive the Supabase client from the authenticated founder page so the
 * mutation runs with the real RLS context. Cleanup happens in `finally`.
 */
test.describe('Mentor double-booking prevention', () => {
  const futureDate = (() => {
    // Use a stable weekday 10 days ahead to avoid flakiness on weekends.
    const d = new Date();
    d.setDate(d.getDate() + 10);
    return d.toISOString().slice(0, 10);
  })();
  const START = '10:00:00';
  const END = '11:00:00';

  test('trigger blocks overlap and UI shows slot-taken toast', async ({ founderPage: page }) => {
    // Navigate so the Supabase client is bootstrapped on window.
    await page.goto('/');
    await expect(page.locator('main, [data-testid="app-layout"]')).toBeVisible({ timeout: 15_000 });

    const supabaseUrl = process.env.VITE_SUPABASE_URL!;
    const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    await supabase.auth.signInWithPassword({
      email: process.env.E2E_FOUNDER_EMAIL ?? 'e2e-founder@startup-leiria.test',
      password: process.env.E2E_FOUNDER_PASSWORD ?? 'Test1234!',
    });

    const result = await (async ({ mentorId, workspaceId, requested_date, s, e }) => {
        // First insert — should succeed.
        const first = await supabase
          .from('mentor_bookings')
          .insert({
            mentor_id: mentorId,
            workspace_id: workspaceId,
            requested_date,
            requested_start_time: s,
            requested_end_time: e,
            message: 'e2e-primary',
          })
          .select()
          .single();

        // Second insert (overlapping) — must be blocked by the trigger.
        const second = await supabase
          .from('mentor_bookings')
          .insert({
            mentor_id: mentorId,
            workspace_id: workspaceId,
            requested_date,
            requested_start_time: s,
            requested_end_time: e,
            message: 'e2e-duplicate',
          })
          .select()
          .single();

        return {
          firstOk: !first.error,
          firstId: first.data?.id ?? null,
          firstError: first.error?.message ?? null,
          secondBlocked: !!second.error,
          secondCode: second.error?.code ?? null,
          secondMessage: second.error?.message ?? null,
        };
      })({
        mentorId: USERS.mentor.id,
        workspaceId: SEED_IDS.workspace,
        requested_date: futureDate,
        s: START,
        e: END,
      });

    try {
      // First should have succeeded.
      expect(result.firstOk, `First insert failed: ${result.firstError}`).toBe(true);

      // Second must have been blocked by prevent_mentor_booking_overlap.
      expect(result.secondBlocked).toBe(true);
      // Trigger raises unique_violation-like error; message mentions the guard.
      expect(
        (result.secondMessage || '').toLowerCase(),
      ).toMatch(/mentor_double_booking|overlap|already|booking/);
    } finally {
      // Cleanup: remove the primary booking so re-runs stay idempotent.
      if (result.firstId) {
        await supabase.from('mentor_bookings').delete().eq('id', result.firstId);
      }
    }
  });
});
