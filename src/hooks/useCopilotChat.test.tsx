import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareCopilotHistory, useCopilotChat } from './useCopilotChat';

vi.mock('@/lib/supabaseClient', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-only' } } }) } } }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/notify', () => ({ notify: { error: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('RC12 Copilot client', () => {
  it('limits history to 20 messages and content to 4000 characters', () => {
    const history = prepareCopilotHistory(Array.from({ length: 25 }, (_, i) => ({ role: 'user' as const, content: String(i) + 'x'.repeat(5000) })));
    expect(history).toHaveLength(20);
    expect(history[0].content.startsWith('5')).toBe(true);
    expect(history.every(m => m.content.length === 4000)).toBe(true);
  });
  it('keeps a response streaming beyond 25 seconds when data keeps arriving', async () => {
    vi.useFakeTimers();
    const encoder = new TextEncoder();
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    let signal: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      signal = init.signal;
      return new Response(new ReadableStream<Uint8Array>({ start(controller) { streamController = controller; } }));
    }));
    const { result } = renderHook(() => useCopilotChat());
    let sending: Promise<void> | undefined;
    await act(async () => { sending = result.current.send('hello'); });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
      streamController?.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"first"}}]}\n\n'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
      streamController?.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":" second"}}]}\n\ndata: [DONE]\n\n'));
      streamController?.close();
      await sending;
    });
    expect(signal?.aborted).toBe(false);
    expect(result.current.messages[1].content).toBe('first second');
    expect(result.current.isThinking).toBe(false);
  });
  it('allows retry after a transient network failure without reloading', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { result } = renderHook(() => useCopilotChat());
    await act(async () => { await result.current.send('hello'); });
    expect(result.current.isAvailable).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(14999); });
    expect(result.current.isAvailable).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(result.current.isAvailable).toBe(true);
  });
});