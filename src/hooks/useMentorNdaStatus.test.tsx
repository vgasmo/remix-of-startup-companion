import { createElement, type ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useMentorNdaStatus } from './useMentorNdaStatus';

const state = vi.hoisted(() => ({ rpc: vi.fn(), isStaff: false }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { rpc: state.rpc } }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'mentor-1' }, roles: ['mentor_externo'], isStaff: state.isStaff }),
}));
function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client }, children);
}
beforeEach(() => { state.rpc.mockReset(); state.isStaff = false; });
describe('NDA access verification', () => {
  it('blocks on a failed server verification, including after cached acceptance', async () => {
    state.rpc.mockResolvedValueOnce({ data: true, error: null });
    const { result } = renderHook(() => useMentorNdaStatus(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    state.rpc.mockResolvedValue({ data: null, error: new Error('unavailable') });
    await result.current.retryVerification();
    await waitFor(() => expect(result.current.verificationError).toBe(true));
  });
  it('requires the existing current-version NDA when the server returns false', async () => {
    state.rpc.mockResolvedValue({ data: false, error: null });
    const { result } = renderHook(() => useMentorNdaStatus(), { wrapper });
    await waitFor(() => expect(result.current.needsNda).toBe(true));
    expect(state.rpc).toHaveBeenCalledWith('has_accepted_nda', { _user_id: 'mentor-1', _nda_version: 'PT-NDA-2026-01' });
  });
  it('does not treat an invalid response as acceptance', async () => {
    state.rpc.mockResolvedValue({ data: null, error: null });
    const { result } = renderHook(() => useMentorNdaStatus(), { wrapper });
    await waitFor(() => expect(result.current.verificationError).toBe(true));
  });
  it('preserves staff exemption', async () => {
    state.isStaff = true;
    const { result } = renderHook(() => useMentorNdaStatus(), { wrapper });
    expect(result.current.needsNda).toBe(false);
    expect(result.current.verificationError).toBe(false);
    expect(state.rpc).not.toHaveBeenCalled();
  });
});