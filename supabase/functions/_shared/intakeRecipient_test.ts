import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { intakeRecipient } from './intakeRecipient.ts';
Deno.test('intake mail uses saved contact and never a supplied override', () => {
  const record = { legal_representative_email: 'saved@test.local' };
  const request = { recipientEmail: 'outsider@test.local' };
  assertEquals(intakeRecipient(record.legal_representative_email), 'saved@test.local');
  assertEquals(intakeRecipient(record.legal_representative_email) === request.recipientEmail, false);
});
Deno.test('missing or invalid saved contact denies intake mail', () => {
  for (const value of [null, '', 'not-an-email', ['outsider@test.local']]) {
    assertThrows(() => intakeRecipient(value), Error, 'intake_recipient_missing');
  }
});