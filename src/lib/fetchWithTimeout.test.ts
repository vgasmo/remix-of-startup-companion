import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFetchWithTimeout } from './fetchWithTimeout';

const stalled: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
  const signal = init?.signal;
  if (signal?.aborted) reject(signal.reason);
  else signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
});

describe('request cancellation', () => {
  afterEach(() => vi.useRealTimers());
  it('allows function requests 180 seconds before timing out', async () => {
    vi.useFakeTimers();
    const pending = createFetchWithTimeout(stalled)('https://example.test/functions/v1/import');
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(179_999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });
  it('allows object uploads 600 seconds before timing out', async () => {
    vi.useFakeTimers();
    const pending = createFetchWithTimeout(stalled)('https://example.test/storage/v1/object/documents/a', { method: 'POST' });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(599_999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
  });
  it('does not extend signing requests beyond 30 seconds', async () => {
    vi.useFakeTimers();
    const pending = createFetchWithTimeout(stalled)('https://example.test/storage/v1/object/sign/documents/a', { method: 'POST' });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });
  it('terminates a stalled request at its deadline', async () => {
    await expect(createFetchWithTimeout(stalled, 5)('https://example.test')).rejects.toMatchObject({ name: 'TimeoutError' });
  });
  it('preserves caller cancellation', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('Cancelled', 'AbortError'));
    await expect(createFetchWithTimeout(stalled)('https://example.test', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
  it('returns a completed request normally', async () => {
    const fetcher: typeof fetch = async () => new Response('ok');
    expect(await (await createFetchWithTimeout(fetcher)('https://example.test')).text()).toBe('ok');
  });
});