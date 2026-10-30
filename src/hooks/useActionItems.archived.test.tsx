import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (table: string) => {
  const data = table === 'milestones' ? [{ id: 'archived' }] : [
    { id: 'hidden', milestone_id: 'archived', owner_user_id: null },
    { id: 'visible', milestone_id: 'current', owner_user_id: null },
    { id: 'unassigned', milestone_id: null, owner_user_id: null },
  ];
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'not', 'order']) chain[method] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve);
  return chain;
} } }));
import { useActionItems } from './useActionItems';
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}
describe('operational actions', () => {
  it('excludes archived milestone actions while retaining current and unassigned actions', async () => {
    const { result } = renderHook(() => useActionItems('workspace'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map(a => a.id)).toEqual(['visible', 'unassigned']);
  });
});