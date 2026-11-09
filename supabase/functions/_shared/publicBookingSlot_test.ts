import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isOfferedSlot, MAX_BOOKING_AHEAD_MS } from './publicBookingSlot.ts';

const now = Date.parse('2026-11-09T08:00:00Z');
Deno.test('booking accepts offered weekday time in Lisbon', () => assertEquals(isOfferedSlot('2026-11-09', '09:00', now), true));
Deno.test('booking rejects times outside offered grid', () => assertEquals(isOfferedSlot('2026-11-09', '13:00', now), false));
Deno.test('booking rejects weekend dates', () => assertEquals(isOfferedSlot('2026-11-14', '09:00', now), false));
Deno.test('booking rejects nonexistent dates', () => assertEquals(isOfferedSlot('2026-02-31', '09:00', now), false));
Deno.test('booking rejects past times', () => assertEquals(isOfferedSlot('2026-11-06', '09:00', now), false));
Deno.test('booking is bounded to 15 days', () => {
  assertEquals(MAX_BOOKING_AHEAD_MS, 15 * 24 * 60 * 60 * 1000);
  assertEquals(isOfferedSlot('2026-11-25', '09:00', now), false);
});