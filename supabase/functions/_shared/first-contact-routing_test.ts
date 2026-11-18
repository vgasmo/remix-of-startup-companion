import { assertEquals, assertRejects } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { resolveFirstContactRoute, listFirstContactConsultants, NoRouteError } from './first-contact-routing.ts';

function fixture(owner: string | null, index = 0) {
  let writes = 0;
  const client = { from(table: string) {
    const chain = {
      select: () => chain, eq: () => chain,
      update: () => { writes++; return chain; },
      maybeSingle: async () => ({ data: table === 'public_booking_links'
        ? { id: 'link', owner_consultant_id: owner, active: true }
        : table === 'profiles' ? { full_name: 'Consultor', account_status: 'approved' }
        : { round_robin_index: 1 } }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ id: 'route', scope: 'global', active: true, mode: 'round_robin', consultant_ids: ['a', 'b'], round_robin_index: index }] }).then(resolve),
    };
    return chain;
  } };
  return { client, writes: () => writes };
}

Deno.test('fixed owner cannot be overridden by the displayed expectation', async () => {
  const f = fixture('a');
  await assertRejects(() => resolveFirstContactRoute({ supabase: f.client, token: 'test', expectedConsultantId: 'b' }), NoRouteError, 'consultant_changed');
  assertEquals(f.writes(), 0);
});
Deno.test('changed round robin preview refuses before any routing write', async () => {
  const f = fixture(null, 1);
  await assertRejects(() => resolveFirstContactRoute({ supabase: f.client, token: 'test', expectedConsultantId: 'b' }), NoRouteError, 'consultant_changed');
  assertEquals(f.writes(), 0);
});
Deno.test('matching preview keeps the expected recipient', async () => {
  const f = fixture(null);
  const result = await resolveFirstContactRoute({ supabase: f.client, token: 'test', expectedConsultantId: 'b' });
  assertEquals(result.consultantId, 'b');
  assertEquals(f.writes(), 1);
});

Deno.test('explicit choice in the authorized route selects that consultant without advancing rotation', async () => {
  const f = fixture(null);
  const route = await resolveFirstContactRoute({ supabase: f.client, token: 'test', selectedConsultantId: 'a', expectedConsultantId: 'a' });
  assertEquals(route.consultantId, 'a');
  assertEquals(f.writes(), 0);
});
Deno.test('explicit choice outside the authorized route is refused before writes', async () => {
  const f = fixture(null);
  await assertRejects(() => resolveFirstContactRoute({ supabase: f.client, token: 'test', selectedConsultantId: 'outsider' }), NoRouteError, 'consultant_not_available');
  assertEquals(f.writes(), 0);
});
Deno.test('explicit choice cannot override a fixed-owner link', async () => {
  const f = fixture('a');
  await assertRejects(() => resolveFirstContactRoute({ supabase: f.client, token: 'test', selectedConsultantId: 'b' }), NoRouteError, 'consultant_not_available');
  assertEquals(f.writes(), 0);
});
Deno.test('consultant menu excludes suspended accounts and exposes no email', async () => {
  const f = fixture(null);
  const client = { from(table: string) {
    if (table === 'intake_routing') {
      const chain = {
        select: () => chain, eq: () => chain,
        maybeSingle: async () => ({ data: { consultant_ids: ['a', 's'] } }),
        then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [{ id: 'route', scope: 'global', mode: 'single', consultant_ids: ['a', 's'] }] }).then(resolve),
      };
      return chain;
    }
    if (table !== 'profiles') return f.client.from(table);
    const chain = {
      select: () => chain, eq: () => chain,
      maybeSingle: async () => ({ data: { full_name: 'Ana', account_status: 'approved' } }),
      in: async (_field: string, ids: string[]) => ({ data: [
        { id: 'a', full_name: 'Ana', email: 'private@example.com', account_status: 'approved' },
        { id: 's', full_name: 'Suspenso', account_status: 'suspended' },
      ].filter(p => ids.includes(p.id)) }),
    };
    return chain;
  } };
  assertEquals(await listFirstContactConsultants({ supabase: client, token: 'test' }), [{ id: 'a', name: 'Ana' }]);
});