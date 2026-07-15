// In-memory ring buffer of recent console.error / console.warn calls
// plus window errors and unhandled rejections. Used by the in-app
// Bug Report form so users can send reproducible signal without asking
// them to copy/paste from DevTools.

export type ConsoleEntry = {
  ts: string;
  level: 'error' | 'warn' | 'window.error' | 'unhandledrejection';
  message: string;
  stack?: string;
};

const BUFFER_LIMIT = 30;
const buffer: ConsoleEntry[] = [];
let installed = false;

function push(entry: ConsoleEntry) {
  buffer.push(entry);
  if (buffer.length > BUFFER_LIMIT) buffer.shift();
}

function stringify(arg: unknown): string {
  if (arg instanceof Error) return arg.message;
  if (typeof arg === 'string') return arg;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

export function installConsoleBuffer() {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const origError = console.error;
  const origWarn = console.warn;

  console.error = (...args: unknown[]) => {
    try {
      const firstErr = args.find((a) => a instanceof Error) as Error | undefined;
      push({
        ts: new Date().toISOString(),
        level: 'error',
        message: args.map(stringify).join(' ').slice(0, 2000),
        stack: firstErr?.stack?.slice(0, 4000),
      });
    } catch { /* noop */ }
    return origError.apply(console, args as []);
  };

  console.warn = (...args: unknown[]) => {
    try {
      push({
        ts: new Date().toISOString(),
        level: 'warn',
        message: args.map(stringify).join(' ').slice(0, 2000),
      });
    } catch { /* noop */ }
    return origWarn.apply(console, args as []);
  };

  window.addEventListener('error', (event) => {
    push({
      ts: new Date().toISOString(),
      level: 'window.error',
      message: (event.message || 'window.error').slice(0, 2000),
      stack: event.error instanceof Error ? event.error.stack?.slice(0, 4000) : undefined,
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'unhandledrejection';
    push({
      ts: new Date().toISOString(),
      level: 'unhandledrejection',
      message: msg.slice(0, 2000),
      stack: reason instanceof Error ? reason.stack?.slice(0, 4000) : undefined,
    });
  });
}

export function getConsoleBuffer(): ConsoleEntry[] {
  return buffer.slice();
}

export function clearConsoleBuffer() {
  buffer.length = 0;
}
