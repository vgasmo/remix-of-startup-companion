export const DEFAULT_TIMEOUT_MS = 30_000;
export const FUNCTION_TIMEOUT_MS = 180_000; // edge functions até ~150 s (IA, importações, PDF)
export const UPLOAD_TIMEOUT_MS = 600_000;   // uploads até 20 MB em ligações lentas

function requestInfo(input: RequestInfo | URL, init?: RequestInit): { url: string; method: string } {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  return { url, method };
}

/** Bound stalled requests while preserving caller cancellation. */
export function createFetchWithTimeout(
  fetcher: typeof fetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  functionTimeoutMs = FUNCTION_TIMEOUT_MS,
  uploadTimeoutMs = UPLOAD_TIMEOUT_MS,
): typeof fetch {
  return async (input, init) => {
    const { url, method } = requestInfo(input, init);
    const isWrite = method !== 'GET' && method !== 'HEAD';
    const isUpload = isWrite
      && url.includes('/storage/v1/object/')
      && !url.includes('/storage/v1/object/sign/')
      && !url.includes('/storage/v1/object/list/');
    const deadline = url.includes('/functions/v1/') ? Math.max(timeoutMs, functionTimeoutMs)
      : isUpload ? Math.max(timeoutMs, uploadTimeoutMs)
      : timeoutMs;
    const controller = new AbortController();
    const callerSignal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const abort = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) abort();
    else callerSignal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), deadline);
    try {
      return await fetcher(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', abort);
    }
  };
}
