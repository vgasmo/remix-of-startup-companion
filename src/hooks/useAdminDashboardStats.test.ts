import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ error: null as null | Error }));
vi.mock('@/lib/supabaseClient', () => ({
  supabase: { from: () => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'lte', 'gte', 'or']) chain[method] = () => chain;
    chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ count: state.error ? null : 0, error: state.error }).then(resolve);
    return chain;
  } },
}));
import { useAdminDashboardStats } from './useAdminDashboardStats';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}
describe('dashboard statistics integrity', () => {
  it('reports a failed count as an error instead of zero', async () => {
    state.error = new Error('query denied');
    const { result, unmount } = renderHook(useAdminDashboardStats, { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
    unmount();
  });
  it('preserves a genuine empty count', async () => {
    state.error = null;
    const { result, unmount } = renderHook(useAdminDashboardStats, { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.pendingApprovalsCount).toBe(0);
    unmount();
  });
});