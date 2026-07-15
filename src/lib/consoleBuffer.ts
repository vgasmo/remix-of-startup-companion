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

// Redact common secret shapes before persisting: JWTs, bearer tokens, emails,
// generic API-key-looking strings. Best-effort; never a substitute for not
// logging secrets in the first place.
const REDACTION_PATTERNS: Array<[RegExp, string]> = [
  [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, '[REDACTED_JWT]'],
  [/Bearer\s+[A-Za-z0-9._\-]{16,}/gi, 'Bearer [REDACTED]'],
  [/(sk|pk|rk)_(live|test)_[A-Za-z0-9]{16,}/g, '[REDACTED_KEY]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]'],
  [/\b(api[_-]?key|secret|token|password)["':\s=]+[A-Za-z0-9._\-]{8,}/gi, '$1=[REDACTED]'],
];

function redact(s: string | undefined): string | undefined {
  if (!s) return s;
  let out = s;
  for (const [re, repl] of REDACTION_PATTERNS) out = out.replace(re, repl);
  return out;
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
        message: redact(args.map(stringify).join(' ').slice(0, 2000))!,
        stack: redact(firstErr?.stack?.slice(0, 4000)),
      });
    } catch { /* noop */ }
    return origError.apply(console, args as []);
  };

  console.warn = (...args: unknown[]) => {
    try {
      push({
        ts: new Date().toISOString(),
        level: 'warn',
        message: redact(args.map(stringify).join(' ').slice(0, 2000))!,
      });
    } catch { /* noop */ }
    return origWarn.apply(console, args as []);
  };

  window.addEventListener('error', (event) => {
    push({
      ts: new Date().toISOString(),
      level: 'window.error',
      message: redact((event.message || 'window.error').slice(0, 2000))!,
      stack: redact(event.error instanceof Error ? event.error.stack?.slice(0, 4000) : undefined),
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'unhandledrejection';
    push({
      ts: new Date().toISOString(),
      level: 'unhandledrejection',
      message: redact(msg.slice(0, 2000))!,
      stack: redact(reason instanceof Error ? reason.stack?.slice(0, 4000) : undefined),
    });
  });
}

export function getConsoleBuffer(): ConsoleEntry[] {
  return buffer.slice();
}

export function clearConsoleBuffer() {
  buffer.length = 0;
}
