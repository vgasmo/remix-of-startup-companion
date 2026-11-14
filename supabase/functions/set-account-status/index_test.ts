import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { z } from 'npm:zod@3';

async function fixture(status: string, role: string, targetRole = 'founder', failures: { ban?: boolean; profile?: boolean; unban?: boolean } = {}) {
  const bans: string[] = [];
  const operations: string[] = [];
  let persistedStatus = 'approved';
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'caller' } }, error: null }), admin: {
      updateUserById: async (_id: string, body: { ban_duration: string }) => {
        bans.push(body.ban_duration); operations.push(`auth:${body.ban_duration}`);
        return { error: (body.ban_duration === 'none' ? failures.unban : failures.ban) ? { message: 'Auth unavailable' } : null };
      },
    } },
    from(table: string) {
      let id = '', updating = false;
      const result = () => ({ error: updating && failures.profile ? { message: 'Write failed' } : null, data: updating ? failures.profile ? [] : [{ id }] : table === 'profiles'
        ? { id, account_status: id === 'caller' ? status : 'approved' }
        : (id === 'caller' ? role === 'admin' : targetRole === 'admin') ? [{ role: 'admin' }] : [] });
      return { select() { return this; }, eq(key: string, value: string) { if (key === 'id' || key === 'user_id') id = value; return this; },
        update(body: { account_status: string }) {
          updating = true; operations.push(`profile:${body.account_status}`);
          if (!failures.profile) persistedStatus = body.account_status;
          return this;
        }, maybeSingle: async () => result(),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve) };
    },
  };
  const key = `account_test_${crypto.randomUUID().replaceAll('-', '')}`;
  (globalThis as unknown as Record<string, unknown>)[key] = {
    createClient: () => client, corsHeaders: {}, z,
    denyIfAccountInactive: async () => status === 'suspended' ? new Response('{}', { status: 403 }) : null,
    Deno: { env: { get: () => 'test-value' } },
  };
  const source = await Deno.readTextFile(new URL('./index.ts', import.meta.url));
  const code = `const { createClient, corsHeaders, z, denyIfAccountInactive, Deno } = globalThis.${key};\n` + source
    .replace(/^import .*;\n/gm, '').replace('Deno.serve(async (req) =>', 'export default (async (req: Request) =>');
  const module = await import(`data:application/typescript;base64,${btoa(code)}`);
  const invoke = (next: string) => module.default(new Request('https://local.test', { method: 'POST', headers: { Authorization: 'Bearer test' },
    body: JSON.stringify({ userId: '00000000-0000-4000-8000-000000000001', status: next }) }));
  return { bans, operations, invoke, persistedStatus: () => persistedStatus };
}

Deno.test('approved admin applies 100-year ban and none on reactivation', async () => {
  const f = await fixture('approved', 'admin');
  assertEquals((await f.invoke('suspended')).status, 200);
  assertEquals((await f.invoke('approved')).status, 200);
  assertEquals(f.bans, ['876000h', 'none']);
});
Deno.test('pending admin cannot ban', async () => {
  const f = await fixture('pending', 'admin');
  assertEquals((await f.invoke('suspended')).status, 403); assertEquals(f.bans, []);
});
Deno.test('consultant cannot ban', async () => {
  const f = await fixture('approved', 'consultor');
  assertEquals((await f.invoke('suspended')).status, 403); assertEquals(f.bans, []);
});
Deno.test('another administrator cannot be suspended', async () => {
  const f = await fixture('approved', 'admin', 'admin');
  assertEquals((await f.invoke('suspended')).status, 403); assertEquals(f.bans, []);
});
Deno.test('suspension persists restrictive status before blocking login and refresh', async () => {
  const f = await fixture('approved', 'admin');
  assertEquals((await f.invoke('suspended')).status, 200);
  assertEquals(f.operations, ['profile:suspended', 'auth:876000h']);
});
Deno.test('failed Auth ban leaves account suspended and reports failure', async () => {
  const f = await fixture('approved', 'admin', 'founder', { ban: true });
  const response = await f.invoke('suspended');
  assertEquals(response.status, 502);
  assertEquals(await response.json(), { error: 'Authentication suspension failed' });
  assertEquals(f.persistedStatus(), 'suspended');
});
Deno.test('failed profile write never applies an Auth operation', async () => {
  const f = await fixture('approved', 'admin', 'founder', { profile: true });
  assertEquals((await f.invoke('suspended')).status, 500);
  assertEquals(f.bans, []);
});
Deno.test('reactivation never reports success when unban fails', async () => {
  const f = await fixture('approved', 'admin', 'founder', { unban: true });
  assertEquals((await f.invoke('approved')).status, 502);
  assertEquals(f.bans, ['none']);
});