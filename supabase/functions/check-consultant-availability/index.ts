/**
 * Check Consultant Calendar Availability via Microsoft Graph API
 * Returns free/busy slots for session scheduling
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { createLogger, generateRequestId, ErrorCode, safeErrorMessage } from '../_shared/security.ts';
import { validateUUID } from '../_shared/validation.ts';

const FUNCTION_NAME = 'check-consultant-availability';

interface AvailabilityRequest {
  workspaceId: string;
  date: string; // YYYY-MM-DD format
  durationMinutes?: number;
}

interface TimeSlot {
  start: string;
  end: string;
  available: boolean;
}

interface GraphFreeBusyResponse {
  value: Array<{
    scheduleId: string;
    availabilityView: string;
    error?: { message?: string; responseCode?: string };
    scheduleItems: Array<{
      status: string;
      start: { dateTime: string; timeZone: string };
      end: { dateTime: string; timeZone: string };
    }>;
  }>;
}

// Get Graph credentials with env var priority
async function getGraphCredentials(supabaseAdmin: SupabaseClient): Promise<{
  tenantId: string;
  clientId: string;
  clientSecret: string;
} | null> {
  const envClientSecret = Deno.env.get('MS_GRAPH_CLIENT_SECRET');
  
  // Support both 'graph_api' and 'microsoft_graph' for backward compatibility
  const { data: globalSettings } = await supabaseAdmin
    .from('global_integration_settings')
    .select('settings_json, is_enabled')
    .in('integration_type', ['graph_api', 'microsoft_graph'])
    .eq('is_enabled', true)
    .limit(1)
    .maybeSingle();
  
  if (!globalSettings?.settings_json) return null;

  const globalJson = globalSettings.settings_json as {
    tenant_id?: string;
    client_id?: string;
    client_secret?: string;
  };
  
  const tenantId = globalJson.tenant_id;
  const clientId = globalJson.client_id;
  const clientSecret = envClientSecret || globalJson.client_secret;
  
  if (!tenantId || !clientId || !clientSecret) return null;
  
  return { tenantId, clientId, clientSecret };
}

// Get Microsoft Graph access token
async function getGraphAccessToken(credentials: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${credentials.tenantId}/oauth2/v2.0/token`;
  
  const params = new URLSearchParams({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to get Graph token: ${response.status}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Get free/busy schedule from Graph API using application permissions
async function getFreeBusySchedule(
  accessToken: string,
  userEmail: string,
  startTime: string,
  endTime: string,
  log: ReturnType<typeof createLogger>
): Promise<GraphFreeBusyResponse> {
  // With application permissions (client credentials), use /users/{id}/calendar/getSchedule
  // The /me endpoint only works with delegated permissions
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(userEmail)}/calendar/getSchedule`;
  
  const requestBody = {
    schedules: [userEmail],
    startTime: { dateTime: startTime, timeZone: 'Europe/Lisbon' },
    endTime: { dateTime: endTime, timeZone: 'Europe/Lisbon' },
    availabilityViewInterval: 30, // 30-minute slots
  };

  log.info('Calling Graph getSchedule', { url, email: userEmail });

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    log.error('Graph getSchedule failed', null, { status: response.status, error: errorText.slice(0, 300) });
    throw new Error(`Failed to get schedule: ${response.status} - ${errorText.slice(0, 100)}`);
  }

  return await response.json();
}

// Generate time slots for a day with availability info
function generateDaySlots(
  date: string,
  availabilityView: string,
  durationMinutes: number = 60
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const workStart = 9; // 9 AM
  const workEnd = 18; // 6 PM
  
  // availabilityView is a string where each char represents 30 min
  // 0 = free, 1 = tentative, 2 = busy, 3 = out of office, 4 = working elsewhere
  
  for (let hour = workStart; hour < workEnd; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const slotEndHour = hour + Math.floor((minute + durationMinutes) / 60);
      const slotEndMinute = (minute + durationMinutes) % 60;
      
      if (slotEndHour > workEnd || (slotEndHour === workEnd && slotEndMinute > 0)) {
        continue; // Slot would exceed working hours
      }
      
      const startStr = `${date}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
      const endStr = `${date}T${slotEndHour.toString().padStart(2, '0')}:${slotEndMinute.toString().padStart(2, '0')}:00`;
      
      // Calculate which 30-min blocks this slot spans
      const slotStartIndex = (hour - workStart) * 2 + (minute === 30 ? 1 : 0);
      const blocksNeeded = Math.ceil(durationMinutes / 30);
      
      let isAvailable = true;
      for (let i = 0; i < blocksNeeded && slotStartIndex + i < availabilityView.length; i++) {
        const status = availabilityView[slotStartIndex + i];
        if (status !== '0') {
          isAvailable = false;
          break;
        }
      }
      
      slots.push({
        start: startStr,
        end: endStr,
        available: isAvailable,
      });
    }
  }
  
  return slots;
}

Deno.serve(async (req: Request) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    log.info('Checking consultant availability');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return corsJsonResponse({ error: 'Unauthorized', code: ErrorCode.UNAUTHORIZED }, req, 401);
    }
    
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user } } = await supabaseUser.auth.getUser();
    
    if (!user) {
      return corsJsonResponse({ error: 'Unauthorized', code: ErrorCode.UNAUTHORIZED }, req, 401);
    }

    // RC12: validar a entrada (antes: JSON inválido -> 500; durationMinutes=0 marcava todos os slots livres; data livre ia direta ao Graph)
    const body = await req.json().catch(() => null) as Partial<AvailabilityRequest> | null;
    const wsCheck = validateUUID(body?.workspaceId, 'workspaceId');
    const date = body?.date;
    const durationMinutes = body?.durationMinutes ?? 60;
    const parsedDate = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null;
    const dateOk = !!parsedDate && !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === date;
    const durationOk = Number.isInteger(durationMinutes) && durationMinutes >= 15 && durationMinutes <= 240;
    if (!wsCheck.valid || !dateOk || !durationOk) {
      return corsJsonResponse({ error: 'workspaceId (uuid), date (YYYY-MM-DD) and durationMinutes (15-240) must be valid', code: ErrorCode.BAD_REQUEST }, req, 400);
    }
    const workspaceId = wsCheck.value!;

    // Check user has access to workspace
    const { data: hasAccess } = await supabaseAdmin.rpc('has_workspace_access', {
      _user_id: user.id,
      _workspace_id: workspaceId,
    });

    if (!hasAccess) {
      return corsJsonResponse({ error: 'Access denied', code: ErrorCode.FORBIDDEN }, req, 403);
    }

    // Resolve consultant: prefer workspace_users membership; fallback to assigned_consultor_id (SLA field)
    let consultantUserId: string | null = null;

    const { data: consultantMembership, error: consultantErr } = await supabaseAdmin
      .from('workspace_users')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('role', 'consultor')
      .eq('active', true)
      .maybeSingle();

    if (consultantErr) {
      log.error('Failed to fetch consultant membership', { consultantErr });
    } else if (consultantMembership?.user_id) {
      consultantUserId = consultantMembership.user_id;
    }

    if (!consultantUserId) {
      const { data: workspaceRow } = await supabaseAdmin
        .from('workspaces')
        .select('assigned_consultor_id')
        .eq('id', workspaceId)
        .maybeSingle();
      if (workspaceRow?.assigned_consultor_id) {
        consultantUserId = workspaceRow.assigned_consultor_id;
        log.info('Using assigned_consultor_id fallback', { workspaceId, consultantUserId });
      }
    }

    if (!consultantUserId) {
      log.info('No consultant membership or assignment found', { workspaceId });
      return corsJsonResponse(
        {
          success: false,
          reason: 'no_consultant',
          message: 'No consultant assigned to this workspace',
          slots: [],
        },
        req,
      );
    }

    const { data: consultantProfile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name')
      .eq('id', consultantUserId)
      .maybeSingle();

    if (profileErr) {
      log.error('Failed to fetch consultant profile', { profileErr, userId: consultantUserId });
    }

    const consultantEmail = consultantProfile?.email;
    const consultantName = consultantProfile?.full_name;

    if (!consultantEmail) {
      log.info('Consultant has no email on profile', { workspaceId, userId: consultantUserId });
      return corsJsonResponse(
        {
          success: false,
          reason: 'no_email',
          message: 'Consultant has no email configured',
          slots: [],
        },
        req,
      );
    }

    // Check if Graph API is configured
    const credentials = await getGraphCredentials(supabaseAdmin);

    if (!credentials) {
      // Do NOT guess availability. Force manual scheduling when calendar integration isn't configured.
      log.info('Graph API not configured; refusing to generate estimated availability');
      return corsJsonResponse(
        {
          success: false,
          reason: 'no_graph_integration',
          consultantEmail,
          consultantName,
          slots: [],
          warning: 'Calendário do consultor não está ligado; use "Manual Time" ou ligue a integração.',
        },
        req,
      );
    }

    // Get Graph access token and free/busy schedule
    try {
      const accessToken = await getGraphAccessToken(credentials);

      const startTime = `${date}T09:00:00`;
      const endTime = `${date}T18:00:00`;

      const schedule = await getFreeBusySchedule(accessToken, consultantEmail, startTime, endTime, log);

      // RC12: o Graph responde 200 com `error` e availabilityView vazia quando a caixa de correio não existe/não é legível;
      // antes isto devolvia TODOS os slots como livres (generateDaySlots trata posições em falta como livres).
      // 09:00-18:00 em blocos de 30 min = 18 caracteres.
      const first = schedule.value?.[0];
      if (!first || first.error || (first.availabilityView ?? '').length < 18) {
        // If Graph didn't return any schedule, treat as unverifiable (don't guess).
        return corsJsonResponse(
          {
            success: false,
            reason: 'no_schedule',
            consultantEmail,
            consultantName,
            slots: [],
            warning: 'Não foi possível obter o free/busy do consultor para este dia.',
          },
          req,
        );
      }

      const slots = generateDaySlots(date, first.availabilityView, durationMinutes);

      log.info('Availability check complete', {
        date,
        availableSlots: slots.filter((s) => s.available).length,
        totalSlots: slots.length,
      });

      return corsJsonResponse(
        {
          success: true,
          consultantEmail,
          consultantName,
          slots: slots.filter((s) => s.available),
        },
        req,
      );
    } catch (graphError) {
      log.error('Graph API error', graphError);

      // On Graph error, do NOT guess.
      return corsJsonResponse(
        {
          success: false,
          reason: 'graph_error',
          consultantEmail,
          consultantName,
          slots: [],
          warning: 'Erro ao validar disponibilidade no calendário do consultor. Use "Manual Time" e confirme com o consultor.',
        },
        req,
      );
    }

  } catch (error) {
    log.error('Check availability failed', error);
    return corsJsonResponse({ 
      error: safeErrorMessage(error), 
      code: ErrorCode.INTERNAL_ERROR
    }, req, 500);
  }
});
