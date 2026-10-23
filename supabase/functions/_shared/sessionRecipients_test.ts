import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { selectSessionRecipients, getSessionRecipientEmails } from './sessionRecipients.ts';

Deno.test('unrelated recipient cannot receive session information', () => {
  assertThrows(() => selectSessionRecipients(['outsider@test.local'], ['member@test.local']), Error, 'recipient_not_authorized');
});
Deno.test('recorded participant subset is normalized and deduplicated', () => {
  assertEquals(selectSessionRecipients([' MEMBER@test.local ', 'member@test.local'], ['member@test.local', 'mentor@test.local']), ['member@test.local']);
});
Deno.test('default recipients come only from the server-recorded set', () => {
  assertEquals(selectSessionRecipients(undefined, ['member@test.local']), ['member@test.local']);
});
Deno.test('recorded startup contact remains eligible for unclaimed workspace invites', () => {
  assertEquals(selectSessionRecipients(['founder@test.local'], ['founder@test.local']), ['founder@test.local']);
});
Deno.test('recipient input rejects malformed and overlong lists', () => {
  assertThrows(() => selectSessionRecipients('member@test.local', []), Error, 'invalid_recipients');
  assertThrows(() => selectSessionRecipients(Array(51).fill('member@test.local'), []), Error, 'invalid_recipients');
});
Deno.test('recipient lookup failure denies delivery', async () => {
  const query = { select() { return this; }, eq() { return this; }, single() { return this; }, then(resolve: (v: unknown) => unknown) { return Promise.resolve(resolve({ data: null, error: { message: 'offline' } })); } };
  let failed = false;
  try { await getSessionRecipientEmails({ from: () => query } as never, 'session', 'workspace'); } catch { failed = true; }
  assertEquals(failed, true);
});