/**
 * Structured error logging utility for client-side error capture
 * Provides consistent error formatting and future integration with monitoring services
 * P0: Enhanced with severity levels, breadcrumbs, and performance tracking
 */

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  workspaceId?: string;
  severity?: ErrorSeverity;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface LoggedError {
  errorId: string;
  message: string;
  name: string;
  stack?: string;
  context: ErrorContext;
  timestamp: string;
  url: string;
  userAgent: string;
  sessionDuration?: number;
  breadcrumbs?: Breadcrumb[];
}

export interface Breadcrumb {
  type: 'navigation' | 'click' | 'api' | 'error' | 'info';
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

// Session start time for duration tracking
const sessionStart = Date.now();

// Breadcrumb trail for debugging context
const breadcrumbs: Breadcrumb[] = [];
const MAX_BREADCRUMBS = 20;

/**
 * Add a breadcrumb for debugging context
 */
export function addBreadcrumb(crumb: Omit<Breadcrumb, 'timestamp'>): void {
  breadcrumbs.push({
    ...crumb,
    timestamp: new Date().toISOString(),
  });
  
  // Keep only last N breadcrumbs
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.shift();
  }
}

/**
 * Generate a unique error ID for support reference
 */
function generateErrorId(): string {
  return `ERR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

/**
 * Sanitize error message for logging (remove sensitive data)
 */
function sanitizeMessage(message: string): string {
  // Remove potential secrets/tokens from error messages
  return message
    .replace(/Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi, 'Bearer [REDACTED]')
    .replace(/password[=:]\s*\S+/gi, 'password=[REDACTED]')
    .replace(/secret[=:]\s*\S+/gi, 'secret=[REDACTED]')
    .replace(/token[=:]\s*\S+/gi, 'token=[REDACTED]')
    .replace(/key[=:]\s*[A-Za-z0-9\-_]{20,}/gi, 'key=[REDACTED]')
    .replace(/email[=:]\s*\S+@\S+/gi, 'email=[REDACTED]');
}

/**
 * Determine error severity based on error type and context
 */
function determineSeverity(error: Error, context: ErrorContext): ErrorSeverity {
  if (context.severity) return context.severity;
  
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  
  // Critical: auth, security, data loss
  if (message.includes('unauthorized') || message.includes('forbidden') || 
      message.includes('auth') || name.includes('security')) {
    return 'critical';
  }
  
  // High: network failures, API errors
  if (message.includes('network') || message.includes('fetch') || 
      message.includes('api') || name.includes('typeerror')) {
    return 'high';
  }
  
  // Medium: validation, user input errors
  if (message.includes('validation') || message.includes('invalid') ||
      message.includes('required')) {
    return 'medium';
  }
  
  return 'low';
}

/**
 * Log an error with structured context
 * This is the main entry point for error logging throughout the app
 */
export function logError(error: Error, context: ErrorContext = {}): LoggedError {
  const errorId = generateErrorId();
  const isDev = import.meta.env.DEV;
  const severity = determineSeverity(error, context);
  
  const loggedError: LoggedError = {
    errorId,
    message: sanitizeMessage(error.message),
    name: error.name,
    stack: isDev ? error.stack : undefined, // Only include stack in dev
    context: { ...context, severity },
    timestamp: new Date().toISOString(),
    url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    sessionDuration: Math.round((Date.now() - sessionStart) / 1000),
    breadcrumbs: [...breadcrumbs],
  };

  // Add error to breadcrumbs
  addBreadcrumb({
    type: 'error',
    message: sanitizeMessage(error.message),
    data: { errorId, severity },
  });

  // Console logging with severity-based styling
  const severityStyles: Record<ErrorSeverity, string> = {
    critical: 'color: #ff0000; font-weight: bold',
    high: 'color: #ff6600; font-weight: bold',
    medium: 'color: #ffcc00',
    low: 'color: #999999',
  };

  console.error(
    `%c[${severity.toUpperCase()}] [${errorId}]`,
    severityStyles[severity],
    {
      message: loggedError.message,
      name: loggedError.name,
      context: loggedError.context,
      timestamp: loggedError.timestamp,
      sessionDuration: `${loggedError.sessionDuration}s`,
    }
  );

  // In development, also log the full stack
  if (isDev && error.stack) {
    console.error(`[${errorId}] Stack:`, error.stack);
  }

  // Fire-and-forget sink → Supabase client_error_logs (own-your-data first).
  // Must never block, throw, or recurse into logError (insert failures swallowed).
  void sendErrorToSink(loggedError);

  // Optional external forwarder (Sentry) — only when VITE_SENTRY_DSN is set
  // AND a global Sentry was attached by app code. Silently no-op otherwise.
  void forwardToSentry(error, loggedError);

  return loggedError;
}

// ---------------------------------------------------------------------------
// Remote sink (Supabase) — own-your-data, GDPR-respecting.
// Loaded lazily so logError.ts has no hard dep on supabase at module init.
// ---------------------------------------------------------------------------
let sinkInFlight = 0;
const SINK_MAX_INFLIGHT = 8;

async function sendErrorToSink(entry: LoggedError): Promise<void> {
  if (typeof window === 'undefined') return;
  if (sinkInFlight >= SINK_MAX_INFLIGHT) return; // back-pressure guard
  sinkInFlight++;
  try {
    const { supabase } = await import('@/lib/supabaseClient');
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id ?? null;
    const row = {
      error_id: entry.errorId,
      message: entry.message.slice(0, 2000),
      name: entry.name ? entry.name.slice(0, 200) : undefined,
      stack: entry.stack ? entry.stack.slice(0, 8000) : undefined,
      severity: entry.context.severity ?? 'low',
      context: {
        component: entry.context.component,
        action: entry.context.action,
        tags: entry.context.tags,
        workspaceId: entry.context.workspaceId,
        sessionDuration: entry.sessionDuration,
        breadcrumbs: (entry.breadcrumbs ?? []).slice(-10),
      },
      url: entry.url.slice(0, 500),
      user_agent: entry.userAgent.slice(0, 500),
      user_id: userId ?? undefined,
    };
    await supabase.from('client_error_logs').insert([row]);
  } catch {
    // Swallow — never recurse, never surface sink failures to users.
  } finally {
    sinkInFlight = Math.max(0, sinkInFlight - 1);
  }
}

async function forwardToSentry(error: Error, entry: LoggedError): Promise<void> {
  try {
    const dsn = import.meta.env.VITE_SENTRY_DSN;
    if (!dsn) return;
    const sentry = (globalThis as { Sentry?: { captureException?: (e: unknown, opts?: unknown) => void } }).Sentry;
    if (!sentry?.captureException) return;
    sentry.captureException(error, {
      level: entry.context.severity,
      extra: { errorId: entry.errorId, context: entry.context },
    });
  } catch {
    // Swallow — optional sink.
  }
}

/**
 * Log a warning (non-fatal) with context
 */
export function logWarning(message: string, context: ErrorContext = {}): void {
  const warningId = `WARN-${Date.now().toString(36).toUpperCase()}`;
  
  addBreadcrumb({
    type: 'info',
    message: sanitizeMessage(message),
  });
  
  console.warn(`[${warningId}]`, {
    message: sanitizeMessage(message),
    context,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Log an API call for debugging
 */
export function logApiCall(endpoint: string, method: string, status?: number, duration?: number): void {
  addBreadcrumb({
    type: 'api',
    message: `${method} ${endpoint}`,
    data: { status, duration },
  });
}

/**
 * Log a navigation event
 */
export function logNavigation(from: string, to: string): void {
  addBreadcrumb({
    type: 'navigation',
    message: `${from} → ${to}`,
  });
}

/**
 * Wrap an async function with error logging
 */
export function withErrorLogging<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context: ErrorContext
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof Error) {
        logError(error, context);
      }
      throw error;
    }
  }) as T;
}

/**
 * Get current breadcrumbs for debugging
 */
export function getBreadcrumbs(): readonly Breadcrumb[] {
  return [...breadcrumbs];
}

/**
 * Clear breadcrumbs (useful after successful operations)
 */
export function clearBreadcrumbs(): void {
  breadcrumbs.length = 0;
}
