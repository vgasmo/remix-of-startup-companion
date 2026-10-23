import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isAccountActive, requireCronOrStaff, requireCronOrGovernance } from './security.ts';

for (const [name, data, error, allowed] of [
  ['approved', true, null, true], ['suspended', false, null, false],
  ['missing profile', null, null, false], ['lookup error', true, { message: 'offline' }, false],
] as const) {
  Deno.test(`Privileged account guard: ${name}`, async () => {
    const client = { rpc: () => Promise.resolve({ data, error }) };
    assertEquals(await isAccountActive(client as never, 'admin-1'), allowed);
  });
}
for (const guard of [requireCronOrStaff, requireCronOrGovernance]) {
  Deno.test(`${guard.name} denies a suspended admin with a valid session`, async () => {
    const req = new Request('https://local.test', { headers: { Authorization: 'Bearer test-session' } });
    const user = { auth: { getUser: () => Promise.resolve({ data: { user: { id: 'admin-1' } }, error: null }) } };
    const chain = { select: () => chain, eq: () => Promise.resolve({ data: [{ role: 'admin' }] }) };
    const admin = { from: () => chain, rpc: () => Promise.resolve({ data: false, error: null }) };
    const result = await guard(req, user as never, admin as never);
    assertEquals('error' in result ? result.error.status : 200, 403);
  });
}