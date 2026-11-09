import { act, cleanup, render, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ signOut: vi.fn(), refresh: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ signOut: state.signOut, session: {} }) }));
vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { refreshSession: state.refresh } } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn() } }));
import { SessionTimeoutWarning } from './SessionTimeoutWarning';

describe('session inactivity policy', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-09T12:00:00Z')); localStorage.clear(); state.signOut.mockReset(); state.refresh.mockReset().mockResolvedValue({ error: null }); });
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
  it('uses an eight-hour default and signs out only once', () => {
    render(<SessionTimeoutWarning />);
    act(() => vi.advanceTimersByTime(8 * 60 * 60 * 1000));
    expect(state.signOut).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(3000));
    expect(state.signOut).toHaveBeenCalledTimes(1);
  });
  it('uses recent activity from another tab', () => {
    render(<SessionTimeoutWarning timeoutMs={5000} warningTimeMs={2000} />);
    act(() => vi.advanceTimersByTime(4000));
    localStorage.setItem('sl-last-activity', String(Date.now()));
    act(() => vi.advanceTimersByTime(2000));
    expect(state.signOut).not.toHaveBeenCalled();
  });
  it('expires safely when storage access is denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    render(<SessionTimeoutWarning timeoutMs={3000} warningTimeMs={1000} />);
    act(() => vi.advanceTimersByTime(3000));
    expect(state.signOut).toHaveBeenCalledTimes(1);
  });
  it('does not extend inactivity after a failed refresh', async () => {
    state.refresh.mockResolvedValue({ error: new Error('offline') });
    render(<SessionTimeoutWarning timeoutMs={4000} warningTimeMs={2000} />);
    act(() => vi.advanceTimersByTime(2000));
    await act(async () => fireEvent.click(screen.getByText('sessionTimeout.continue')));
    act(() => vi.advanceTimersByTime(2000));
    expect(state.signOut).toHaveBeenCalledTimes(1);
  });
});
