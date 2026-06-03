/**
 * Outlook Calendar Sync Edge Function
 * Creates/updates Outlook calendar events with Teams meeting links
 * Production-ready: proper calendar owner resolution, idempotency, security
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { createLogger, generateRequestId, ErrorCode, safeErrorMessage } from '../_shared/security.ts';

const FUNCTION_NAME = 'sync-outlook-calendar';

interface SyncRequest {
  session_id: string;
  action: 'create' | 'update' | 'delete';
}

interface SessionData {
  id: string;
  title: string;
  scheduled_at: string;
  duration: number | null;
  location: string | null;
  notes: string | null;
  outlook_event_id: string | null;
  outlook_sync_status: string | null;
  outlook_owner_email: string | null;
  workspace_id: string;
  created_by: string | null;
  workspaces: {
    assigned_consultor_id: string | null;
    startups: {
      name: string;
    } | null;
  };
}

interface GraphTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface GraphCalendarEvent {
  id?: string;
  subject: string;
  body: {
    contentType: string;
    content: string;
  };
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  location?: {
    displayName: string;
  };
  isOnlineMeeting: boolean;
  onlineMeetingProvider?: string;
  onlineMeeting?: {
    joinUrl: string;
  };
  attendees?: Array<{
    emailAddress: {
      address: string;
      name?: string;
    };
    type: string;
  }>;
}

interface GraphCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

// Get Graph credentials with env var priority for secrets
async function getGraphCredentials(
  supabaseAdmin: SupabaseClient,
  workspaceId: string,
  log: ReturnType<typeof createLogger>
): Promise<GraphCredentials | null> {
  // Check for env var secret first (production secure approach)
  const envClientSecret = Deno.env.get('MS_GRAPH_CLIENT_SECRET');
  
  // Try global settings - support both integration types for backward compatibility
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
  // Prefer env var, fallback to DB secret
  const clientSecret = envClientSecret || globalJson.client_secret;
  
  if (!tenantId || !clientId || !clientSecret) {
    log.warn('Incomplete Graph credentials', { 
      hasTenant: !!tenantId, 
      hasClient: !!clientId, 
      hasSecret: !!clientSecret,
      secretSource: envClientSecret ? 'env' : 'db'
    });
    return null;
  }
  
  log.info('Using global Graph API credentials', { 
    tenantId: tenantId.slice(0, 8) + '...',
    secretSource: envClientSecret ? 'env' : 'db'
  });
  
  return { tenantId, clientId, clientSecret };
}

// Resolve calendar owner email with proper priority
async function resolveCalendarOwnerEmail(
  supabaseAdmin: SupabaseClient,
  session: SessionData,
  workspaceSettings: { calendar_user_email?: string | null; use_custom_calendar_email?: boolean } | null,
  log: ReturnType<typeof createLogger>
): Promise<string | null> {
  // Priority 1: Custom override if explicitly set
  if (workspaceSettings?.use_custom_calendar_email && workspaceSettings?.calendar_user_email) {
    log.info('Using custom calendar email override', { email: workspaceSettings.calendar_user_email });
    return workspaceSettings.calendar_user_email;
  }
  
  // Priority 2: Assigned consultant
  if (session.workspaces?.assigned_consultor_id) {
    const { data: consultorProfile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', session.workspaces.assigned_consultor_id)
      .single();
    
    if (consultorProfile?.email) {
      log.info('Using assigned consultant email', { email: consultorProfile.email });
      return consultorProfile.email;
    }
  }
  
  // Priority 3: Session creator
  if (session.created_by) {
    const { data: creatorProfile } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', session.created_by)
      .single();
    
    if (creatorProfile?.email) {
      log.info('Fallback to session creator email', { email: creatorProfile.email });
      return creatorProfile.email;
    }
  }
  
  // Priority 4: Workspace calendar email (even if not custom override)
  if (workspaceSettings?.calendar_user_email) {
    log.info('Fallback to workspace calendar email', { email: workspaceSettings.calendar_user_email });
    return workspaceSettings.calendar_user_email;
  }
  
  log.warn('Could not resolve calendar owner email');
  return null;
}

// Get Microsoft Graph access token using client credentials flow
async function getGraphAccessToken(
  credentials: GraphCredentials,
  log: ReturnType<typeof createLogger>
): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${credentials.tenantId}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  log.info('Requesting Graph API access token');

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    log.error('Failed to get Graph token', null, { status: response.status });
    throw new Error(`Failed to authenticate with Microsoft: ${response.status}`);
  }

  const tokenData: GraphTokenResponse = await response.json();
  return tokenData.access_token;
}

// Create calendar event via Graph API
async function createCalendarEvent(
  accessToken: string,
  userId: string,
  event: GraphCalendarEvent,
  log: ReturnType<typeof createLogger>
): Promise<GraphCalendarEvent> {
  // Properly encode user identifier
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/events`;

  log.info('Creating calendar event via Graph', {
    userId,
    subject: event.subject,
    isOnlineMeeting: event.isOnlineMeeting,
    onlineMeetingProvider: event.onlineMeetingProvider,
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      // Ask Graph to return the full body including onlineMeeting on create
      'Prefer': 'outlook.timezone="UTC"',
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.error('Failed to create calendar event', null, { status: response.status, error: errorText.slice(0, 200) });
    throw new Error(`Failed to create calendar event: ${response.status} ${errorText.slice(0, 200)}`);
  }

  const created = await response.json() as GraphCalendarEvent;

  // Defensive re-fetch: if Teams join URL not present in create response,
  // poll the event a couple of times to allow Graph to provision the meeting.
  if (event.isOnlineMeeting && !created.onlineMeeting?.joinUrl && created.id) {
    log.info('Teams URL not in create response, polling event for online meeting');
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 800));
      const refetched = await getCalendarEvent(accessToken, userId, created.id, log);
      if (refetched?.onlineMeeting?.joinUrl) {
        log.info('Teams URL resolved after re-fetch', { attempt: i + 1 });
        return refetched;
      }
    }
    log.warn('Teams URL still missing after re-fetch attempts — check Graph permissions (Calendars.ReadWrite) and that the calendar owner has a Teams license');
  }

  return created;
}

// Update calendar event via Graph API
async function updateCalendarEvent(
  accessToken: string,
  userId: string,
  eventId: string,
  event: Partial<GraphCalendarEvent>,
  log: ReturnType<typeof createLogger>
): Promise<GraphCalendarEvent | null> {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/events/${encodeURIComponent(eventId)}`;
  
  log.info('Updating calendar event via Graph', { userId, eventId });

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.error('Failed to update calendar event', null, { status: response.status, error: errorText.slice(0, 200) });
    throw new Error(`Failed to update calendar event: ${response.status}`);
  }

  // PATCH may return 204 No Content
  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return await response.json();
  }
  
  return null;
}

// Delete calendar event via Graph API
async function deleteCalendarEvent(
  accessToken: string,
  userId: string,
  eventId: string,
  log: ReturnType<typeof createLogger>
): Promise<void> {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/events/${encodeURIComponent(eventId)}`;
  
  log.info('Deleting calendar event via Graph', { userId, eventId });

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  // 404 is acceptable - event already deleted
  if (!response.ok && response.status !== 404) {
    const errorText = await response.text();
    log.error('Failed to delete calendar event', null, { status: response.status, error: errorText.slice(0, 200) });
    throw new Error(`Failed to delete calendar event: ${response.status}`);
  }
}

// Get event to retrieve Teams URL if missing
async function getCalendarEvent(
  accessToken: string,
  userId: string,
  eventId: string,
  log: ReturnType<typeof createLogger>
): Promise<GraphCalendarEvent | null> {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userId)}/events/${encodeURIComponent(eventId)}`;
  
  const response = await fetch(url, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    log.warn('Failed to get calendar event', { status: response.status });
    return null;
  }

  return await response.json();
}

Deno.serve(async (req: Request) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    log.info('Outlook calendar sync request');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedCronSecret = Deno.env.get('CRON_SECRET');

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Require either a valid cron secret OR an authenticated user.
    let userId: string | null = null;
    const isSystemCall = !!cronSecret && !!expectedCronSecret && cronSecret === expectedCronSecret;
    const authHeader = req.headers.get('Authorization');

    if (!isSystemCall) {
      if (!authHeader?.startsWith('Bearer ')) {
        log.warn('Unauthorized: missing bearer token and cron secret');
        return corsJsonResponse({ error: 'Unauthorized', code: ErrorCode.UNAUTHORIZED }, req, 401);
      }
      const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data: { user }, error: userErr } = await supabaseUser.auth.getUser();
      if (userErr || !user) {
        log.warn('Unauthorized: invalid bearer token');
        return corsJsonResponse({ error: 'Unauthorized', code: ErrorCode.UNAUTHORIZED }, req, 401);
      }
      userId = user.id;
    }

    log.info('Auth check completed', { hasUser: !!userId, isSystemCall });

    const body = await req.json() as SyncRequest;
    let { session_id, action } = body;

    if (!session_id || !action) {
      return corsJsonResponse({ error: 'session_id and action are required', code: ErrorCode.BAD_REQUEST }, req, 400);
    }

    // Fetch session with workspace info including assigned consultant
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select(`
        id, title, scheduled_at, duration, location, notes, outlook_event_id, outlook_sync_status, outlook_owner_email, workspace_id, created_by,
        workspaces!inner(assigned_consultor_id, startups(name))
      `)
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      log.error('Session not found', sessionError);
      return corsJsonResponse({ error: 'Session not found', code: ErrorCode.NOT_FOUND }, req, 404);
    }

    // Type assertion for session data
    const typedSession = session as unknown as SessionData;

    // Check user has access (skip check if no user - system call)
    if (userId) {
      const { data: hasAccess } = await supabaseAdmin.rpc('has_workspace_access', {
        _user_id: userId,
        _workspace_id: typedSession.workspace_id,
      });

      if (!hasAccess) {
        return corsJsonResponse({ error: 'Access denied', code: ErrorCode.FORBIDDEN }, req, 403);
      }
    }

    // Fetch Outlook settings
    const { data: outlookSettings, error: settingsError } = await supabaseAdmin
      .from('outlook_calendar_settings')
      .select('*')
      .eq('workspace_id', typedSession.workspace_id)
      .eq('enabled', true)
      .maybeSingle();

    if (settingsError) {
      log.error('Error fetching Outlook settings', settingsError);
      throw settingsError;
    }

    if (!outlookSettings) {
      // Mark session so UI shows why it didn't sync
      await supabaseAdmin
        .from('sessions')
        .update({
          outlook_sync_status: 'not_configured',
          outlook_sync_error: 'Outlook calendar sync not enabled for this workspace',
        })
        .eq('id', session_id);

      return corsJsonResponse({
        success: false,
        reason: 'not_configured',
        message: 'Outlook calendar sync not enabled for this workspace',
      }, req);
    }

    const startupName = typedSession.workspaces?.startups?.name || 'Session';
    const appUrl = Deno.env.get('APP_URL') || 'https://startupleiria.app';
    const sessionLink = `${appUrl}/workspace/${typedSession.workspace_id}?tab=sessions`;

    // ========== WEBHOOK MODE ==========
    if (outlookSettings.sync_mode === 'webhook') {
      if (!outlookSettings.webhook_url) {
        return corsJsonResponse({ 
          success: false, 
          reason: 'no_webhook_url',
          message: 'Webhook URL not configured'
        }, req);
      }

      const startDate = new Date(typedSession.scheduled_at);
      const endDate = new Date(startDate.getTime() + (typedSession.duration || 60) * 60 * 1000);

      const webhookPayload = {
        action,
        event_id: typedSession.outlook_event_id,
        session_id: typedSession.id,
        title: `${typedSession.title} - ${startupName}`,
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        location: typedSession.location || '',
        description: `${typedSession.notes || ''}\n\nView in Startup Leiria: ${sessionLink}`,
        is_online_meeting: true,
        attendees: [],
        workspace_id: typedSession.workspace_id,
      };

      log.info('Sending to Power Automate webhook', { action, session_id });
      
      const webhookResponse = await fetch(outlookSettings.webhook_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookPayload),
      });

      if (!webhookResponse.ok) {
        log.error('Power Automate webhook failed', null, { status: webhookResponse.status });
        
        await supabaseAdmin
          .from('sessions')
          .update({ 
            outlook_sync_status: 'error',
            outlook_sync_error: `Webhook returned ${webhookResponse.status}`
          })
          .eq('id', session_id);

        return corsJsonResponse({ 
          success: false, 
          error: `Webhook returned ${webhookResponse.status}`
        }, req, 502);
      }

      let eventId = typedSession.outlook_event_id;
      let teamsMeetingUrl = null;
      try {
        const responseData = await webhookResponse.json();
        if (responseData.event_id) eventId = responseData.event_id;
        if (responseData.teams_url) teamsMeetingUrl = responseData.teams_url;
      } catch {
        // Response may not be JSON
      }

      await supabaseAdmin
        .from('sessions')
        .update({ 
          outlook_sync_status: action === 'delete' ? 'pending' : 'synced',
          outlook_synced_at: new Date().toISOString(),
          outlook_sync_error: null,
          ...(eventId && { outlook_event_id: eventId }),
          ...(teamsMeetingUrl && { teams_meeting_url: teamsMeetingUrl }),
        })
        .eq('id', session_id);

      log.info('Outlook sync via webhook completed', { action, eventId });
      return corsJsonResponse({ 
        success: true, 
        mode: 'webhook',
        event_id: eventId,
        teams_meeting_url: teamsMeetingUrl,
      }, req);

    // ========== GRAPH API MODE ==========
    } else if (outlookSettings.sync_mode === 'graph') {
      // Get Graph credentials
      const credentials = await getGraphCredentials(supabaseAdmin, typedSession.workspace_id, log);
      
      if (!credentials) {
        return corsJsonResponse({ 
          success: false, 
          reason: 'graph_not_configured',
          message: 'Microsoft Graph API credentials not configured'
        }, req);
      }

      // Resolve calendar owner email
      const calendarOwnerEmail = await resolveCalendarOwnerEmail(
        supabaseAdmin, 
        typedSession, 
        outlookSettings as { calendar_user_email?: string | null; use_custom_calendar_email?: boolean },
        log
      );

      if (!calendarOwnerEmail) {
        return corsJsonResponse({ 
          success: false, 
          reason: 'no_calendar_email',
          message: 'No calendar email could be determined. Assign a consultant to this workspace or configure a custom calendar email.'
        }, req);
      }

      log.info('Using calendar owner', { calendarOwnerEmail });

      try {
        // Get Graph API access token
        const accessToken = await getGraphAccessToken(credentials, log);

        const startDate = new Date(typedSession.scheduled_at);
        const endDate = new Date(startDate.getTime() + (typedSession.duration || 60) * 60 * 1000);

        // Send wall-clock time in Europe/Lisbon (the canonical app timezone)
        // instead of stripping Z from a UTC ISO and labeling it "UTC".
        // This matches what the founder/consultant saw in the booking UI
        // and removes any chance of the recipient seeing a shifted hour.
        const toLisbonWallClock = (d: Date): string => {
          const dtf = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Lisbon',
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit',
            hour12: false,
          });
          const parts = dtf.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
            if (p.type !== 'literal') acc[p.type] = p.value;
            return acc;
          }, {});
          const hh = parts.hour === '24' ? '00' : parts.hour;
          return `${parts.year}-${parts.month}-${parts.day}T${hh}:${parts.minute}:${parts.second}`;
        };

        // Build event object
        const eventData: GraphCalendarEvent = {
          subject: `${typedSession.title} - ${startupName}`,
          body: {
            contentType: 'HTML',
            content: `<p>${typedSession.notes || ''}</p><p><a href="${sessionLink}">View in Startup Leiria</a></p>`,
          },
          start: {
            dateTime: toLisbonWallClock(startDate),
            timeZone: 'Europe/Lisbon',
          },
          end: {
            dateTime: toLisbonWallClock(endDate),
            timeZone: 'Europe/Lisbon',
          },
          isOnlineMeeting: true,
          onlineMeetingProvider: 'teamsForBusiness',
        };

        if (typedSession.location) {
          eventData.location = { displayName: typedSession.location };
        }

        let eventId = typedSession.outlook_event_id;
        let teamsMeetingUrl: string | null = null;
        let createdEvent: GraphCalendarEvent | null = null;
        const previousOwnerEmail = typedSession.outlook_owner_email;

        // IDEMPOTENCY: If action=create but event already exists, treat as update
        if (action === 'create' && eventId) {
          log.info('Create requested but event exists, switching to update', { eventId });
          action = 'update';
        }

        // OWNER CHANGE DETECTION: If updating and owner changed, delete old and create new
        if (action === 'update' && eventId && previousOwnerEmail && previousOwnerEmail !== calendarOwnerEmail) {
          log.info('Calendar owner changed, migrating event', { 
            from: previousOwnerEmail, 
            to: calendarOwnerEmail 
          });
          
          // Delete from old owner's calendar
          try {
            await deleteCalendarEvent(accessToken, previousOwnerEmail, eventId, log);
            log.info('Deleted event from previous owner calendar');
          } catch (delErr) {
            log.warn('Failed to delete from old calendar, continuing', { error: String(delErr) });
          }
          
          // Switch to create for new owner
          action = 'create';
          eventId = null;
        }

        if (action === 'create') {
          createdEvent = await createCalendarEvent(accessToken, calendarOwnerEmail, eventData, log);
          eventId = createdEvent.id || null;
          teamsMeetingUrl = createdEvent.onlineMeeting?.joinUrl || null;
          
        } else if (action === 'update' && eventId) {
          createdEvent = await updateCalendarEvent(accessToken, calendarOwnerEmail, eventId, eventData, log);

          // If update returned null (204), or if Teams URL still missing, re-fetch with retries
          if (!createdEvent || !createdEvent.onlineMeeting?.joinUrl) {
            for (let i = 0; i < 3; i++) {
              const refetched = await getCalendarEvent(accessToken, calendarOwnerEmail, eventId, log);
              if (refetched?.onlineMeeting?.joinUrl) {
                createdEvent = refetched;
                break;
              }
              createdEvent = refetched;
              await new Promise((r) => setTimeout(r, 800));
            }
          }
          teamsMeetingUrl = createdEvent?.onlineMeeting?.joinUrl || null;
          
        } else if (action === 'delete' && eventId) {
          // Use the stored owner email for deletion
          const deleteFromEmail = previousOwnerEmail || calendarOwnerEmail;
          await deleteCalendarEvent(accessToken, deleteFromEmail, eventId, log);
          eventId = null;
        }

        // Update session with sync status and owner email
        await supabaseAdmin
          .from('sessions')
          .update({ 
            outlook_sync_status: action === 'delete' ? 'pending' : 'synced',
            outlook_synced_at: new Date().toISOString(),
            outlook_sync_error: null,
            outlook_event_id: eventId,
            outlook_owner_email: action === 'delete' ? null : calendarOwnerEmail,
            ...(teamsMeetingUrl && { teams_meeting_url: teamsMeetingUrl }),
          })
          .eq('id', session_id);

        log.info('Outlook sync via Graph API completed', { action, eventId, teamsMeetingUrl, calendarOwnerEmail });
        
        return corsJsonResponse({ 
          success: true, 
          mode: 'graph',
          event_id: eventId,
          teams_meeting_url: teamsMeetingUrl,
          calendar_owner: calendarOwnerEmail,
        }, req);

      } catch (graphError: unknown) {
        const errorMessage = safeErrorMessage(graphError);
        log.error('Graph API sync failed', graphError);
        
        // Log integration error
        await supabaseAdmin
          .from('integration_errors')
          .insert({
            source: 'outlook_graph',
            error_message: errorMessage,
            workspace_id: typedSession.workspace_id,
          });

        await supabaseAdmin
          .from('sessions')
          .update({ 
            outlook_sync_status: 'error',
            outlook_sync_error: errorMessage.slice(0, 200),
          })
          .eq('id', session_id);

        return corsJsonResponse({ 
          success: false, 
          error: errorMessage
        }, req, 502);
      }
    }

    return corsJsonResponse({ 
      success: false, 
      reason: 'invalid_mode',
      message: `Unknown sync mode: ${outlookSettings.sync_mode}`
    }, req);

  } catch (error: unknown) {
    const errorMessage = safeErrorMessage(error);
    log.error('Outlook sync error', error);
    return corsJsonResponse({ error: errorMessage, code: ErrorCode.INTERNAL_ERROR }, req, 500);
  }
});
