import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { syncIntakeOnCompleted } from './lifecycleSync.ts';

function fakeClient({ signed = true, memberError = false, active = false, crmError = false, intakeStatus = 'signed' } = {}) {
  const writes: Array<{ table: string; payload: Record<string, unknown> }> = [];
  const client = {
    rpc: () => Promise.resolve({ data: 'ws-1', error: null }),
    from(table: string) {
      let operation = 'read';
      let payload: Record<string, unknown> = {};
      const result = () => {
        if (operation !== 'read') {
          writes.push({ table, payload });
          return { data: [{ id: 'contract-1' }], error: table === 'funnel_items' && crmError ? { message: 'offline' } : null };
        }
        if (table === 'startup_contracts') return { data: { status: 'active', signed_at: signed ? '2026-10-23' : null, signature_status: signed ? 'completed' : 'partially_signed', workspace_id: 'ws-1' }, error: null };
        if (table === 'contract_intakes') return { data: { id: 'intake-1', status: intakeStatus, funnel_item_id: 'lead-1' }, error: null };
        if (table === 'workspace_users') return { count: active ? 1 : 0, error: memberError ? { message: 'offline' } : null };
        return { data: { status: active ? 'active' : 'rejected', blocked_at: null }, error: null };
      };
      const chain = {
        select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
        in: () => chain, is: () => chain,
        update: (p: Record<string, unknown>) => { operation = 'write'; payload = p; return chain; },
        insert: (p: Record<string, unknown>) => { operation = 'write'; payload = p; return chain; },
        maybeSingle: () => Promise.resolve(result()),
        then: (resolve: (v: unknown) => void) => resolve(result()),
      };
      return chain;
    },
  };
  return { client, writes };
}
Deno.test('Caller workspace never overrides the signed contract workspace', async () => {
  const { client } = fakeClient({ active: true });
  const result = await syncIntakeOnCompleted(client, 'contract-1', 'foreign-ws', null, 'test');
  assertEquals(result.workspaceId, 'ws-1');
});
Deno.test('Cancelled intake cannot reopen on signature replay', async () => {
  const { client, writes } = fakeClient({ active: true, intakeStatus: 'cancelled' });
  const result = await syncIntakeOnCompleted(client, 'contract-1', 'ws-1', null, 'test');
  assertEquals(result.synced, false);
  assertEquals(writes.some(w => w.table === 'contract_intakes'), false);
});
Deno.test('Incomplete signature cannot activate any entity', async () => {
  const { client, writes } = fakeClient({ signed: false });
  const result = await syncIntakeOnCompleted(client, 'contract-1', 'ws-1', null, 'test');
  assertEquals(result.synced, false);
  assertEquals(writes.length, 0);
});
Deno.test('No active member leaves intake signed and recovery armed', async () => {
  const { client, writes } = fakeClient();
  const result = await syncIntakeOnCompleted(client, 'contract-1', 'ws-1', null, 'test');
  assertEquals(result.awaitingFounder, true);
  assertEquals(writes.some(w => w.payload.status === 'activated'), false);
  assertEquals(writes.some(w => w.payload.activation_sync_pending === false), false);
});
Deno.test('Member lookup error prevents activation rather than assuming membership', async () => {
  const { client, writes } = fakeClient({ memberError: true });
  const result = await syncIntakeOnCompleted(client, 'contract-1', 'ws-1', null, 'test');
  assertEquals(result.synced, false);
  assertEquals(writes.some(w => w.table === 'workspaces' && w.payload.status === 'active'), false);
});
Deno.test('Verified workspace is activated before intake and recovery is cleared last', async () => {
  const { client, writes } = fakeClient({ active: true });
  const result = await syncIntakeOnCompleted(client, 'contract-1', 'ws-1', null, 'test');
  assertEquals(result.synced, true);
  const ws = writes.findIndex(w => w.table === 'workspaces');
  const intake = writes.findIndex(w => w.payload.status === 'activated');
  assertEquals(ws >= 0 && intake > ws, true);
  assertEquals(writes.at(-1)?.payload.activation_sync_pending, false);
});
Deno.test('Retry repairs CRM even when intake is already activated', async () => {
  const { client, writes } = fakeClient({ active: true, intakeStatus: 'activated' });
  const result = await syncIntakeOnCompleted(client, 'contract-1', 'ws-1', null, 'test');
  assertEquals(result.synced, true);
  assertEquals(writes.some(w => w.table === 'funnel_items' && w.payload.stage === 'contracted'), true);
});
Deno.test('CRM failure keeps durable recovery pending', async () => {
  const { client, writes } = fakeClient({ active: true, crmError: true });
  const result = await syncIntakeOnCompleted(client, 'contract-1', 'ws-1', null, 'test');
  assertEquals(result.synced, false);
  assertEquals(writes.some(w => w.payload.activation_sync_pending === false), false);
});