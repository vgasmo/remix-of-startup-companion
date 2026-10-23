/** Bound stalled requests while preserving caller cancellation. */
export function createFetchWithTimeout(fetcher: typeof fetch = fetch, timeoutMs = 30_000): typeof fetch {
  return async (input, init) => {
    const controller = new AbortController();
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const abort = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abort();
    else callerSignal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);
    try {
      return await fetcher(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', abort);
    }
  };
}