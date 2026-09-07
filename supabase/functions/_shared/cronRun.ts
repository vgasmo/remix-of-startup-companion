/**
 * Shared cron run instrumentation.
 *
 * Every scheduled edge function should wrap its work with `instrumentCronRun`
 * so a single row lands in `public.cron_job_runs` per invocation. The helper
 * is fail-open on logging errors (never crash the job if the logger fails) but
 * fail-closed on business errors (rethrows so the caller can respond 5xx and
 * the log row is written with status='failed').
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type CronRunStatus = 'ok' | 'partial' | 'failed' | 'skipped';

export interface CronRunContext {
  jobName: string;
  requestId: string;
  triggeredBy?: 'cron' | 'manual' | 'webhook';
}

export interface CronRunResult {
  status: CronRunStatus;
  details?: Record<string, unknown>;
  errorSummary?: string;
  errorCode?: string;
}

let cachedAdmin: SupabaseClient | null = null;
function getAdmin(): SupabaseClient {
  if (cachedAdmin) return cachedAdmin;
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  cachedAdmin = createClient(url, key, { auth: { persistSession: false } });
  return cachedAdmin;
}

async function writeRun(
  ctx: CronRunContext,
  status: CronRunStatus,
  durationMs: number,
  details: Record<string, unknown>,
  errorSummary?: string,
  errorCode?: string,
): Promise<void> {
  try {
    const admin = getAdmin();
    await admin.rpc('log_cron_job_run', {
      p_job_name: ctx.jobName,
      p_status: status,
      p_duration_ms: durationMs,
      p_error_code: errorCode ?? null,
      p_error_summary: errorSummary ?? null,
      p_details: { request_id: ctx.requestId, ...details },
      p_triggered_by: ctx.triggeredBy ?? 'cron',
    });
  } catch (e) {
    // Fail-open: never crash the caller because logging failed.
    console.warn(`[${ctx.jobName}] log_cron_job_run failed`, e);
  }
}

/**
 * Wrap a scheduled function's body. Automatically writes a `cron_job_runs`
 * row on success and failure. The `work` callback returns the run result; on
 * thrown errors the run is logged as 'failed' and the error is rethrown.
 */
export async function instrumentCronRun(
  ctx: CronRunContext,
  work: () => Promise<CronRunResult>,
): Promise<CronRunResult> {
  const started = Date.now();
  try {
    const result = await work();
    await writeRun(
      ctx,
      result.status,
      Date.now() - started,
      result.details ?? {},
      result.errorSummary,
      result.errorCode,
    );
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await writeRun(ctx, 'failed', Date.now() - started, { stage: 'fatal' }, msg, 'unhandled_exception');
    throw err;
  }
}

/**
 * Convenience for functions that need to write an intermediate run entry
 * (e.g. long-running jobs that want to record partial progress). Prefer
 * `instrumentCronRun` for the primary success/failure signal.
 */
export async function recordCronRun(
  ctx: CronRunContext,
  result: CronRunResult & { durationMs: number },
): Promise<void> {
  await writeRun(
    ctx,
    result.status,
    result.durationMs,
    result.details ?? {},
    result.errorSummary,
    result.errorCode,
  );
}

/**
 * Wrap a Deno.serve/serve handler to automatically log a cron_job_runs row on
 * every non-OPTIONS invocation. Status is inferred from the HTTP response:
 *   - 2xx  → 'ok'  (unless response JSON contains {status:'partial'|'failed'})
 *   - 4xx  → 'skipped' (client/auth failure — not the job's fault)
 *   - 5xx  → 'failed'
 * Thrown errors are re-thrown after being logged as 'failed'.
 *
 * The helper reads the response body via clone(), so the original response is
 * still returned to the caller untouched.
 */
export function withCronRunLogging(
  jobName: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return handler(req);

    const requestId = crypto.randomUUID();
    // cron_invoke_edge only sends `x-cron-token`; older callers send `x-cron-secret`.
    const triggeredBy: 'cron' | 'manual' =
      (req.headers.get('x-cron-token') || req.headers.get('x-cron-secret')) ? 'cron' : 'manual';
    const started = Date.now();

    try {
      const resp = await handler(req);
      let status: CronRunStatus = 'ok';
      let errorSummary: string | undefined;
      let details: Record<string, unknown> = { http_status: resp.status };

      if (resp.status >= 500) {
        status = 'failed';
      } else if (resp.status >= 400) {
        status = 'skipped';
      }

      try {
        const cloned = resp.clone();
        const ct = cloned.headers.get('content-type') ?? '';
        if (ct.includes('application/json')) {
          const body = await cloned.json();
          if (body && typeof body === 'object') {
            if (body.status === 'partial' || body.status === 'failed' || body.status === 'ok') {
              status = body.status;
            } else if (body.success === false && status === 'ok') {
              status = 'failed';
            }
            if (typeof body.error === 'string') errorSummary = body.error;
            details = { ...details, ...(body as Record<string, unknown>) };
          }
        }
      } catch {
        /* body already consumed or not JSON — ignore */
      }

      await writeRun(
        { jobName, requestId, triggeredBy },
        status,
        Date.now() - started,
        details,
        errorSummary,
      );
      return resp;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await writeRun(
        { jobName, requestId, triggeredBy },
        'failed',
        Date.now() - started,
        { stage: 'unhandled_exception' },
        msg,
        'unhandled_exception',
      );
      throw err;
    }
  };
}
