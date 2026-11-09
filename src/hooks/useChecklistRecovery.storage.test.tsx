import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useChecklistRecovery } from './useChecklistRecovery';

describe('checklist viewer storage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());
  it('keeps another viewer dismissal private when the user changes', () => {
    localStorage.setItem('founder_checklist_dismissed_alice', 'true');
    const { result, rerender } = renderHook(({ id }) => useChecklistRecovery(id), { initialProps: { id: 'alice' } });
    expect(result.current.isChecklistDismissed).toBe(true);
    rerender({ id: 'bob' });
    expect(result.current.isChecklistDismissed).toBe(false);
    act(() => result.current.dismissWelcome());
    expect(localStorage.getItem('founder_welcome_dismissed_bob')).toBe('true');
    expect(localStorage.getItem('founder_checklist_dismissed_alice')).toBe('true');
  });
  it('dismisses and restores in memory when writes and removals are denied', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('denied'); });
    const { result } = renderHook(() => useChecklistRecovery('alice'));
    act(() => { result.current.dismissChecklist(); result.current.dismissWelcome(); });
    expect(result.current.canRestore).toBe(true);
    act(() => result.current.restoreChecklist());
    expect(result.current.isChecklistDismissed).toBe(false);
    expect(result.current.isWelcomeDismissed).toBe(false);
  });
});
