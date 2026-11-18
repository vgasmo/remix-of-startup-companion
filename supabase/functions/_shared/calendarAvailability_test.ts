import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { verifiedAvailabilityView, calendarBlocksAreFree } from './calendarAvailability.ts';

Deno.test('Friday 10:00 general meeting blocks the entire first-contact hour', () => {
  const view = verifiedAvailabilityView({ availabilityView: '002200000000000000' }, 18);
  assertEquals(view !== null && calendarBlocksAreFree(view, 2, 2), false);
});
Deno.test('even a partial overlap or tentative meeting blocks confirmation', () => {
  for (const view of ['02', '20', '01', '03', '04']) {
    assertEquals(calendarBlocksAreFree(view, 0, 2), false);
  }
  assertEquals(calendarBlocksAreFree('00', 0, 2), true);
});
Deno.test('truncated calendar responses cannot advertise free slots', () => {
  assertEquals(verifiedAvailabilityView({ availabilityView: '00' }, 18), null);
  assertEquals(calendarBlocksAreFree('0', 0, 2), false);
});
Deno.test('Graph per-mailbox error or malformed response denies availability', () => {
  for (const row of [null, {}, { availabilityView: '0' }, { availabilityView: '0x' },
    { error: { responseCode: 'ErrorMailRecipientNotFound' }, availabilityView: '00' }]) {
    assertEquals(verifiedAvailabilityView(row, 2), null);
  }
  assertEquals(verifiedAvailabilityView({ availabilityView: '00' }, 2), '00');
});