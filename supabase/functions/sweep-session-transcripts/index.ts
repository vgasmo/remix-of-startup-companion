/**
 * sweep-session-transcripts
 *
 * Cron-driven sweep that auto-imports Teams transcripts for eligible sessions.
 * Runs every ~20 min. Selects completed sessions with recording_consent=true
 * that don't yet have a session_transcripts row and were online (join_url or
 * outlook_event_id). Backs off after MAX_ATTEMPTS.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { createLogger, generateRequestId, requireCronSecret, safeErrorMessage } from '../_shared/security.ts';

const FUNCTION_NAME = 'sweep-session-transcripts';
const MAX_ATTEMPTS = 8;
const LOOKBACK_HOURS = 48;
const BATCH_SIZE = 25;
// Give Teams ~5 min to make the transcript available after the meeting ends
const MIN_MINUTES_AFTER_COMPLETION = 5;
// Minimum spacing between attempts on the same session (in minutes)
const MIN_ATTEMPT_INTERVAL_MIN = 15;

Deno.serve(async (req: Request) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);
  const runStartedAt = Date.now();

  if (req.method === 'OPTIONS') return handleCorsOptions(req);

  const auth = requireCronSecret(req);
  if ('error' in auth) return auth.error;

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const cronSecret = Deno.env.get('CRON_SECRET')!;
  const admin = createClient(supabaseUrl, serviceKey);

  const logRun = async (status: string, extra: Record<string, unknown> = {}, errorSummary?: string) => {
    try {
      await admin.rpc('log_cron_job_run', {
        p_job_name: FUNCTION_NAME,
        p_status: status,
        p_duration_ms: Date.now() - runStartedAt,
        p_error_code: null,
        p_error_summary: errorSummary ?? null,
        p_details: { request_id: requestId, ...extra },
        p_triggered_by: 'cron',
      });
    } catch (e) {
      log.warn('log_cron_job_run failed', { error: safeErrorMessage(e) });
    }
  };

  const nowIso = new Date().toISOString();
  const lookbackIso = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const maxCompletedIso = new Date(Date.now() - MIN_MINUTES_AFTER_COMPLETION * 60 * 1000).toISOString();
  const attemptCutoffIso = new Date(Date.now() - MIN_ATTEMPT_INTERVAL_MIN * 60 * 1000).toISOString();

  try {

  // Candidate sessions: consent given, online, completed recently, under max attempts,
  // last attempt (if any) older than the interval, no transcripts row yet.
  const { data: candidates, error: candErr } = await admin
    .from('sessions')
    .select('id, workspace_id, completed_at, transcript_import_attempts, transcript_last_attempt_at, outlook_event_id, teams_meeting_url')
    .eq('status', 'completed')
    .eq('recording_consent', true)
    .gte('completed_at', lookbackIso)
    .lte('completed_at', maxCompletedIso)
    .lt('transcript_import_attempts', MAX_ATTEMPTS)
    .or('outlook_event_id.not.is.null,teams_meeting_url.not.is.null')
    .order('completed_at', { ascending: true })
    .limit(BATCH_SIZE * 4); // over-fetch, filter below

  if (candErr) {
    log.error('Failed to load candidate sessions', candErr);
    await logRun('failed', { stage: 'candidates' }, candErr.message);
    return corsJsonResponse({ success: false, error: candErr.message }, req, 500);
  }

  if (!candidates || candidates.length === 0) {
    log.info('No candidates');
    await logRun('ok', { processed: 0, candidates: 0 });
    return corsJsonResponse({ success: true, processed: 0 }, req);
  }

  // Filter: skip if a session_transcripts row already exists.
  const ids = candidates.map((c: any) => c.id);
  const { data: existing, error: exErr } = await admin
    .from('session_transcripts')
    .select('session_id')
    .in('session_id', ids);

  if (exErr) {
    log.error('Failed to load existing transcripts', exErr);
    await logRun('failed', { stage: 'existing' }, exErr.message);
    return corsJsonResponse({ success: false, error: exErr.message }, req, 500);
  }

  const already = new Set((existing || []).map((r: any) => r.session_id));

  const toProcess = candidates
    .filter((c: any) => !already.has(c.id))
    .filter((c: any) => !c.transcript_last_attempt_at || c.transcript_last_attempt_at < attemptCutoffIso)
    .slice(0, BATCH_SIZE);

  log.info('Sweeping sessions', { candidates: candidates.length, toProcess: toProcess.length });

  const results: Array<{ session_id: string; status: string; error?: string }> = [];
  const importUrl = `${supabaseUrl}/functions/v1/import-teams-transcript`;

  for (const s of toProcess) {
    try {
      const resp = await fetch(importUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
          'x-cron-secret': cronSecret,
        },
        body: JSON.stringify({ session_id: s.id }),
      });
      const bodyText = await resp.text();
      let parsed: any = {};
      try { parsed = JSON.parse(bodyText); } catch { /* keep text */ }
      results.push({ session_id: s.id, status: parsed?.status || `http_${resp.status}` });

      if (parsed?.status === 'not_ready' && ((s.transcript_import_attempts ?? 0) + 1) >= MAX_ATTEMPTS) {
        await admin.from('integration_errors').insert({
          integration_type: 'teams_transcript',
          workspace_id: s.workspace_id,
          error_message: 'Transcript never appeared after max attempts',
          error_details: { session_id: s.id, attempts: MAX_ATTEMPTS },
          created_at: nowIso,
        });
        await admin
          .from('sessions')
          .update({ transcript_import_status: 'gave_up' })
          .eq('id', s.id);
      }
    } catch (e) {
      const msg = safeErrorMessage(e);
      log.warn('Import invocation failed', { session_id: s.id, error: msg });
      results.push({ session_id: s.id, status: 'error', error: msg });
    }
  }

  const errorCount = results.filter(r => r.status === 'error').length;
  await logRun(errorCount > 0 ? 'partial' : 'ok', {
    processed: results.length,
    candidates: candidates.length,
    errors: errorCount,
  }, errorCount > 0 ? `${errorCount} import errors` : undefined);

  return corsJsonResponse({ success: true, processed: results.length, results }, req);
  } catch (fatal) {
    const msg = safeErrorMessage(fatal);
    log.error('Fatal sweep error', { error: msg });
    await logRun('failed', { stage: 'fatal' }, msg);
    return corsJsonResponse({ success: false, error: msg }, req, 500);
  }
});
});
