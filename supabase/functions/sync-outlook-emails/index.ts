/**
 * Sync Outlook Emails Edge Function
 * Fetches recent emails from a consultant's Outlook mailbox via MS Graph,
 * matches them to CRM contacts/startups, and logs relevant ones to communication_log.
 *
 * Delta sync: uses last_success_at to only fetch emails received since the last
 * successful sync (with 1h overlap for safety). First sync fetches last 365 days.
 * Pagination: follows @odata.nextLink to process up to 1000 emails per run.
 *
 * Matching strategy:
 *   1. Exact contact email match in funnel_items
 *   2. Startup main_contact_email match
 *   3. Domain match against startup websites/contact emails
 *   4. Founder workspace email match (profile → workspace_users)
 *   5. Unmatched → needs_review = true
 *
 * Deduplication: uses external_id (Graph message ID) + external_source = 'outlook_email'
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyCronToken } from '../_shared/security.ts';
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { createLogger, generateRequestId, safeErrorMessage } from '../_shared/security.ts';
import { withCronRunLogging } from '../_shared/cronRun.ts';

const FUNCTION_NAME = 'sync-outlook-emails';

interface GraphCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

interface GraphMessage {
  id: string;
  internetMessageId?: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  sentDateTime?: string;
  receivedDateTime?: string;
  from?: { emailAddress: { address: string; name?: string } };
  toRecipients?: Array<{ emailAddress: { address: string; name?: string } }>;
  ccRecipients?: Array<{ emailAddress: { address: string; name?: string } }>;
  isRead?: boolean;
  categories?: string[];
  importance?: string;
  webLink?: string;
}

interface MatchResult {
  funnelItemId: string | null;
  workspaceId: string | null;
  startupId: string | null;
  contactEmail: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  method: string;
}

// Noise filters - skip these automatically
const NOISE_SENDERS = [
  'noreply@', 'no-reply@', 'notifications@', 'newsletter@',
  'mailer-daemon@', 'postmaster@', 'donotreply@', 'support@microsoft.com',
  'notification@', 'info@microsoft.com', 'calendar@', 'bounce@',
];

function isNoisyEmail(from: string, subject: string): boolean {
  const lowerFrom = from.toLowerCase();
  const lowerSubject = subject.toLowerCase();
  
  if (NOISE_SENDERS.some(n => lowerFrom.includes(n))) return true;
  if (lowerSubject.includes('unsubscribe') && lowerSubject.includes('newsletter')) return true;
  if (lowerFrom.includes('linkedin.com') || lowerFrom.includes('facebook.com')) return true;
  
  return false;
}

async function getGraphCredentials(
  supabaseAdmin: SupabaseClient,
  log: ReturnType<typeof createLogger>
): Promise<GraphCredentials | null> {
  const envClientSecret = Deno.env.get('MS_GRAPH_CLIENT_SECRET');
  
  const { data: globalSettings } = await supabaseAdmin
    .from('global_integration_settings')
    .select('settings_json, is_enabled')
    .in('integration_type', ['graph_api', 'microsoft_graph'])
    .eq('is_enabled', true)
    .limit(1)
    .maybeSingle();
  
  if (!globalSettings?.settings_json) {
    log.warn('No global Graph API settings found');
    return null;
  }

  const globalJson = globalSettings.settings_json as {
    tenant_id?: string;
    client_id?: string;
    client_secret?: string;
  };
  
  const tenantId = globalJson.tenant_id;
  const clientId = globalJson.client_id;
  const clientSecret = envClientSecret || globalJson.client_secret;
  
  if (!tenantId || !clientId || !clientSecret) {
    log.warn('Incomplete Graph credentials');
    return null;
  }
  
  return { tenantId, clientId, clientSecret };
}

async function getGraphAccessToken(credentials: GraphCredentials, log: ReturnType<typeof createLogger>): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${credentials.tenantId}/oauth2/v2.0/token`;
  
  const body = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const err = await res.text();
    log.error('Graph token request failed', new Error(err));
    throw new Error(`Graph token error: ${res.status}`);
  }

  const data = await res.json();
  return data.access_token;
}

/**
 * Fetch with exponential-backoff retry for 429 / 5xx / network errors.
 * Honours the Retry-After header when present. Total attempts: 3.
 */
async function fetchGraphWithRetry(
  url: string,
  init: RequestInit,
  log: ReturnType<typeof createLogger>,
): Promise<Response> {
  const MAX_ATTEMPTS = 3;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
      if (!retryable || attempt === MAX_ATTEMPTS) return res;
      const retryAfter = Number(res.headers.get('retry-after')) || 0;
      const backoffMs = retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (attempt - 1);
      log.warn('graph_retry', { attempt, status: res.status, waitMs: backoffMs });
      // Drain body to avoid resource leak
      await res.text().catch(() => {});
      await new Promise((r) => setTimeout(r, backoffMs));
    } catch (err) {
      lastErr = err;
      if (attempt === MAX_ATTEMPTS) throw err;
      const backoffMs = 500 * 2 ** (attempt - 1);
      log.warn('graph_retry_network', { attempt, waitMs: backoffMs, error: String(err) });
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }
  throw lastErr ?? new Error('fetchGraphWithRetry: unreachable');
}

async function matchEmailToCrm(
  supabaseAdmin: SupabaseClient,
  participantEmails: string[],
  consultantEmail: string,
  log: ReturnType<typeof createLogger>
): Promise<MatchResult> {
  // Filter out the consultant's own email and other @startupleiria.com staff
  const consultantDomain = consultantEmail.split('@')[1]?.toLowerCase();
  const externalEmails = participantEmails
    .filter(e => {
      const lower = e.toLowerCase();
      // Exclude consultant's own email
      if (lower === consultantEmail.toLowerCase()) return false;
      // Exclude other staff from the same org domain (they are not leads/founders)
      if (consultantDomain && lower.endsWith(`@${consultantDomain}`)) return false;
      return true;
    })
    .map(e => e.toLowerCase());

  if (externalEmails.length === 0) {
    return { funnelItemId: null, workspaceId: null, startupId: null, contactEmail: null, confidence: 'none', method: 'no_external_participants' };
  }

  // 1. Exact contact email match in funnel_items
  for (const email of externalEmails) {
    const { data: funnelMatch } = await supabaseAdmin
      .from('funnel_items')
      .select('id, linked_workspace_id, linked_startup_id, contact_email')
      .eq('contact_email', email)
      .limit(1)
      .maybeSingle();

    if (funnelMatch) {
      return {
        funnelItemId: funnelMatch.id,
        workspaceId: funnelMatch.linked_workspace_id,
        startupId: funnelMatch.linked_startup_id,
        contactEmail: email,
        confidence: 'high',
        method: 'funnel_contact_email',
      };
    }
  }

  // 2. Startup main_contact_email match
  for (const email of externalEmails) {
    const { data: startupMatch } = await supabaseAdmin
      .from('startups')
      .select('id, name')
      .eq('main_contact_email', email)
      .limit(1)
      .maybeSingle();

    if (startupMatch) {
      // Find linked workspace
      const { data: ws } = await supabaseAdmin
        .from('workspaces')
        .select('id')
        .eq('startup_id', startupMatch.id)
        .limit(1)
        .maybeSingle();

      return {
        funnelItemId: null,
        workspaceId: ws?.id || null,
        startupId: startupMatch.id,
        contactEmail: email,
        confidence: 'high',
        method: 'startup_contact_email',
      };
    }
  }

  // 3. Domain match against startup websites
  const domains = [...new Set(externalEmails.map(e => e.split('@')[1]).filter(Boolean))];
  // Skip generic domains
  const genericDomains = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'live.com', 'sapo.pt', 'icloud.com', 'protonmail.com'];
  const specificDomains = domains.filter(d => !genericDomains.includes(d));

  for (const domain of specificDomains) {
    const { data: domainMatches } = await supabaseAdmin
      .from('startups')
      .select('id, name, website')
      .or(`website.ilike.%${domain}%,main_contact_email.ilike.%@${domain}`)
      .limit(3);

    if (domainMatches && domainMatches.length === 1) {
      const match = domainMatches[0];
      const { data: ws } = await supabaseAdmin
        .from('workspaces')
        .select('id')
        .eq('startup_id', match.id)
        .limit(1)
        .maybeSingle();

      return {
        funnelItemId: null,
        workspaceId: ws?.id || null,
        startupId: match.id,
        contactEmail: externalEmails[0],
        confidence: 'medium',
        method: 'domain_match',
      };
    } else if (domainMatches && domainMatches.length > 1) {
      // Multiple matches → needs review
      return {
        funnelItemId: null,
        workspaceId: null,
        startupId: null,
        contactEmail: externalEmails[0],
        confidence: 'low',
        method: 'domain_multiple_matches',
      };
    }
  }

  // 4. Profile email match (team member / founder)
  for (const email of externalEmails) {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .limit(1)
      .maybeSingle();

    if (profile) {
      const { data: wu } = await supabaseAdmin
        .from('workspace_users')
        .select('workspace_id, workspaces:workspaces(startup_id)')
        .eq('user_id', profile.id)
        .eq('active', true)
        .eq('role', 'founder')
        .limit(1)
        .maybeSingle();

      if (wu) {
        const ws = wu.workspaces as unknown as { startup_id: string | null };
        return {
          funnelItemId: null,
          workspaceId: wu.workspace_id,
          startupId: ws?.startup_id || null,
          contactEmail: email,
          confidence: 'high',
          method: 'founder_profile_email',
        };
      }
    }
  }

  // No match found
  return {
    funnelItemId: null,
    workspaceId: null,
    startupId: null,
    contactEmail: externalEmails[0] || null,
    confidence: 'none',
    method: 'no_match',
  };
}

/**
 * Sync emails for a single consultant.
 * Uses delta sync: only fetches emails received since the last successful sync.
 * First sync fetches the last 365 days.
 * Paginates through @odata.nextLink up to MAX_PAGES (1000 emails max).
 */
async function syncConsultantEmails(
  supabaseAdmin: SupabaseClient,
  consultantUserId: string,
  consultantEmail: string,
  credentials: GraphCredentials,
  log: ReturnType<typeof createLogger>
): Promise<{ processed: number; logged: number; unmatched: number; ignored: number; duplicates: number; error?: string }> {
  try {
    // Get last successful sync time for delta filtering
    const { data: syncStatus } = await supabaseAdmin
      .from('email_sync_status')
      .select('last_success_at')
      .eq('consultant_user_id', consultantUserId)
      .eq('provider', 'outlook')
      .maybeSingle();

    // Update sync state
    await supabaseAdmin.from('email_sync_status').upsert({
      consultant_user_id: consultantUserId,
      provider: 'outlook',
      mailbox_email: consultantEmail,
      sync_state: 'syncing',
      last_sync_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'consultant_user_id,provider' });

    // Get access token
    const accessToken = await getGraphAccessToken(credentials, log);

    // Delta sync: if we have a previous success, only fetch emails since then (minus 1h overlap)
    // First sync: fetch last 365 days
    let filterDate: string;
    if (syncStatus?.last_success_at) {
      const lastSync = new Date(syncStatus.last_success_at);
      lastSync.setHours(lastSync.getHours() - 1); // 1h overlap for safety
      filterDate = lastSync.toISOString();
      log.info(`Delta sync since ${filterDate} for ${consultantEmail}`);
    } else {
      filterDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      log.info(`Initial full sync for ${consultantEmail}`);
    }

    let processed = 0, logged = 0, unmatched = 0, ignored = 0, duplicates = 0;
    const MAX_PAGES = 10; // Safety limit: max ~1000 emails per sync run
    let pageCount = 0;

    let graphUrl: string | null = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(consultantEmail)}/messages?$top=100&$orderby=receivedDateTime desc&$filter=receivedDateTime ge ${filterDate}&$select=id,internetMessageId,conversationId,subject,bodyPreview,sentDateTime,receivedDateTime,from,toRecipients,ccRecipients,categories,importance`;

    while (graphUrl && pageCount < MAX_PAGES) {
      pageCount++;
      const graphRes = await fetchGraphWithRetry(graphUrl, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }, log);

      if (!graphRes.ok) {
        const errText = await graphRes.text();
        const isInvalidUser = errText.includes('ErrorInvalidUser') || graphRes.status === 404;
        log.error('Graph API messages fetch failed', new Error(errText));

        await supabaseAdmin.from('email_sync_status').upsert({
          consultant_user_id: consultantUserId,
          provider: 'outlook',
          // Mark as 'disabled' for invalid Graph mailboxes so the auto-sync
          // loop skips them on subsequent runs (test/leftover accounts).
          sync_state: isInvalidUser ? 'disabled' : 'error',
          last_sync_error: isInvalidUser
            ? 'Mailbox does not exist in Microsoft 365 tenant (ErrorInvalidUser). Auto-sync disabled for this account.'
            : `Graph API ${graphRes.status}: ${errText.slice(0, 200)}`,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'consultant_user_id,provider' });

        return { processed, logged, unmatched, ignored, duplicates, error: `Graph API ${graphRes.status}` };
      }

      const graphData = await graphRes.json();
      const messages: GraphMessage[] = graphData.value || [];
      log.info(`Fetched ${messages.length} messages for ${consultantEmail} (page ${pageCount})`);

      if (messages.length === 0) break;

      for (const msg of messages) {
        processed++;
        const fromEmail = msg.from?.emailAddress?.address || '';
        const subject = msg.subject || '';

        // Skip noise
        if (isNoisyEmail(fromEmail, subject)) {
          ignored++;
          continue;
        }

        // Skip internal-only emails (all participants in same org domain)
        const orgDomain = consultantEmail.split('@')[1]?.toLowerCase();
        const allRecipients = [
          ...(msg.toRecipients || []).map(r => r.emailAddress?.address || ''),
          ...(msg.ccRecipients || []).map(r => r.emailAddress?.address || ''),
        ];
        const allParticipants = [fromEmail, ...allRecipients].filter(Boolean);
        const externalParticipants = allParticipants.filter(
          e => e.toLowerCase().split('@')[1] !== orgDomain
        );

        // If no external participants, skip (internal only)
        if (externalParticipants.length === 0 && orgDomain) {
          ignored++;
          continue;
        }

        // Check for duplicate
        const { data: existing } = await supabaseAdmin
          .from('communication_log')
          .select('id')
          .eq('external_id', msg.id)
          .eq('external_source', 'outlook_email')
          .limit(1)
          .maybeSingle();

        if (existing) {
          duplicates++;
          continue;
        }

        // Match to CRM
        const match = await matchEmailToCrm(supabaseAdmin, allParticipants, consultantEmail, log);

        const isSent = fromEmail.toLowerCase() === consultantEmail.toLowerCase();
        const direction = isSent ? 'outbound' : 'inbound';
        const needsReview = match.confidence === 'none' || match.confidence === 'low';

        const insertData = {
          workspace_id: match.workspaceId || null,
          funnel_item_id: match.funnelItemId || null,
          activity_type: 'email',
          channel: 'outlook',
          direction,
          from_address: fromEmail,
          subject: subject.slice(0, 500),
          preview: (msg.bodyPreview || '').slice(0, 300),
          occurred_at: msg.receivedDateTime || msg.sentDateTime || new Date().toISOString(),
          visibility: 'staff',
          external_source: 'outlook_email',
          external_id: msg.id,
          status: 'done',
          provider_thread_id: msg.conversationId || null,
          internet_message_id: msg.internetMessageId || null,
          matched_contact_email: match.contactEmail,
          matched_startup_id: match.startupId,
          matching_confidence: match.confidence,
          matching_method: match.method,
          needs_review: needsReview,
          ignored: false,
          sync_status: 'synced',
          last_synced_at: new Date().toISOString(),
          consultant_user_id: consultantUserId,
          participants_json: {
            from: msg.from?.emailAddress || null,
            to: (msg.toRecipients || []).map(r => r.emailAddress),
            cc: (msg.ccRecipients || []).map(r => r.emailAddress),
          },
        };

        const { error: insertError } = await supabaseAdmin
          .from('communication_log')
          .insert(insertData as Record<string, unknown>);

        if (insertError) {
          if (insertError.code === '23505') {
            duplicates++;
          } else {
            log.warn('Insert failed', { error: insertError.message, msgId: msg.id });
          }
          continue;
        }

        if (needsReview) {
          unmatched++;
        } else {
          logged++;
        }
      }

      // Follow pagination link for next page
      graphUrl = graphData['@odata.nextLink'] || null;
    }

    if (pageCount >= MAX_PAGES) {
      log.warn(`Hit max pages (${MAX_PAGES}) for ${consultantEmail}, some older emails may be pending`);
    }

    // Success: reset consecutive_failures counter, clear error, record runtime.
    const nowIso = new Date().toISOString();
    await supabaseAdmin.from('email_sync_status').upsert({
      consultant_user_id: consultantUserId,
      provider: 'outlook',
      mailbox_email: consultantEmail,
      sync_state: 'idle',
      last_success_at: nowIso,
      last_sync_at: nowIso,
      last_sync_error: null,
      emails_processed: processed,
      emails_logged: logged,
      emails_unmatched: unmatched,
      emails_ignored: ignored,
      consecutive_failures: 0,
      updated_at: nowIso,
    }, { onConflict: 'consultant_user_id,provider' });

    log.info('email_sync_ok', { consultant: consultantEmail, processed, logged, unmatched, ignored, duplicates });

    return { processed, logged, unmatched, ignored, duplicates };
  } catch (err) {
    const errMsg = safeErrorMessage(err);
    log.error(`email_sync_failed for ${consultantEmail}`, err);

    // Read current failure count and bump. Non-atomic but acceptable — a single
    // consultant runs sequentially per invocation.
    const { data: prev } = await supabaseAdmin
      .from('email_sync_status')
      .select('consecutive_failures')
      .eq('consultant_user_id', consultantUserId)
      .eq('provider', 'outlook')
      .maybeSingle();
    const nextFailures = (prev?.consecutive_failures ?? 0) + 1;

    try {
      await supabaseAdmin.from('email_sync_status').upsert({
        consultant_user_id: consultantUserId,
        provider: 'outlook',
        sync_state: 'error',
        last_sync_error: errMsg,
        consecutive_failures: nextFailures,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'consultant_user_id,provider' });
    } catch { /* best-effort */ }

    return { processed: 0, logged: 0, unmatched: 0, ignored: 0, duplicates: 0, error: errMsg };
  }
}

Deno.serve(withCronRunLogging('sync-outlook-emails', async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    // Parse body to check for auto_sync mode
    let bodyJson: Record<string, unknown> = {};
    try {
      bodyJson = await req.json();
    } catch {
      // No body or invalid JSON, proceed with manual mode
    }

    const isAutoSync = bodyJson.auto_sync === true;

    if (isAutoSync) {
      // A2: authorize BEFORE doing any work. Global sync accepts only:
      //  (a) a timing-safe match on x-cron-secret against CRON_SECRET, or
      //  (b) an authenticated admin user (Bearer token).
      // Never leak mailbox addresses or provider errors to unauthorized callers.
      const providedSecret = req.headers.get('x-cron-secret') ?? '';
      const expectedSecret = Deno.env.get('CRON_SECRET') ?? '';
      const timingSafeEqual = (a: string, b: string): boolean => {
        if (a.length !== b.length) return false;
        let out = 0;
        for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
        return out === 0;
      };
      let authorized = false;
      if (await verifyCronToken(req)) {
        authorized = true;
      } else if (expectedSecret && providedSecret && timingSafeEqual(providedSecret, expectedSecret)) {
        authorized = true;
      } else {
        const authHeader = req.headers.get('Authorization') ?? '';
        if (authHeader.startsWith('Bearer ')) {
          const t = authHeader.slice(7);
          const { data: { user } } = await supabaseAdmin.auth.getUser(t);
          if (user) {
            const { data: adminRole } = await supabaseAdmin
              .from('user_roles')
              .select('role')
              .eq('user_id', user.id)
              .eq('role', 'admin')
              .maybeSingle();
            if (adminRole) authorized = true;
          }
        }
      }
      if (!authorized) {
        log.warn('email_sync_global_unauthorized', { hasSecret: providedSecret.length > 0 });
        // Do NOT reveal whether CRON_SECRET is configured or which condition failed.
        return corsJsonResponse({ error: 'Unauthorized' }, req, 401);
      }

      // AUTO SYNC MODE: Sync all consultants with @startupleiria.com emails.
      // Wrapped in an email_sync_runs row for observability and alerting.
      const runStart = Date.now();
      const triggeredBy = typeof bodyJson.triggered_by === 'string' ? bodyJson.triggered_by : 'cron';

      const { data: runRow } = await supabaseAdmin
        .from('email_sync_runs')
        .insert({ status: 'running', triggered_by: triggeredBy })
        .select('id')
        .single();
      const runId = runRow?.id as string | undefined;

      const finalizeRun = async (patch: Record<string, unknown>) => {
        if (!runId) return;
        try {
          await supabaseAdmin
            .from('email_sync_runs')
            .update({
              finished_at: new Date().toISOString(),
              duration_ms: Date.now() - runStart,
              ...patch,
            })
            .eq('id', runId);
        } catch { /* best-effort */ }
      };

      log.info('email_sync_run_started', { runId, triggeredBy });

      const credentials = await getGraphCredentials(supabaseAdmin, log);
      if (!credentials) {
        log.warn('email_sync_skipped', { reason: 'graph_not_configured' });
        await finalizeRun({ status: 'skipped', error_summary: 'Graph not configured' });
        return corsJsonResponse({ status: 'skipped', reason: 'Graph not configured' }, req);
      }

      const { data: staffRoles } = await supabaseAdmin
        .from('user_roles')
        .select('user_id')
        .in('role', ['admin', 'consultor']);

      if (!staffRoles || staffRoles.length === 0) {
        await finalizeRun({ status: 'skipped', error_summary: 'No consultants' });
        return corsJsonResponse({ status: 'ok', synced: 0, reason: 'No consultants found' }, req);
      }

      const staffIds = staffRoles.map((r) => r.user_id);

      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, email')
        .in('id', staffIds)
        .not('email', 'is', null);

      if (!profiles || profiles.length === 0) {
        await finalizeRun({ status: 'skipped', error_summary: 'No profiles' });
        return corsJsonResponse({ status: 'ok', synced: 0, reason: 'No consultant profiles found' }, req);
      }

      const results: Array<{ email: string; processed: number; logged: number; unmatched: number; error?: string; skipped?: boolean }> = [];

      const { data: disabledRows } = await supabaseAdmin
        .from('email_sync_status')
        .select('consultant_user_id')
        .eq('provider', 'outlook')
        .eq('sync_state', 'disabled');
      const disabledIds = new Set((disabledRows || []).map((r) => r.consultant_user_id));

      let consultantsOk = 0;
      let consultantsFailed = 0;
      let totalProcessed = 0;
      let totalLogged = 0;
      let totalUnmatched = 0;
      const errorSamples: Array<{ email: string; error: string }> = [];

      for (const profile of profiles) {
        if (!profile.email) continue;
        if (disabledIds.has(profile.id)) {
          log.info('email_sync_skip_disabled', { email: profile.email });
          results.push({ email: profile.email, processed: 0, logged: 0, unmatched: 0, skipped: true });
          continue;
        }
        const result = await syncConsultantEmails(supabaseAdmin, profile.id, profile.email, credentials, log);
        totalProcessed += result.processed;
        totalLogged += result.logged;
        totalUnmatched += result.unmatched;
        if (result.error) {
          consultantsFailed++;
          errorSamples.push({ email: profile.email, error: result.error });
        } else {
          consultantsOk++;
        }
        results.push({
          email: profile.email,
          processed: result.processed,
          logged: result.logged,
          unmatched: result.unmatched,
          error: result.error,
        });
      }

      const runStatus = consultantsFailed === 0
        ? 'ok'
        : (consultantsOk === 0 ? 'failed' : 'partial');

      await finalizeRun({
        status: runStatus,
        consultants_total: results.length,
        consultants_ok: consultantsOk,
        consultants_failed: consultantsFailed,
        emails_processed: totalProcessed,
        emails_logged: totalLogged,
        emails_unmatched: totalUnmatched,
        error_summary: errorSamples.length > 0 ? errorSamples.slice(0, 3).map((e) => `${e.email}: ${e.error}`).join(' | ').slice(0, 500) : null,
        details: { errors: errorSamples.slice(0, 20) },
      });

      // Trigger health-check + alert emission. Never fatal for the run.
      const { error: healthErr } = await supabaseAdmin.rpc('check_email_sync_health');
      if (healthErr) log.warn('email_sync_health_check_failed', { error: healthErr.message });

      log.info('email_sync_run_finished', {
        runId,
        status: runStatus,
        consultants: results.length,
        consultantsOk,
        consultantsFailed,
        durationMs: Date.now() - runStart,
      });

      return corsJsonResponse({
        status: runStatus,
        auto_sync: true,
        run_id: runId,
        synced: results.length,
        consultants_ok: consultantsOk,
        consultants_failed: consultantsFailed,
        results,
      }, req);
    }


    // MANUAL MODE: Sync for authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return corsJsonResponse({ error: 'Unauthorized' }, req, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) {
      return corsJsonResponse({ error: 'Invalid token' }, req, 401);
    }

    // Check staff role
    const { data: roleCheck } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['admin', 'consultor'])
      .limit(1)
      .maybeSingle();

    if (!roleCheck) {
      return corsJsonResponse({ error: 'Only staff can sync emails' }, req, 403);
    }

    // Get Graph credentials
    const credentials = await getGraphCredentials(supabaseAdmin, log);
    if (!credentials) {
      await supabaseAdmin.from('email_sync_status').upsert({
        consultant_user_id: user.id,
        provider: 'outlook',
        last_sync_at: new Date().toISOString(),
        last_sync_error: 'MS Graph not configured',
        sync_state: 'error',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'consultant_user_id,provider' });

      return corsJsonResponse({ error: 'Outlook integration not configured' }, req, 503);
    }

    // Get consultant's email
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', user.id)
      .single();

    if (!profile?.email) {
      return corsJsonResponse({ error: 'Consultant profile email not found' }, req, 400);
    }

    const result = await syncConsultantEmails(supabaseAdmin, user.id, profile.email, credentials, log);

    if (result.error) {
      return corsJsonResponse({ error: result.error }, req, 502);
    }

    return corsJsonResponse({
      status: 'ok',
      processed: result.processed,
      logged: result.logged,
      unmatched: result.unmatched,
      ignored: result.ignored,
      duplicates: result.duplicates,
    }, req);

  } catch (err) {
    log.error('Sync error', err);
    return corsJsonResponse({ error: safeErrorMessage(err) }, req, 500);
  }
}));
