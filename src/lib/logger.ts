/**
 * Structured Logger — Operational diagnostics for V1 launch.
 * 
 * Centralizes logging with structured events, severity levels, and context.
 * Designed to be easily connected to Sentry or similar in V2.
 * 
 * Usage:
 *   import { logger } from '@/lib/logger';
 *   logger.error('claim_failed', { userId, email }, error);
 *   logger.warn('cache_mismatch', { expected: uid1, actual: uid2 });
 *   logger.info('session_reset', { reason: 'logout' });
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  event: string;
  context?: Record<string, unknown>;
  error?: unknown;
  timestamp: string;
}

const LOG_PREFIX = '[SL]';

function formatError(err: unknown): Record<string, unknown> | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack?.split('\n').slice(0, 3).join('\n') };
  }
  return { raw: String(err) };
}

// In-memory buffer for error events (last 50) — accessible via logger.getRecentErrors()
const errorBuffer: LogEntry[] = [];
const MAX_ERROR_BUFFER = 50;

/**
 * Optional external sinks. `logError` (client_error_logs + Sentry forwarder) is
 * attached lazily below; extra sinks can be registered by app code/tests.
 * A sink must never throw and never call back into the logger.
 */
type LogSink = (entry: LogEntry) => void;
const sinks: LogSink[] = [];

export function registerLogSink(sink: LogSink): () => void {
  sinks.push(sink);
  return () => {
    const i = sinks.indexOf(sink);
    if (i >= 0) sinks.splice(i, 1);
  };
}

// Forward warn/error to the remote sink (Supabase `client_error_logs` +
// optional Sentry) so structured events are not console-only. Lazy import
// keeps this module free of a hard dependency at init time and avoids cycles.
let remoteForwardingEnabled = typeof window !== 'undefined';
// Hard cap per page session so a hot loop can never flood the sink.
const MAX_REMOTE_FORWARDS = 25;
let remoteForwards = 0;

function forwardRemote(entry: LogEntry) {
  if (!remoteForwardingEnabled) return;
  if (entry.level !== 'error') return; // warns stay local (buffer + console)
  if (remoteForwards >= MAX_REMOTE_FORWARDS) return;
  remoteForwards++;
  void (async () => {
    try {
      const { logError } = await import('@/lib/logError');
      const err = entry.error instanceof Error
        ? entry.error
        : new Error(`${entry.event}${entry.error ? `: ${String(entry.error)}` : ''}`);
      logError(err, {
        component: 'logger',
        action: entry.event,
        severity: entry.level === 'error' ? 'high' : 'low',
        tags: ['structured-logger', entry.level],
        metadata: entry.context,
      });
    } catch {
      // Never let observability break the app.
    }
  })();
}

/** Disable remote forwarding (used by tests and by opt-out paths). */
export function setRemoteLogForwarding(enabled: boolean) {
  remoteForwardingEnabled = enabled;
}

function emit(entry: LogEntry) {
  const { level, event, context, error } = entry;
  const tag = `${LOG_PREFIX} ${event}`;

  // Buffer errors for diagnostics
  if (level === 'error' || level === 'warn') {
    errorBuffer.push(entry);
    if (errorBuffer.length > MAX_ERROR_BUFFER) errorBuffer.shift();
    forwardRemote(entry);
  }

  for (const sink of sinks) {
    try {
      sink(entry);
    } catch {
      // A broken sink must not break logging.
    }
  }

  const payload = { ...context, ...(error ? { error: formatError(error) } : {}) };

  switch (level) {
    case 'error':
      console.error(tag, payload);
      break;
    case 'warn':
      console.warn(tag, payload);
      break;
    case 'info':
      console.info(tag, payload);
      break;
    case 'debug':
      if (import.meta.env.DEV) console.debug(tag, payload);
      break;
  }
}

export const logger = {
  debug(event: string, context?: Record<string, unknown>) {
    emit({ level: 'debug', event, context, timestamp: new Date().toISOString() });
  },
  info(event: string, context?: Record<string, unknown>) {
    emit({ level: 'info', event, context, timestamp: new Date().toISOString() });
  },
  warn(event: string, context?: Record<string, unknown>) {
    emit({ level: 'warn', event, context, timestamp: new Date().toISOString() });
  },
  error(event: string, context?: Record<string, unknown>, error?: unknown) {
    emit({ level: 'error', event, context, error, timestamp: new Date().toISOString() });
  },
  /** Get recent error/warn entries for diagnostics (max 50) */
  getRecentErrors(): ReadonlyArray<LogEntry> {
    return [...errorBuffer];
  },
  /** Flush the error buffer (e.g., after sending to external service) */
  flushErrors() {
    errorBuffer.length = 0;
  },
};
