import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { canMutateWorkspace } from './workspaceWrite.ts';

for (const [name, active, write, plan, error, allowed] of [
  ['reader', true, false, true, null, false],
  ['writer', true, true, true, null, true],
  ['suspended admin', false, true, true, null, false],
  ['pending user', null, true, true, null, false],
  ['permission lookup error', true, true, true, { message: 'offline' }, false],
  ['external mentor financial', true, true, false, null, false],
] as const) {
  Deno.test(`Workspace mutation: ${name}`, async () => {
    const calls: string[] = [];
    const user = { rpc: (name: string) => { calls.push(name); return Promise.resolve({ data: name === 'can_write_workspace' ? write : plan, error }); } };
    const admin = { rpc: () => Promise.resolve({ data: active, error: null }) };
    assertEquals(await canMutateWorkspace(user as never, admin as never, 'user', 'workspace', true), allowed);
    if (!active) assertEquals(calls, []);
  });
}