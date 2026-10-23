import { assertEquals, assertRejects, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { getCommunicationContacts, selectCommunicationEmails, selectCommunicationPhone } from './communicationRecipients.ts';

const contacts = { emails: ['recorded@test.local'], phones: ['00351 912 345 678'], userIds: ['member'] };
Deno.test('emails and proposals: only a recorded associated address can receive communication', () => {
  assertEquals(selectCommunicationEmails([' RECORDED@test.local '], contacts), ['recorded@test.local']);
  assertThrows(() => selectCommunicationEmails(['outsider@test.local'], contacts), Error, 'recipient_not_authorized');
});
Deno.test('SMS and WhatsApp: arbitrary phone numbers are denied; formatted recorded numbers remain eligible', () => {
  assertEquals(selectCommunicationPhone('+351912345678', contacts), '+351912345678');
  assertThrows(() => selectCommunicationPhone('+351999999999', contacts), Error, 'recipient_not_authorized');
});
function client(failTable?: string) {
  const tables: Record<string, unknown> = {
    sessions: { workspace_id: 'workspace', primary_consultant_id: 'consultant', primary_mentor_id: null },
    session_participants: [{ user_id: 'participant' }],
    workspaces: { startup_id: 'startup', assigned_consultor_id: 'consultant' },
    startups: { main_contact_email: 'founder@test.local', main_contact_phone: '+351912345678', phone: null },
    workspace_users: [{ user_id: 'member' }],
    team_members: [{ email: 'team@test.local', phone: '+351923456789', user_id: 'team' }],
    profiles: [{ id: 'member', email: 'member@test.local', phone: '+351934567890' }],
    funnel_items: { contact_email: 'lead@test.local', contact_phone: '+351945678901' },
  };
  return { from: (table: string) => {
    const result = { data: tables[table], error: table === failTable ? { message: 'offline' } : null };
    return { select() { return this; }, eq() { return this; }, in() { return this; }, is() { return this; },
      single: () => Promise.resolve(result), then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve) };
  } } as never;
}
Deno.test('workspace contacts are resolved from startup, current team and approved member records', async () => {
  const result = await getCommunicationContacts(client(), { workspace_id: 'workspace' });
  assertEquals(result.emails, ['founder@test.local', 'team@test.local', 'member@test.local']);
  assertEquals(result.phones, ['+351912345678', '+351923456789', '+351934567890']);
});
Deno.test('session from another workspace is rejected before recipients can be used', async () => {
  await assertRejects(() => getCommunicationContacts(client(), { workspace_id: 'other', session_id: 'session' }), Error, 'recipient_not_authorized');
});
Deno.test('startup from another workspace is rejected', async () => {
  await assertRejects(() => getCommunicationContacts(client(), { workspace_id: 'workspace', startup_id: 'other' }), Error, 'recipient_not_authorized');
});
Deno.test('pre-conversion CRM lead contacts remain eligible but cannot be combined with an unrelated scope', async () => {
  assertEquals(await getCommunicationContacts(client(), { funnel_item_id: 'lead' }), { emails: ['lead@test.local'], phones: ['+351945678901'], userIds: [] });
  await assertRejects(() => getCommunicationContacts(client(), { funnel_item_id: 'lead', workspace_id: 'other' }), Error, 'invalid_recipient_scope');
});
for (const table of ['workspaces', 'workspace_users', 'startups', 'team_members', 'profiles', 'sessions', 'session_participants']) {
  Deno.test(`contact lookup fails closed on ${table} errors`, async () => {
    await assertRejects(() => getCommunicationContacts(client(table), { session_id: 'session' }), Error, 'recipient_lookup_failed');
  });
}
Deno.test('missing scope cannot authorize communication', async () => {
  await assertRejects(() => getCommunicationContacts(client(), {}), Error, 'invalid_recipient_scope');
});