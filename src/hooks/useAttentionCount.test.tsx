import { createElement, type ReactNode } from 'react';
import { renderHook, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  auth: { user: { id: 'consultant' } as { id: string } | null, isConsultor: true, isAdmin: false },
  count: 2 as number | null, error: null as Error | null,
  queries: [] as { table: string; methods: [string, unknown[]][] }[],
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (table: string) => {
  const query = { table, methods: [] as [string, unknown[]][] };
  state.queries.push(query);
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'lt', 'limit', 'not', 'is', 'order', 'range', 'or']) chain[method] = (...args: unknown[]) => { query.methods.push([method, args]); return chain; };
  chain.then = (resolve: (r: unknown) => unknown) => {
    const columns = String(query.methods.find(([m]) => m === 'select')?.[1][0]);
    const data = table === 'workspace_users' ? [{ workspace_id: 'historical' }] : table === 'milestones' ? [{ id: 'archived-milestone' }] : table === 'workspaces' ? columns === 'id' ? [{ id: 'primary' }] : [{ id: 'primary', health_score: 'critical', health_score_override: null }] : null;
    return Promise.resolve({ data, count: table === 'action_items' ? state.count : null, error: table === 'action_items' ? state.error : null }).then(resolve);
  };
  return chain;
} } }));
import { useAttentionCount } from './useAttentionCount';
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}
describe('attention count integrity', () => {
  beforeEach(() => { state.queries = []; state.count = 2; state.error = null; state.auth = { user: { id: 'consultant' }, isConsultor: true, isAdmin: false }; });
  afterEach(cleanup);
  it('scopes consultants to primary assignment, never historical membership', async () => {
    const { result } = renderHook(useAttentionCount, { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(state.queries.some(q => q.table === 'workspace_users')).toBe(false);
    const operational = state.queries.find(q => q.table === 'workspaces' && q.methods.some(([m, a]) => m === 'select' && String(a[0]).includes('health_score')));
    expect(operational?.methods).toContainEqual(['in', ['id', ['primary']]]);
    expect(result.current.data).toEqual({ criticalCount: 1, atRiskCount: 0, overdueCount: 2, totalAttention: 2 });
  });
  it('excludes actions on archived milestones without losing unlinked legacy actions', async () => {
    const { result } = renderHook(useAttentionCount, { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const countQuery = state.queries.find(q => q.table === 'action_items');
    expect(countQuery?.methods).toContainEqual(['or', ['milestone_id.is.null,milestone_id.not.in.(archived-milestone)']]);
  });
  it.each([new Error('query denied'), null])('never reports a failed or missing count as zero (%s)', async error => {
    state.error = error; state.count = null;
    const { result } = renderHook(useAttentionCount, { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
  it('does not fetch statistics without a user', () => {
    state.auth.user = null;
    const { result } = renderHook(useAttentionCount, { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(state.queries).toHaveLength(0);
  });
});
