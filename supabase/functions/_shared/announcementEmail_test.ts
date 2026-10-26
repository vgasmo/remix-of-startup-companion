import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import * as security from './security.ts';
import * as cors from './cors.ts';

// Runs the real send-announcement-email handler with stubbed DB/provider. No hosted calls.
async function setup(opts: { claimed: string[]; userId?: string }) {
  const filters: Array<[string, string, unknown]> = [];
  const sends: unknown[] = [];
  const builder = (table: string) => {
    let isUpdate = false;
    const b: Record<string, unknown> = {
      update() { isUpdate = true; return b; },
      select() { return b; },
      in(c: string, v: unknown) { filters.push(['in', c, v]); return b; },
      eq(c: string, v: unknown) { if (isUpdate) filters.push(['eq', c, v]); return b; },
      is(c: string, v: unknown) { if (isUpdate) filters.push(['is', c, v]); return b; },
      single: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => {
        if (table === 'admin_announcements' && isUpdate) {
          return Promise.resolve({ data: opts.claimed.map(id => ({ id })), error: null }).then(resolve);
        }
        if (table === 'admin_announcements') {
          return Promise.resolve({ data: opts.claimed.map(id => ({ id, workspace_id: 'ws', category: 'info', title: 'T', message: 'M', workspace: null })), error: null }).then(resolve);
        }
        if (table === 'workspace_users') return Promise.resolve({ data: [{ user_id: 'u1' }], error: null }).then(resolve);
        if (table === 'profiles') return Promise.resolve({ data: [{ id: 'u1', email: 'member@test.local', full_name: 'M' }], error: null }).then(resolve);
        return Promise.resolve({ data: [], error: null }).then(resolve);
      },
    };
    return b;
  };
  const globals = globalThis as unknown as Record<string, unknown>;
  const key = `ann_${crypto.randomUUID().replaceAll('-', '')}`;
  globals[key] = {
    ...security, ...cors,
    requireCronOrStaff: () => Promise.resolve({ valid: true, userId: opts.userId }),
    createClient: () => ({ from: builder }),
    resolveLocalesByEmails: () => Promise.resolve(new Map()),
    fetch: (_u: unknown, init: RequestInit) => { sends.push(init.body); return Promise.resolve(new Response('{}')); },
    Deno: { env: { get: () => 'test-only-value' } },
  };
  const source = await Deno.readTextFile(new URL('../send-announcement-email/index.ts', import.meta.url));
  const names = Object.keys(globals[key] as object).filter(n => !new RegExp(`(?:function|const) ${n}\\b`).test(source)).join(',');
  const code = `const { ${names} } = globalThis.${key};\n` + source.replace(/^import\s+[\s\S]*?;\s*$/gm, '').replace(/(?:Deno\.serve|serve)\(async\s*\(/, 'export default (async (');
  const mod = await import(`data:application/typescript;base64,${btoa(unescape(encodeURIComponent(code)))}`);
  const run = (body: unknown) => mod.default(new Request('https://app.test', { method: 'POST', headers: { Authorization: 'Bearer t' }, body: JSON.stringify(body) })) as Promise<Response>;
  return { filters, sends, run };
}

const ID = '11111111-1111-1111-1111-111111111111';

Deno.test('staff caller can only claim own, unsent, email-enabled announcements', async () => {
  const f = await setup({ claimed: [], userId: 'staff-a' });
  const res = await f.run({ announcement_ids: [ID] });
  assertEquals(res.status, 200);
  assertEquals(f.sends.length, 0);
  assertEquals(f.filters.some(([o, c, v]) => o === 'eq' && c === 'created_by' && v === 'staff-a'), true);
  assertEquals(f.filters.some(([o, c, v]) => o === 'is' && c === 'email_sent_at' && v === null), true);
  assertEquals(f.filters.some(([o, c, v]) => o === 'eq' && c === 'send_email' && v === true), true);
});

Deno.test('claimed announcement is emailed once to workspace members', async () => {
  const f = await setup({ claimed: [ID], userId: 'staff-a' });
  const res = await f.run({ announcement_ids: [ID] });
  assertEquals(res.status, 200);
  assertEquals(f.sends.length, 1);
});

Deno.test('malformed announcement ids are rejected before any send', async () => {
  const f = await setup({ claimed: [ID], userId: 'staff-a' });
  const res = await f.run({ announcement_ids: ['not-a-uuid'] });
  assertEquals(res.status, 400);
  assertEquals(f.sends.length, 0);
});
