import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/i18n', () => ({ default: { t: () => 'Sem permissão para esta ação.' } }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: () => {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'update', 'delete', 'eq', 'in']) chain[method] = () => chain;
  chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
  chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return chain;
} } }));
import { useUpdateActionItem, useDeleteActionItem, useBulkUpdateActions, useBulkDeleteActions } from './useActionItems';
import { useUpdateMilestone, useDeleteMilestone, useReorderMilestones } from './useMilestones';

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient({ defaultOptions: { mutations: { retry: false } } }) }, children);
}
describe('zero affected rows are denied', () => {
  const cases = [
    ['action update', () => useUpdateActionItem('w'), { id: 'a', status: 'completed' }],
    ['action delete', () => useDeleteActionItem('w'), 'a'],
    ['bulk action update', () => useBulkUpdateActions('w'), { ids: ['a'], status: 'completed' }],
    ['bulk action delete', () => useBulkDeleteActions('w'), ['a']],
    ['milestone update', () => useUpdateMilestone('w'), { id: 'm', status: 'completed' }],
    ['milestone delete', () => useDeleteMilestone('w'), 'm'],
    ['milestone reorder', () => useReorderMilestones('w'), [{ id: 'm', position: 1 }]],
  ] as const;
  for (const [name, hook, input] of cases) {
    it(name, async () => {
      const { result } = renderHook(hook, { wrapper });
      await act(async () => {
        await expect((result.current.mutateAsync as (value: unknown) => Promise<unknown>)(input))
          .rejects.toThrow('Sem permissão para esta ação.');
      });
      expect(result.current.isSuccess).toBe(false);
    });
  }
});