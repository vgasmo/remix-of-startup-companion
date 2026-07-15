/**
 * Teams Notification Edge Function
 * Sends notifications to Microsoft Teams via webhook (Adaptive Cards)
 * 
 * SETTINGS RESOLUTION ORDER:
 * 1. Workspace-specific settings (if workspace_id provided)
 * 2. Global fallback (workspace_id IS NULL AND program_id IS NULL)
 * 
 * A workspace row with enabled=false disables notifications even if global is enabled.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { createLogger, generateRequestId, ErrorCode, timingSafeEqual } from '../_shared/security.ts';

const FUNCTION_NAME = 'teams-notify';

interface TeamsNotificationRequest {
  workspace_id?: string;
  program_id?: string;
  event_type:
    | 'checkin_submitted'
    | 'action_assigned'
    | 'action_overdue'
    | 'session_created'
    | 'session_rescheduled'
    | 'health_alert'
    | 'test';
  payload: {
    title: string;
    summary: string;
    startup_name?: string;
    fields?: { name: string; value: string }[];
    link?: string;
    link_text?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
  };
}

interface TeamsSettings {
  id: string;
  workspace_id: string | null;
  program_id: string | null;
  enabled: boolean;
  webhook_url: string | null;
  notify_checkin_submitted: boolean;
  notify_action_assigned: boolean;
  notify_action_overdue: boolean;
  notify_session_created: boolean;
  notify_session_rescheduled: boolean;
  notify_health_alert: boolean;
}

// Map event types to toggle columns
const EVENT_TOGGLE_MAP: Record<string, keyof TeamsSettings | null> = {
  checkin_submitted: 'notify_checkin_submitted',
  action_assigned: 'notify_action_assigned',
  action_overdue: 'notify_action_overdue',
  session_created: 'notify_session_created',
  session_rescheduled: 'notify_session_rescheduled',
  health_alert: 'notify_health_alert',
  test: null, // test still requires `enabled=true` (P0: no unauthenticated bypass)
};

// Priority to color mapping (Teams Adaptive Card accent colors)
const PRIORITY_COLORS: Record<string, string> = {
  low: 'good',
  medium: 'default', 
  high: 'warning',
  critical: 'attention',
};

// Event type icons
const EVENT_ICONS: Record<string, string> = {
  checkin_submitted: '✅',
  action_assigned: '📋',
  action_overdue: '⚠️',
  session_created: '📅',
  session_rescheduled: '🔄',
  health_alert: '🚨',
  test: '🧪',
};

// Event type human-readable names
const EVENT_NAMES: Record<string, string> = {
  checkin_submitted: 'Check-in Submitted',
  action_assigned: 'Action Assigned',
  action_overdue: 'Action Overdue',
  session_created: 'Session Created',
  session_rescheduled: 'Session Rescheduled',
  health_alert: 'Health Alert',
  test: 'Test Message',
};

interface ResolveResult {
  settings: TeamsSettings | null;
  source: 'workspace' | 'program' | 'global_fallback' | 'not_found';
}

/**
 * Resolve Teams settings with global fallback logic
 */
async function resolveTeamsSettings(
  supabase: SupabaseClient,
  workspaceId: string | undefined,
  programId: string | undefined,
  log: ReturnType<typeof createLogger>
): Promise<ResolveResult> {
  
  // Step 1: Try workspace-specific settings
  if (workspaceId) {
    const { data: wsSettings, error } = await supabase
      .from('teams_integration_settings')
      .select('*')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    
    if (error) {
      log.error('Error fetching workspace settings', error);
      throw error;
    }
    
    if (wsSettings) {
      log.info('Using workspace-specific settings', { workspaceId, settingsId: (wsSettings as TeamsSettings).id });
      return { settings: wsSettings as TeamsSettings, source: 'workspace' };
    }
  }
  
  // Step 2: Try program-specific settings (if programId provided and no workspace settings)
  if (programId) {
    const { data: progSettings, error } = await supabase
      .from('teams_integration_settings')
      .select('*')
      .eq('program_id', programId)
      .is('workspace_id', null)
      .maybeSingle();
    
    if (error) {
      log.error('Error fetching program settings', error);
      throw error;
    }
    
    if (progSettings) {
      log.info('Using program-specific settings', { programId, settingsId: (progSettings as TeamsSettings).id });
      return { settings: progSettings as TeamsSettings, source: 'program' };
    }
  }
  
  // Step 3: Fallback to global settings
  const { data: globalSettings, error: globalError } = await supabase
    .from('teams_integration_settings')
    .select('*')
    .is('workspace_id', null)
    .is('program_id', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  
  if (globalError) {
    log.error('Error fetching global settings', globalError);
    throw globalError;
  }
  
  if (globalSettings) {
    log.info('Using global fallback settings', { settingsId: (globalSettings as TeamsSettings).id });
    return { settings: globalSettings as TeamsSettings, source: 'global_fallback' };
  }
  
  log.info('No Teams settings found at any level');
  return { settings: null, source: 'not_found' };
}

/**
 * Log integration error for observability (best-effort, non-blocking)
 */
async function logIntegrationError(
  supabase: SupabaseClient,
  workspaceId: string | undefined,
  errorSource: string,
  errorMessage: string,
  metadata: Record<string, unknown>
) {
  try {
    // Try to insert into integration_errors - silently fail if table doesn't exist
    await supabase
      .from('integration_errors')
      .insert({
        source: errorSource,
        error_message: errorMessage,
        workspace_id: workspaceId || null,
        metadata: metadata,
        created_at: new Date().toISOString(),
      } as Record<string, unknown>);
  } catch {
    // Ignore - observability logging should never break the main flow
  }
}

Deno.serve(async (req: Request) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    log.info('Received Teams notification request');

    // This can be called internally (cron secret) or from frontend (JWT)
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    const authHeader = req.headers.get('Authorization');

    const isSystemCall = !!cronSecret && !!expectedSecret && timingSafeEqual(cronSecret, expectedSecret);
    const isUserCall = authHeader?.startsWith('Bearer ');

    if (!isSystemCall && !isUserCall) {
      log.warn('Unauthorized request');
      return corsJsonResponse({ error: 'Unauthorized', code: ErrorCode.UNAUTHORIZED }, req, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate the JWT for user calls (cron path is already verified by the shared secret)
    let callerUserId: string | null = null;
    if (!isSystemCall && isUserCall) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader! } },
      });
      const { data: { user }, error: userErr } = await userClient.auth.getUser();
      if (userErr || !user) {
        log.warn('Unauthorized: invalid bearer token');
        return corsJsonResponse({ error: 'Unauthorized', code: ErrorCode.UNAUTHORIZED }, req, 401);
      }
      callerUserId = user.id;
    }

    const body = await req.json() as TeamsNotificationRequest;
    const { workspace_id, program_id, event_type, payload } = body;

    if (!event_type || !payload?.title) {
      return corsJsonResponse({ error: 'event_type and payload.title are required', code: ErrorCode.BAD_REQUEST }, req, 400);
    }

    const toggleColumn = EVENT_TOGGLE_MAP[event_type];
    if (toggleColumn === undefined) {
      return corsJsonResponse({ error: `Invalid event_type: ${event_type}`, code: ErrorCode.BAD_REQUEST }, req, 400);
    }

    // P0 fix: any founder JWT could previously post arbitrary titles/links into
    // staff channels. Authorize the caller BEFORE resolving/sending.
    //  - Cron (isSystemCall) is trusted.
    //  - User calls with workspace_id => require has_workspace_access.
    //  - User calls without workspace_id (global / program / staff channels)
    //    => require staff role.
    if (!isSystemCall && callerUserId) {
      if (workspace_id) {
        const { data: hasAccess, error: accessErr } = await supabase.rpc('has_workspace_access', {
          _user_id: callerUserId,
          _workspace_id: workspace_id,
        });
        if (accessErr || !hasAccess) {
          log.warn('Forbidden: no workspace access', { workspace_id, callerUserId });
          return corsJsonResponse({ error: 'Forbidden', code: ErrorCode.FORBIDDEN }, req, 403);
        }
      } else {
        const { data: staffRow, error: staffErr } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', callerUserId)
          .in('role', ['admin', 'consultant'])
          .limit(1)
          .maybeSingle();
        if (staffErr || !staffRow) {
          log.warn('Forbidden: staff role required for non-workspace channel', { callerUserId });
          return corsJsonResponse({ error: 'Forbidden', code: ErrorCode.FORBIDDEN }, req, 403);
        }
      }
    }

    log.info('Processing notification', { workspace_id, program_id, event_type });

    // Resolve settings with fallback logic
    const { settings, source } = await resolveTeamsSettings(supabase, workspace_id, program_id, log);

    // Build response metadata for observability
    const responseMetadata = {
      event_type,
      workspace_id: workspace_id || null,
      settings_source: source,
    };

    if (!settings) {
      log.info('Skip: no Teams settings configured', responseMetadata);
      return corsJsonResponse({ 
        success: true, 
        sent: false, 
        reason: 'not_configured',
        ...responseMetadata,
      }, req);
    }

    // For test events, only require webhook URL (bypass enabled check)
    // For normal events, require integration enabled
    if (event_type !== 'test' && !settings.enabled) {
      log.info('Skip: Teams integration disabled', { ...responseMetadata, settingsEnabled: false });
      return corsJsonResponse({ 
        success: true, 
        sent: false, 
        reason: 'disabled',
        ...responseMetadata,
      }, req);
    }

    // Check if this event type is enabled (test bypasses toggles)
    if (toggleColumn && !settings[toggleColumn]) {
      log.info('Skip: event type toggle off', { ...responseMetadata, toggle: toggleColumn, toggleValue: false });
      return corsJsonResponse({ 
        success: true, 
        sent: false, 
        reason: 'toggle_off',
        toggle: toggleColumn,
        ...responseMetadata,
      }, req);
    }

    if (!settings.webhook_url) {
      log.warn('Skip: no webhook URL configured', responseMetadata);
      return corsJsonResponse({ 
        success: true, 
        sent: false, 
        reason: 'missing_webhook',
        ...responseMetadata,
      }, req);
    }

    // Build and send the message
    const webhookUrl: string = settings.webhook_url;
    const isPowerAutomate = webhookUrl.includes('powerplatform.com') || webhookUrl.includes('flow.microsoft.com');

    const icon = EVENT_ICONS[event_type] || '📢';
    const eventName = EVENT_NAMES[event_type] || event_type;

    // Extract startup name from payload or fields
    const startupName = payload.startup_name || 
      payload.fields?.find((f) => f.name.toLowerCase() === 'startup' || f.name.toLowerCase() === 'workspace')?.value ||
      'Unknown Startup';

    let bodyToSend: unknown;
    if (isPowerAutomate) {
      // Power Automate / Logic Apps webhooks: keep payload flat + stable.
      // IMPORTANT: Some flows cache the schema; provide both legacy PT keys and simple lower-case aliases.
      // Never send null values.
      const owner =
        payload.fields?.find((f) => ['owner', 'consultor', 'mentor', 'founder', 'assignee'].includes(f.name.toLowerCase()))
          ?.value || '';

      const severity = payload.priority || 'medium';
      const startup = startupName || '';

      bodyToSend = {
        title: `${icon} ${payload.title}`,
        message: payload.summary || '',
        link: payload.link || '',

        // Legacy PT fields (used in existing flows)
        Startup: startup,
        Owner: owner,
        Severidade: severity,

        // Aliases (helpful when schema is strict / rebuilt)
        startup,
        owner,
        severity,
      };
    } else {
      // Adaptive Card format for Teams incoming webhooks
      const color = PRIORITY_COLORS[payload.priority || 'medium'];
      const cardBody: unknown[] = [
        {
          type: 'TextBlock',
          size: 'Medium',
          weight: 'Bolder',
          text: `${icon} ${payload.title}`,
          wrap: true,
          style: color === 'attention' ? 'attention' : undefined,
        },
        {
          type: 'TextBlock',
          text: `**${startupName}**`,
          wrap: true,
          spacing: 'None',
          color: 'accent',
        },
        {
          type: 'TextBlock',
          text: payload.summary,
          wrap: true,
          spacing: 'Small',
        },
      ];

      // Add fields as FactSet if present
      if (payload.fields?.length) {
        cardBody.push({
          type: 'FactSet',
          facts: payload.fields.map((f) => ({ title: f.name, value: f.value })),
          spacing: 'Medium',
        });
      }

      // Build actions
      const actions: unknown[] = [];
      if (payload.link) {
        actions.push({
          type: 'Action.OpenUrl',
          title: payload.link_text || 'Open in Startup Leiria',
          url: payload.link,
          style: 'positive',
        });
      }

      bodyToSend = {
        type: 'message',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            contentUrl: null,
            content: {
              $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
              type: 'AdaptiveCard',
              version: '1.4',
              body: cardBody,
              actions,
            },
          },
        ],
      };
    }

    log.info('Sending to Teams webhook', { isPowerAutomate, source });
    const teamsResponse = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyToSend),
    });

    if (!teamsResponse.ok) {
      const errorText = await teamsResponse.text();
      log.error('Teams webhook failed', null, { 
        status: teamsResponse.status, 
        error: errorText,
        ...responseMetadata,
      });
      
      // Log to integration_errors for observability
      await logIntegrationError(supabase, workspace_id, 'teams-notify', `Webhook returned ${teamsResponse.status}`, {
        event_type,
        settings_source: source,
        response_status: teamsResponse.status,
        response_body: errorText.slice(0, 500),
      });
      
      return corsJsonResponse(
        {
          success: false,
          error: `Teams webhook returned ${teamsResponse.status}`,
          details: errorText.slice(0, 500),
          code: ErrorCode.INTERNAL_ERROR,
          ...responseMetadata,
        },
        req,
        502,
      );
    }

    log.info('Teams notification sent successfully', responseMetadata);
    return corsJsonResponse({ 
      success: true, 
      sent: true, 
      isPowerAutomate,
      ...responseMetadata,
    }, req);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log.error('Teams notification error', error);
    return corsJsonResponse({ error: errorMessage, code: ErrorCode.INTERNAL_ERROR }, req, 500);
  }
});
