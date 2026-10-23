import { beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({
  intakeStatus: 'signature_sent',
  crmFails: false,
  writes: [] as Array<{ table: string; payload: Record<string, unknown> }>,
}));
vi.mock('@/lib/supabaseClient', () => ({ supabase: {
  from(table: string) {
    let payload: Record<string, unknown> | undefined;
    const result = () => {
      if (payload) {
        fake.writes.push({ table, payload });
        if (table === 'contract_intakes') fake.intakeStatus = String(payload.status);
        return { error: table === 'funnel_items' && fake.crmFails ? { message: 'offline' } : null };
      }
      return { data: { id: 'intake-1', status: fake.intakeStatus, funnel_item_id: 'lead-1' }, error: null };
    };
    const chain = {
      select: () => chain, eq: () => chain, order: () => chain, limit: () => chain,
      update: (value: Record<string, unknown>) => { payload = value; return chain; },
      insert: (value: Record<string, unknown>) => { payload = value; return chain; },
      maybeSingle: async () => result(),
      then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return chain;
  },
} }));
vi.mock('@/lib/invokeWithAuth', () => ({ invokeWithAuth: vi.fn() }));
vi.mock('@/lib/analytics', () => ({ track: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
import { syncIntakeOnContractEvent } from './contractLifecycleSync';

describe('manual contract lifecycle replay', () => {
  beforeEach(() => { fake.intakeStatus = 'signature_sent'; fake.crmFails = false; fake.writes = []; });
  it('repairs the CRM after intake succeeded but CRM failed', async () => {
    fake.crmFails = true;
    expect((await syncIntakeOnContractEvent('contract-1', 'signed')).error).toBe('crm_sync: offline');
    expect(fake.intakeStatus).toBe('signed');
    fake.crmFails = false;
    fake.writes = [];
    expect((await syncIntakeOnContractEvent('contract-1', 'signed')).synced).toBe(true);
    expect(fake.writes).toEqual([{ table: 'funnel_items', payload: { stage: 'contracted' } }]);
  });
  it('does not regress an activated intake on an older signature event', async () => {
    fake.intakeStatus = 'activated';
    expect((await syncIntakeOnContractEvent('contract-1', 'signature_sent')).error).toBe('would_regress');
    expect(fake.writes).toEqual([]);
  });
  it('never reopens a cancelled intake on signature replay', async () => {
    fake.intakeStatus = 'cancelled';
    expect((await syncIntakeOnContractEvent('contract-1', 'signed')).error).toBe('would_regress');
    expect(fake.intakeStatus).toBe('cancelled');
    expect(fake.writes).toEqual([]);
  });
});