import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { useFounderStuckSignal } from './useFounderStuckSignal';

// Mocked auth profile
const authState: { roles: string[]; profile: { id?: string } } = {
  roles: ['founder'],
  profile: { id: 'user-1' },
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter initialEntries={['/dashboard']}>{children}</MemoryRouter>
);

function renderStuck(opts: Parameters<typeof useFounderStuckSignal>[0] = {}) {
  return renderHook(() => useFounderStuckSignal(opts), { wrapper });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  authState.roles = ['founder'];
  authState.profile = { id: 'user-1' };
  vi.useFakeTimers();
  // Cleanup any leftover dialog nodes
  document.body.innerHTML = '';
});

describe('useFounderStuckSignal', () => {
  it('does not trigger for non-founders', () => {
    authState.roles = ['consultor'];
    const { result } = renderStuck();
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(result.current.show).toBe(false);
  });

  it('respects the 20s initial grace and triggers after ~50s of inactivity', () => {
    const { result } = renderStuck({ initialGraceMs: 20_000, inactivityMs: 50_000 });

    // Before grace: should not show even after 19s
    act(() => { vi.advanceTimersByTime(19_000); });
    expect(result.current.show).toBe(false);

    // After grace + inactivity: poll runs every 5s
    act(() => { vi.advanceTimersByTime(40_000); }); // total 59s
    expect(result.current.show).toBe(true);
  });

  it('does not show while another modal is open', () => {
    // Simulate a Radix dialog open in the DOM
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('data-state', 'open');
    document.body.appendChild(dialog);

    const { result } = renderStuck();
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(result.current.show).toBe(false);
  });

  it('only shows once per session even across remounts', () => {
    const first = renderStuck();
    act(() => { vi.advanceTimersByTime(80_000); });
    expect(first.result.current.show).toBe(true);

    // Acknowledge and remount
    act(() => { first.result.current.acknowledge(); });
    first.unmount();

    const second = renderStuck();
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(second.result.current.show).toBe(false);
  });

  it('persists dismissal per user/page so it does not return immediately', () => {
    const first = renderStuck();
    act(() => { vi.advanceTimersByTime(80_000); });
    expect(first.result.current.show).toBe(true);
    act(() => { first.result.current.dismiss(); });
    first.unmount();

    // Clear session-once flag to isolate the per-page dismissal check
    sessionStorage.clear();

    const second = renderStuck();
    act(() => { vi.advanceTimersByTime(120_000); });
    expect(second.result.current.show).toBe(false);
  });

  it('honors forceTrigger when eligible', () => {
    const { result } = renderStuck({ forceTrigger: true });
    // forceTrigger fires on mount effect
    act(() => { vi.advanceTimersByTime(0); });
    expect(result.current.show).toBe(true);
  });
});
