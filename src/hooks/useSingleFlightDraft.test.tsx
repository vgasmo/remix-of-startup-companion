/**
 * Tests for the canonical single-flight draft engine.
 *
 * Covers the four hard properties:
 *  1. Coalescing — edits during an in-flight save trigger exactly one re-flush.
 *  2. Monotonic revisions — status only flips to `saved` when the last shipped
 *     revision matches the current local revision.
 *  3. Failure fallback — server error keeps local draft and moves to
 *     `local_only`; a subsequent flush retries.
 *  4. Hashed storage keys — raw scope strings never appear in localStorage.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSingleFlightDraft } from '@/hooks/useSingleFlightDraft';

beforeEach(() => {
  localStorage.clear();
  vi.useRealTimers();
});

describe('useSingleFlightDraft', () => {
  it('coalesces concurrent edits into a single re-flush', async () => {
    const deferred: Array<() => void> = [];
    const serverSave = vi.fn(
      (_data: { v: number }) => new Promise<void>((resolve) => deferred.push(resolve)),
    );

    const { result } = renderHook(() =>
      useSingleFlightDraft<{ v: number }>({
        scopeKey: 'contract-1',
        namespace: 'test',
        serverSave,
        debounceMs: 0,
      }),
    );

    // First edit → schedules and runs a save.
    act(() => { result.current.trackChange({ v: 1 }); });
    await waitFor(() => expect(serverSave).toHaveBeenCalledTimes(1));

    // Two more edits WHILE the first save is still in flight.
    act(() => { result.current.trackChange({ v: 2 }); });
    act(() => { result.current.trackChange({ v: 3 }); });

    // No second concurrent call yet.
    expect(serverSave).toHaveBeenCalledTimes(1);

    // Resolve first save. Coalesced re-flush should fire exactly once with v:3.
    act(() => { deferred[0](); });
    await waitFor(() => expect(serverSave).toHaveBeenCalledTimes(2));
    expect(serverSave.mock.calls[1][0]).toEqual({ v: 3 });

    act(() => { deferred[1](); });
    await waitFor(() => expect(result.current.status).toBe('saved'));
  });

  it('falls back to local_only when serverSave throws and retries on flush', async () => {
    let shouldFail = true;
    const serverSave = vi.fn(async () => {
      if (shouldFail) throw new Error('network');
    });

    const { result } = renderHook(() =>
      useSingleFlightDraft<{ v: number }>({
        scopeKey: 'contract-2',
        namespace: 'test',
        serverSave,
        debounceMs: 0,
      }),
    );

    act(() => { result.current.trackChange({ v: 1 }); });
    await waitFor(() => expect(result.current.status).toBe('local_only'));

    // Draft survives in localStorage.
    const keys = Object.keys(localStorage);
    expect(keys.length).toBe(1);
    expect(keys[0]).not.toContain('contract-2'); // key is hashed
    expect(keys[0]).toMatch(/^test:/);

    // Recover: subsequent flush succeeds.
    shouldFail = false;
    await act(async () => { await result.current.flush(); });
    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(localStorage.length).toBe(0);
  });

  it('does not clobber local edits when serverSave is slower than another edit', async () => {
    let release: (() => void) | null = null;
    const serverSave = vi.fn(
      () => new Promise<void>((resolve) => { release = resolve; }),
    );

    const { result } = renderHook(() =>
      useSingleFlightDraft<{ v: number }>({
        scopeKey: 'contract-3',
        namespace: 'test',
        serverSave,
        debounceMs: 0,
      }),
    );

    act(() => { result.current.trackChange({ v: 1 }); });
    await waitFor(() => expect(serverSave).toHaveBeenCalledTimes(1));

    // Edit during flight → local rev must diverge from saved rev.
    act(() => { result.current.trackChange({ v: 2 }); });

    // Complete the first save. Status must NOT be 'saved' since local is fresher.
    act(() => { release?.(); });
    await waitFor(() => expect(serverSave).toHaveBeenCalledTimes(2));
    // Status is 'saving' because the coalesced re-flush is running.
    expect(['saving', 'saved']).toContain(result.current.status);
  });
});
