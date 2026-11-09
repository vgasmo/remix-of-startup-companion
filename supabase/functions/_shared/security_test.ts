import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isAccountActive, requireCronOrStaff, requireCronOrGovernance, denyIfAccountInactive, createLogger } from './security.ts';

for (const [name, data, error, allowed] of [
  ['approved', true, null, true], ['suspended', false, null, false],
  ['missing profile', null, null, false], ['lookup error', true, { message: 'offline' }, false],
] as const) {
  Deno.test(`Privileged account guard: ${name}`, async () => {
    const client = { rpc: () => Promise.resolve({ data, error }) };
    assertEquals(await isAccountActive(client as never, 'admin-1'), allowed);
  });
}
for (const [state, data, error, status] of [
  ['approved', true, null, 200], ['pending', false, null, 403], ['suspended', false, null, 403],
  ['missing', null, null, 403], ['lookup failure', true, { message: 'offline' }, 403],
] as const) {
  Deno.test(`RC12 denyIfAccountInactive: ${state}`, async () => {
    const response = await denyIfAccountInactive(new Request('https://local.test'), { rpc: () => Promise.resolve({ data, error }) } as never, 'caller');
    assertEquals(response?.status ?? 200, status);
    if (response) assertEquals(await response.json(), { error: 'Account access denied', code: 'FORBIDDEN' });
  });
}
Deno.test('RC12 logger preserves error context without overriding severity', () => {
  const previous = console.error;
  let record: Record<string, unknown> = {};
  console.error = (value: unknown) => { record = JSON.parse(String(value)); };
  try {
    createLogger('fixture', 'request').error('failed', { status: 503, level: 'info', message: 'offline' });
    assertEquals(record.status, 503);
    assertEquals(record.level, 'error');
    assertEquals(record.errMsg, 'offline');
    assertEquals(record.msg, 'failed');
  } finally { console.error = previous; }
});
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