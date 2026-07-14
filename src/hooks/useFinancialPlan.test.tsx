// Hook tests for the Guided Financial Plan mutations.
// Focuses on the two hardest-to-eyeball paths:
//   1. useSaveAssumption — builds the correct upsert payload, incl. scenario.
//   2. useResolvePrefillProposal — "accept" materializes the proposal into
//      financial_assumptions AND flips the proposal row to 'accepted'.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { createElement } from 'react';

// ---- Supabase mock plumbing ------------------------------------------------
// The default mock in src/test/mocks/supabase.ts returns generic thenables.
// Here we build a fluent recorder that captures each .from(table) call and
// records the operation + payload.

interface Call {
  table: string;
  op: 'upsert' | 'update' | 'delete' | 'insert' | 'select';
  payload?: unknown;
  filters: Record<string, unknown>;
}

// vi.mock is hoisted, so any state referenced inside a factory must be created
// via vi.hoisted() so it too is hoisted alongside the mock.
const state = vi.hoisted(() => {
  const calls: any[] = [];
  return { calls };
});

vi.mock('@/lib/supabaseClient', () => {
  function makeChain(table: string) {
    const current = { table, op: 'select' as const, filters: {} as Record<string, unknown> } as any;
    const chain: any = {
      select: () => chain,
      order: () => chain,
      eq: (k: string, v: unknown) => { current.filters[k] = v; return chain; },
      upsert: (rows: unknown) => { current.op = 'upsert'; current.payload = rows; return chain; },
      update: (patch: unknown) => { current.op = 'update'; current.payload = patch; return chain; },
      insert: (rows: unknown) => { current.op = 'insert'; current.payload = rows; return chain; },
      delete: () => { current.op = 'delete'; return chain; },
      single: () => {
        state.calls.push(current);
        const row = Array.isArray(current.payload) ? (current.payload as any[])[0] : current.payload;
        return Promise.resolve({ data: row ?? null, error: null });
      },
      maybeSingle: () => {
        state.calls.push(current);
        return Promise.resolve({ data: null, error: null });
      },
      then: (resolve: (v: { data: null; error: null }) => void) => {
        state.calls.push(current);
        resolve({ data: null, error: null });
      },
    };
    return chain;
  }
  const supabase = {
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: (table: string) => makeChain(table),
  };
  return { supabase, supabaseClient: supabase };
});
vi.mock('@/integrations/supabase/client', async () => {
  const mod = await import('@/lib/supabaseClient');
  return { supabase: (mod as any).supabase };
});
vi.mock('@/lib/invokeWithAuth', () => ({
  invokeWithAuth: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
}));

const calls: Call[] = state.calls as Call[];


// Import AFTER the mocks so the hook binds to the mocked client.
import { useSaveAssumption, useResolvePrefillProposal, FinancialPrefillProposal } from '@/hooks/useFinancialPlan';

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe('useSaveAssumption', () => {
  it('upserts on financial_assumptions with the correct scenario and owner', async () => {
    const { result } = renderHook(() => useSaveAssumption('ws-1'), { wrapper });

    await result.current.mutateAsync({
      key: 'revenue.item1.growth',
      scenario: 'conservative',
      value_numeric: 10,
      unit: '%',
      source: 'founder',
      rationale: 'Derived from slider',
    });

    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const upsert = calls.find(c => c.op === 'upsert' && c.table === 'financial_assumptions');
    expect(upsert, 'should have upserted into financial_assumptions').toBeDefined();

    const payload = (upsert!.payload as any[])[0];
    expect(payload).toMatchObject({
      workspace_id: 'ws-1',
      scenario: 'conservative',
      key: 'revenue.item1.growth',
      value_numeric: 10,
      unit: '%',
      source: 'founder',
      rationale: 'Derived from slider',
      owner_user_id: 'user-1',
    });
    // `last_validated_at` is auto-stamped so it should be an ISO string
    expect(typeof payload.last_validated_at).toBe('string');
  });

  it('defaults scenario to "base" and source to "founder"', async () => {
    const { result } = renderHook(() => useSaveAssumption('ws-2'), { wrapper });
    await result.current.mutateAsync({ key: 'macro.growth_rate', value_numeric: 8 });

    const upsert = calls.find(c => c.op === 'upsert' && c.table === 'financial_assumptions');
    const payload = (upsert!.payload as any[])[0];
    expect(payload.scenario).toBe('base');
    expect(payload.source).toBe('founder');
  });
});

describe('useResolvePrefillProposal', () => {
  const proposal: FinancialPrefillProposal = {
    id: 'prop-1',
    workspace_id: 'ws-1',
    scenario: 'base',
    key: 'tax.irc_rate',
    period_index: null,
    proposed_value_numeric: 21,
    proposed_value_json: null,
    unit: '%',
    source: 'prefill_profile',
    evidence: { rule: 'Portugal IRC' },
    status: 'pending',
    reviewed_by: null,
    reviewed_at: null,
    created_at: '',
    updated_at: '',
  };

  it('accept: upserts into financial_assumptions AND flips proposal to accepted', async () => {
    const { result } = renderHook(() => useResolvePrefillProposal('ws-1'), { wrapper });
    await result.current.mutateAsync({ proposal, action: 'accept' });

    const upsert = calls.find(c => c.op === 'upsert' && c.table === 'financial_assumptions');
    expect(upsert, 'materialization missing').toBeDefined();
    const payload = (upsert!.payload as any[])[0];
    expect(payload).toMatchObject({
      workspace_id: 'ws-1',
      scenario: 'base',
      key: 'tax.irc_rate',
      value_numeric: 21,
      unit: '%',
      source: 'prefill_profile',
    });

    const update = calls.find(c => c.op === 'update' && c.table === 'financial_prefill_proposals');
    expect(update, 'proposal not updated').toBeDefined();
    expect((update!.payload as any).status).toBe('accepted');
    expect((update!.payload as any).reviewed_by).toBe('user-1');
  });

  it('reject: does NOT touch financial_assumptions and marks proposal rejected', async () => {
    const { result } = renderHook(() => useResolvePrefillProposal('ws-1'), { wrapper });
    await result.current.mutateAsync({ proposal, action: 'reject' });

    const upsert = calls.find(c => c.op === 'upsert' && c.table === 'financial_assumptions');
    expect(upsert, 'reject should not materialize').toBeUndefined();

    const update = calls.find(c => c.op === 'update' && c.table === 'financial_prefill_proposals');
    expect((update!.payload as any).status).toBe('rejected');
  });
});
