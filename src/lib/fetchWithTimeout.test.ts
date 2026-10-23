import { describe, expect, it } from 'vitest';
import { createFetchWithTimeout } from './fetchWithTimeout';

const stalled: typeof fetch = async (_input, init) => new Promise<Response>((_resolve, reject) => {
  const signal = init?.signal;
  if (signal?.aborted) reject(signal.reason);
  else signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
});

describe('request cancellation', () => {
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