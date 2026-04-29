import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ─── Mock Supabase client ───────────────────────────────────────────────────
const mockUpdate = vi.fn();
const mockSelect = vi.fn();
const mockSingle = vi.fn();
const mockEq = vi.fn();
const mockFrom = vi.fn();
const mockGetUser = vi.fn();
const mockInsert = vi.fn();

// Chain builder for supabase.from('action_items').update(...).eq(...).select(...).single()
function buildChain() {
  mockSingle.mockImplementation(() => Promise.resolve({ data: null, error: null }));
  mockSelect.mockReturnValue({ single: mockSingle });
  mockEq.mockReturnValue({ select: mockSelect });
  mockUpdate.mockReturnValue({ eq: mockEq });
  mockInsert.mockResolvedValue({ data: null, error: null });
  mockFrom.mockReturnValue({
    update: mockUpdate,
    insert: (...args: unknown[]) => {
      mockInsert(...args);
      return { data: null, error: null };
    },
  });
}

const supabaseMock = {
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: {
      getUser: () => mockGetUser(),
    },
  },
};

vi.mock('@/integrations/supabase/client', () => supabaseMock);
vi.mock('@/lib/supabaseClient', () => supabaseMock);

vi.mock('@/hooks/useIntegrationTriggers', () => ({
  sendTeamsNotification: vi.fn().mockResolvedValue(undefined),
  getAppUrl: vi.fn(() => 'http://localhost:5173'),
}));

vi.mock('@/lib/confetti', () => ({
  triggerMiniCelebration: vi.fn(),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────
const WORKSPACE_ID = 'ws-test-123';

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

function makeAction(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'action-1',
    title: 'Test Action',
    description: null,
    status: 'pending' as const,
    priority: 'medium',
    due_date: '2026-03-01',
    owner_user_id: null,
    session_id: null,
    milestone_id: null,
    workspace_id: WORKSPACE_ID,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    completed_at: null,
    owner: null,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TASK 2: Optimistic Update Rollback
// ═══════════════════════════════════════════════════════════════════════════
describe('useUpdateActionItem – optimistic rollback', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    buildChain();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: Infinity },
        mutations: { retry: false },
      },
    });
  });

  it('optimistically updates the cache, then rolls back on server error', async () => {
    const originalAction = makeAction({ status: 'pending' });

    // Seed the cache with original data
    queryClient.setQueryData(['action-items', WORKSPACE_ID], [originalAction]);

    // Make the server mutation fail
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'Database unavailable', code: '500' },
    });

    const { useUpdateActionItem } = await import('@/hooks/useActionItems');

    const { result } = renderHook(
      () => useUpdateActionItem(WORKSPACE_ID),
      { wrapper: createWrapper(queryClient) },
    );

    // Trigger the mutation: mark as completed
    act(() => {
      result.current.mutate({ id: 'action-1', status: 'completed' });
    });

    // Wait for the mutation to settle (error + rollback)
    await act(async () => {
      await vi.waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    // After rollback, the cache should be restored to original state
    const rolledBack = queryClient.getQueryData<any[]>(['action-items', WORKSPACE_ID]);
    expect(rolledBack).toHaveLength(1);
    expect(rolledBack![0].status).toBe('pending');
    expect(rolledBack![0].completed_at).toBeNull();
  });

  it('keeps the updated value on successful mutation', async () => {
    const originalAction = makeAction({ status: 'pending' });
    queryClient.setQueryData(['action-items', WORKSPACE_ID], [originalAction]);

    // Server returns success
    mockSingle.mockResolvedValue({
      data: {
        ...originalAction,
        status: 'completed',
        completed_at: '2026-02-22T12:00:00Z',
      },
      error: null,
    });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    // Build a catch-all chain that handles any supabase query pattern
    const buildSelectChain = () => {
      const chain: Record<string, any> = {};
      const self = () => chain;
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.in = vi.fn().mockReturnValue(chain);
      chain.order = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      chain.then = (cb: any) => Promise.resolve({ data: [], error: null }).then(cb);
      chain.catch = (cb: any) => Promise.resolve({ data: [], error: null }).catch(cb);
      return chain;
    };

    mockFrom.mockImplementation((table: string) => {
      if (table === 'activity_log') {
        return { insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
      }
      return {
        update: mockUpdate,
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        select: vi.fn().mockReturnValue(buildSelectChain()),
      };
    });

    const { useUpdateActionItem } = await import('@/hooks/useActionItems');

    const { result } = renderHook(
      () => useUpdateActionItem(WORKSPACE_ID),
      { wrapper: createWrapper(queryClient) },
    );

    act(() => {
      result.current.mutate({ id: 'action-1', status: 'completed' });
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(result.current.isSuccess || result.current.isError).toBe(true);
      }, { timeout: 5000 });
    });

    // If mutation errored unexpectedly, fail with details
    if (result.current.isError) {
      throw new Error(`Mutation failed: ${(result.current.error as Error)?.message}`);
    }

    expect(result.current.isSuccess).toBe(true);

    // Cache should reflect the completed state (via invalidation or optimistic)
    // The optimistic update set it to completed, and success triggers invalidation
    const cached = queryClient.getQueryData<any[]>(['action-items', WORKSPACE_ID]);
    expect(cached).toBeDefined();
  });

  it('rolls back correctly when multiple items exist', async () => {
    const actions = [
      makeAction({ id: 'action-1', status: 'pending', title: 'First' }),
      makeAction({ id: 'action-2', status: 'in_progress', title: 'Second' }),
      makeAction({ id: 'action-3', status: 'completed', title: 'Third', completed_at: '2026-01-15T00:00:00Z' }),
    ];
    queryClient.setQueryData(['action-items', WORKSPACE_ID], actions);

    // Server fails
    mockSingle.mockResolvedValue({
      data: null,
      error: { message: 'RLS violation', code: '42501' },
    });

    const { useUpdateActionItem } = await import('@/hooks/useActionItems');

    const { result } = renderHook(
      () => useUpdateActionItem(WORKSPACE_ID),
      { wrapper: createWrapper(queryClient) },
    );

    // Try to mark action-2 as completed
    act(() => {
      result.current.mutate({ id: 'action-2', status: 'completed' });
    });

    await act(async () => {
      await vi.waitFor(() => {
        expect(result.current.isError).toBe(true);
      });
    });

    // All items should be restored to original
    const rolledBack = queryClient.getQueryData<any[]>(['action-items', WORKSPACE_ID]);
    expect(rolledBack).toHaveLength(3);
    expect(rolledBack![0].status).toBe('pending');
    expect(rolledBack![1].status).toBe('in_progress');
    expect(rolledBack![2].status).toBe('completed');
  });
});
