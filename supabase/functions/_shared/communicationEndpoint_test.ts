import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import * as security from './security.ts';
import * as cors from './cors.ts';
import * as recipients from './communicationRecipients.ts';
import * as html from './html.ts';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

// Run actual handlers with isolated SDK/provider transports. No hosted mutations or real messages.
async function setup(name: string, options: { lookupError?: boolean; approved?: boolean } = {}) {
  const sends: Array<Record<string, unknown>> = [];
  const writes: string[] = [];
  const workspaceId = '11111111-1111-1111-1111-111111111111';
  const data: Record<string, unknown> = {
    user_roles: [{ role: 'admin' }], survey_campaigns: { id: 'campaign', name: 'Campaign', ends_at: null },
    survey_instances: [{ id: 'instance', workspace_id: workspaceId, public_token: 'token', last_reminder_sent_at: null }],
    startups: [{ id: 'startup', name: 'Startup', main_contact_email: 'recorded@test.local', main_contact_phone: '+351912345678' }],
    workspaces: [{ id: workspaceId, startup_id: 'startup', assigned_consultor_id: 'caller' }],
    workspace_users: [{ workspace_id: workspaceId, user_id: 'caller' }], team_members: [],
    profiles: [{ id: 'caller', email: 'recorded@test.local', phone: '+351912345678', full_name: 'Caller' }],
    signup_allowlist: [],
  };
  const client = {
    auth: { getUser: () => Promise.resolve({ data: { user: { id: 'caller' } }, error: null }) },
    rpc: (fn: string) => Promise.resolve({ data: fn === 'is_account_active' ? options.approved !== false : fn === 'founder_notifications_blocked' ? false : true, error: null }),
    from: (table: string) => {
      const rows = data[table] ?? [];
      const result = { data: rows, error: options.lookupError && table === 'team_members' ? { message: 'offline' } : null };
      return { select() { return this; }, eq() { return this; }, in() { return this; }, is() { return this; }, neq() { return this; },
        insert() { writes.push(table); return this; }, update() { writes.push(table); return this; },
        single: () => Promise.resolve({ ...result, data: Array.isArray(rows) ? rows[0] : rows }),
        maybeSingle: () => Promise.resolve({ ...result, data: Array.isArray(rows) ? rows[0] : rows }),
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve) };
    },
  };
  const globals = globalThis as unknown as Record<string, unknown>;
  const key = `communication_${crypto.randomUUID().replaceAll('-', '')}`;
  globals[key] = { ...security, ...cors, ...recipients, ...html, corsHeaders,
    createClient: () => client,
    Resend: class { emails = { send: (message: Record<string, unknown>) => { sends.push(message); return Promise.resolve({ error: null }); } }; },
    foundersGloballyDisabled: () => false,
    resolveLocalesByUserIds: () => new Map([['caller', 'pt']]),
    fetch: async (_url: unknown, init: RequestInit) => { sends.push({ payload: init.body }); return new Response(JSON.stringify({ sid: 'test-only' })); },
    Deno: { env: { get: (key: string) => key === 'SUPABASE_URL' ? 'https://local.test' : key === 'PUBLIC_APP_URL' ? 'https://app.test' : 'test-only-value' } },
  };
  const source = await Deno.readTextFile(new URL(`../${name}/index.ts`, import.meta.url));
  const names = Object.keys(globals[key] as object).filter(name => !new RegExp(`(?:function|const) ${name}\\b`).test(source)).join(',');
  const code = `const { ${names} } = globalThis.${key};\n` + source.replace(/^import\s+[\s\S]*?;\s*$/gm, '').replace(/(?:Deno\.serve|serve)\(async\s*\(/, 'export default (async (');
  const mod = await import(`data:application/typescript;base64,${btoa(unescape(encodeURIComponent(code)))}`);
  return { sends, writes, workspaceId, run: (body: unknown) => mod.default(new Request('https://app.test', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify(body) })) as Promise<Response> };
}
for (const type of ['sms', 'whatsapp']) {
  Deno.test(`${type} handler denies unrelated numbers before provider calls`, async () => {
    const f = await setup('send-whatsapp-reminder');
    const response = await f.run({ to: '+351999999999', message: 'Test', type, workspace_id: f.workspaceId });
    assertEquals(response.status, 403); assertEquals(f.sends.length, 0);
  });
  Deno.test(`${type} handler permits recorded startup phone`, async () => {
    const f = await setup('send-whatsapp-reminder');
    assertEquals((await f.run({ to: '+351912345678', message: 'Test', type, workspace_id: f.workspaceId })).status, 200);
    assertEquals(f.sends.length, 1);
    assertEquals(new URLSearchParams(String(f.sends[0].payload)).get('To'), type === 'sms' ? '+351912345678' : 'whatsapp:+351912345678');
  });
}
Deno.test('survey extra recipient from another startup is denied with no sends or allowlist writes', async () => {
  const f = await setup('send-survey-invites');
  assertEquals((await f.run({ campaign_id: 'campaign', extra_recipients: [{ email: 'outsider@test.local', workspace_id: f.workspaceId }] })).status, 403);
  assertEquals(f.sends.length, 0); assertEquals(f.writes.length, 0);
});
Deno.test('survey recorded extra recipient is eligible and deduplicated', async () => {
  const f = await setup('send-survey-invites');
  assertEquals((await f.run({ campaign_id: 'campaign', extra_recipients: [{ email: 'recorded@test.local', workspace_id: f.workspaceId }] })).status, 200);
  assertEquals(f.sends.length, 1); assertEquals(f.sends[0].to, 'recorded@test.local');
});
for (const endpoint of ['send-survey-invites', 'send-whatsapp-reminder']) {
  Deno.test(`${endpoint} contact lookup errors deny before sends`, async () => {
    const f = await setup(endpoint, { lookupError: true });
    const body = endpoint === 'send-survey-invites' ? { campaign_id: 'campaign', extra_recipients: [{ email: 'recorded@test.local', workspace_id: f.workspaceId }] } : { to: '+351912345678', message: 'Test', workspace_id: f.workspaceId };
    assertEquals((await f.run(body)).status, 503); assertEquals(f.sends.length, 0); assertEquals(f.writes.length, 0);
  });
}
Deno.test('mention endpoint denies unrelated user even to authenticated staff', async () => {
  const f = await setup('send-notification-email');
  assertEquals((await f.run({ type: 'activity_mention', workspace_id: f.workspaceId, mention: { mentioned_user_id: 'outsider', author_id: 'other', text: 'Test' } })).status, 403);
  assertEquals(f.sends.length, 0);
});
Deno.test('mention endpoint retains associated recipient and binds author to signed-in caller', async () => {
  const f = await setup('send-notification-email');
  assertEquals((await f.run({ type: 'activity_mention', workspace_id: f.workspaceId, mention: { mentioned_user_id: 'caller', author_id: 'impersonated', text: 'Test' } })).status, 200);
  assertEquals(f.sends.length, 1);
  const payload = JSON.parse(String(f.sends[0].payload));
  assertEquals(payload.to, ['recorded@test.local']); assertEquals(payload.subject, 'Caller mencionou-te em Startup Leiria');
});
Deno.test('assignment notification rejects consultant not assigned in server record', async () => {
  const f = await setup('send-notification-email');
  assertEquals((await f.run({ type: 'consultant_assigned', workspace_id: f.workspaceId, consultant_id: 'outsider' })).status, 403);
  assertEquals(f.sends.length, 0);
});