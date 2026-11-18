import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const mocks = vi.hoisted(() => ({ result: vi.fn(), success: vi.fn() }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: () => ({
  update: () => ({ eq: () => ({ select: () => ({ maybeSingle: mocks.result }) }) }),
}) } }));
vi.mock('@/lib/notify', () => ({ notify: { success: mocks.success, error: vi.fn() } }));
vi.mock('@/i18n', () => ({ default: { t: (key: string) => key } }));
import { useUpsertIntakeRoute } from '@/hooks/useIntakeRouting';

function setup() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return renderHook(() => useUpsertIntakeRoute(), { wrapper: ({ children }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}
describe('intake routing updates', () => {
  it('refuses zero affected rows instead of reporting success', async () => {
    mocks.result.mockResolvedValue({ data: null, error: null });
    mocks.success.mockClear();
    const { result } = setup();
    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'route-id', mode: 'single' })).rejects.toThrow('errors.noPermission');
    });
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it('preserves permitted updates that return the saved route', async () => {
    mocks.result.mockResolvedValue({ data: { id: 'route-id' }, error: null });
    const { result } = setup();
    await act(async () => {
      await expect(result.current.mutateAsync({ id: 'route-id', mode: 'single' })).resolves.toEqual({ id: 'route-id' });
    });
  });
});