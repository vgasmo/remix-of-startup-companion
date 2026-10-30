import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ userId: 'consultor-a' as string | null, eq: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: state.userId ? { id: state.userId } : null }) }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: {
  from: () => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'in', 'order']) chain[method] = () => chain;
    chain.eq = (...args: unknown[]) => { state.eq(...args); return chain; };
    chain.range = async () => ({ data: [], error: null });
    return chain;
  },
} }));
import { useWorkspaces } from './useWorkspaces';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}
describe('assigned-only portfolio', () => {
  beforeEach(() => { state.userId = 'consultor-a'; state.eq.mockClear(); });
  it('queries the primary consultant rather than historical memberships', async () => {
    const { result } = renderHook(() => useWorkspaces({}, true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(state.eq).toHaveBeenCalledWith('assigned_consultor_id', 'consultor-a');
  });
  it('preserves the explicit all-workspaces view', async () => {
    const { result } = renderHook(() => useWorkspaces({}, false), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(state.eq).not.toHaveBeenCalled();
  });
  it('never fetches an unscoped portfolio while signed out', () => {
    state.userId = null;
    const { result } = renderHook(() => useWorkspaces({}, true), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });
});