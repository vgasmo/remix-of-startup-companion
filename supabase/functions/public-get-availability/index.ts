/**
 * Public Get Availability - Returns available time slots for public booking
 * Uses real Graph API calendar data when configured
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { addDays, format } from "https://esm.sh/date-fns@3.6.0";
import { handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { resolveFirstContactRoute, NoRouteError } from '../_shared/first-contact-routing.ts';

interface TimeSlot {
  date: string;
  time: string;
  available: boolean;
}

// Get Graph credentials with env var priority
async function getGraphCredentials(supabase: any): Promise<{
  tenantId: string;
  clientId: string;
  clientSecret: string;
} | null> {
  const envClientSecret = Deno.env.get('MS_GRAPH_CLIENT_SECRET');
  
  const { data: graphSettings } = await supabase
    .from('global_integration_settings')
    .select('settings_json, is_enabled')
    .in('integration_type', ['graph_api', 'microsoft_graph'])
    .eq('is_enabled', true)
    .limit(1)
    .maybeSingle();
  
  if (!graphSettings?.settings_json) return null;

  const globalJson = graphSettings.settings_json as {
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

// Get free/busy schedule from Graph API
async function getFreeBusySchedule(
  accessToken: string,
  email: string,
  startTime: string,
  endTime: string
): Promise<{ availabilityView: string } | null> {
  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${email}/calendar/getSchedule`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        schedules: [email],
        startTime: { dateTime: startTime, timeZone: 'Europe/Lisbon' },
        endTime: { dateTime: endTime, timeZone: 'Europe/Lisbon' },
        availabilityViewInterval: 30,
      }),
    }
  );

  if (!response.ok) {
    console.error('Graph schedule error:', response.status);
    return null;
  }

  const data = await response.json();
  return data.value?.[0] || null;
}

// Generate time slots from availability view
function generateSlotsFromAvailability(date: string, availabilityView: string): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const workStart = 9;
  const times = ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00'];
  
  for (const time of times) {
    const [hour, minute] = time.split(':').map(Number);
    const slotStartIndex = (hour - workStart) * 2 + (minute === 30 ? 1 : 0);
    
    let isAvailable = true;
    for (let i = 0; i < 2 && slotStartIndex + i < availabilityView.length; i++) {
      const status = availabilityView[slotStartIndex + i];
      if (status !== '0') {
        isAvailable = false;
        break;
      }
    }
    
    slots.push({ date, time, available: isAvailable });
  }
  
  return slots;
}

// Helper: resolve consultant email/name from a routing record
async function resolveConsultantFromRouting(
  supabase: any,
  routing: { consultant_ids: string[]; mode: string; round_robin_index?: number }
): Promise<{ email: string | null; name: string | null }> {
  const consultantId = routing.consultant_ids?.[0] || null;
  if (!consultantId) return { email: null, name: null };
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name")
    .eq("id", consultantId)
    .maybeSingle();
  
  return { email: profile?.email || null, name: profile?.full_name || null };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsOptions(req);
  }

  try {
    let body: { token?: unknown; action?: unknown; program_id?: unknown };
    try {
      body = await req.json();
    } catch {
      return corsJsonResponse({ error: "Invalid JSON body" }, req, 400);
    }

    const { token, action, program_id: selectedProgramId } = body;

    if (!token || typeof token !== 'string' || token.length > 500) {
      return corsJsonResponse({ error: "Invalid or missing token" }, req, 400);
    }

    if (action !== undefined && action !== 'validate' && action !== 'get_slots') {
      return corsJsonResponse({ error: "Invalid action" }, req, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if public booking is enabled
    const { data: flag } = await supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", "public_first_contact_booking")
      .maybeSingle();

    if (!flag?.enabled) {
      return corsJsonResponse({ valid: false, error: "Public booking is not enabled" }, req, 403);
    }

    let consultantEmail: string | null = null;
    let consultantName: string | null = null;
    let programId: string | null = null;
    let programName: string | null = null;
    let routingOptions: Array<{ program_id: string | null; program_name: string; scope: string }> = [];

    if (token === 'demo') {
      // Fetch ALL active routings
      const { data: allRoutings } = await supabase
        .from("intake_routing")
        .select("id, scope, program_id, mode, consultant_ids, round_robin_index")
        .eq("active", true)
        .order("scope", { ascending: true });

      // Fetch all published, active programs (exclude drafts/archived)
      const { data: allPrograms } = await supabase
        .from("programs")
        .select("id, name")
        .eq("is_active", true)
        .eq("status", "active")
        .order("name");

      // Build routing options: global + all active programs
      const hasGlobalRoute = allRoutings?.some(r => r.scope === 'global');
      if (hasGlobalRoute) {
        routingOptions.push({ program_id: null, program_name: 'Geral', scope: 'global' });
      }
      // Only expose programs that have an ACTIVE program-scoped routing.
      // A program being active in the catalog is not enough — staff must have
      // explicitly enabled intake for it.
      const activeProgramRouteIds = new Set(
        (allRoutings ?? [])
          .filter(r => r.scope === 'program' && r.program_id)
          .map(r => r.program_id as string),
      );
      if (allPrograms) {
        for (const prog of allPrograms) {
          if (!activeProgramRouteIds.has(prog.id)) continue;
          routingOptions.push({ program_id: prog.id, program_name: prog.name, scope: 'program' });
        }
      }

      // Determine which routing to use for slots
      let chosenRouting = null;
      if (selectedProgramId === 'global' || selectedProgramId === null || selectedProgramId === '') {
        // User selected global or default
        chosenRouting = allRoutings?.find(r => r.scope === 'global') || allRoutings?.[0] || null;
      } else if (typeof selectedProgramId === 'string') {
        // User selected a specific program — try program-specific, fallback to global
        chosenRouting = allRoutings?.find(r => r.program_id === selectedProgramId)
          || allRoutings?.find(r => r.scope === 'global')
          || null;
        if (chosenRouting?.program_id) {
          const { data: prog } = await supabase.from("programs").select("id, name").eq("id", chosenRouting.program_id).maybeSingle();
          programId = prog?.id || null;
          programName = prog?.name || null;
        }
      } else {
        // No selection yet — use first routing
        chosenRouting = allRoutings?.[0] || null;
      }

      if (chosenRouting) {
        const consultant = await resolveConsultantFromRouting(supabase, chosenRouting);
        consultantEmail = consultant.email;
        consultantName = consultant.name;
        
        if (!programId && chosenRouting.program_id) {
          const { data: prog } = await supabase.from("programs").select("id, name").eq("id", chosenRouting.program_id).maybeSingle();
          programId = prog?.id || null;
          programName = prog?.name || null;
        }
      }

      if (!programId && !selectedProgramId) {
        // Fallback: first program
        const { data: programs } = await supabase.from("programs").select("id, name").limit(1);
        programId = programs?.[0]?.id || null;
        programName = programs?.[0]?.name || null;
      }
    } else {
      const tokenHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      const tokenHex = Array.from(new Uint8Array(tokenHash)).map(b => b.toString(16).padStart(2, "0")).join("");

      let linkProgramId: string | null = null;

      try {
        const { data: linkData } = await supabase
          .from("public_booking_links")
          .select("id, owner_consultant_id, program_id, active, expires_at")
          .eq("token_hash", tokenHex)
          .eq("active", true)
          .maybeSingle();
        
        if (linkData) {
          if (linkData.expires_at && new Date(linkData.expires_at) < new Date()) {
            return corsJsonResponse({ valid: false, error: "This booking link has expired" }, req, 403);
          }
          
          if (linkData.owner_consultant_id) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("email, full_name")
              .eq("id", linkData.owner_consultant_id)
              .maybeSingle();
            
            consultantEmail = profile?.email || null;
            consultantName = profile?.full_name || null;
          }
          
          linkProgramId = linkData.program_id || null;
          
          if (linkData.program_id) {
            const { data: program } = await supabase
              .from("programs")
              .select("id, name")
              .eq("id", linkData.program_id)
              .maybeSingle();
            
            programId = program?.id || null;
            programName = program?.name || null;
          }
        }
      } catch {
        console.log("public_booking_links table not found, using demo mode");
      }
      
      // If the booking link doesn't have a fixed program, fetch routing options
      if (!linkProgramId) {
        const { data: allRoutings } = await supabase
          .from("intake_routing")
          .select("id, scope, program_id, mode, consultant_ids, round_robin_index")
          .eq("active", true)
          .order("scope", { ascending: true });

        // Fetch all published, active programs to show all options (exclude drafts/archived)
        const { data: allPrograms } = await supabase
          .from("programs")
          .select("id, name")
          .eq("is_active", true)
          .eq("status", "active")
          .order("name");

        // Build routing options: global + all active programs
        const hasGlobalRoute = allRoutings?.some(r => r.scope === 'global');
        if (hasGlobalRoute) {
          routingOptions.push({ program_id: null, program_name: 'Incubação Geral', scope: 'global' });
        }
        
        // Only expose programs that have an ACTIVE program-scoped routing.
        const activeProgramRouteIds = new Set(
          (allRoutings ?? [])
            .filter(r => r.scope === 'program' && r.program_id)
            .map(r => r.program_id as string),
        );
        if (allPrograms) {
          for (const prog of allPrograms) {
            if (!activeProgramRouteIds.has(prog.id)) continue;
            routingOptions.push({ program_id: prog.id, program_name: prog.name, scope: 'program' });
          }
        }

        // Resolve consultant from selected routing (with fallback to global)
        if (routingOptions.length > 0 && typeof selectedProgramId === 'string' && selectedProgramId !== '') {
          let chosenRouting = selectedProgramId === 'global'
            ? allRoutings?.find(r => r.scope === 'global')
            : allRoutings?.find(r => r.program_id === selectedProgramId);
          
          // Fallback to global if no program-specific routing exists
          if (!chosenRouting && selectedProgramId !== 'global') {
            chosenRouting = allRoutings?.find(r => r.scope === 'global') ?? undefined;
          }
          
          if (chosenRouting) {
            const consultant = await resolveConsultantFromRouting(supabase, chosenRouting);
            consultantEmail = consultant.email;
            consultantName = consultant.name;
            if (chosenRouting.program_id) {
              const { data: prog } = await supabase.from("programs").select("id, name").eq("id", chosenRouting.program_id).maybeSingle();
              programId = prog?.id || null;
              programName = prog?.name || null;
            }
          }
        }
      }

      if (!programId && routingOptions.length === 0) {
        const { data: programs } = await supabase.from("programs").select("id, name").limit(1);
        programId = programs?.[0]?.id || null;
        programName = programs?.[0]?.name || null;
      }
    }

    if (action === "validate") {
      return corsJsonResponse({
        valid: true,
        tokenData: {
          id: token,
          program_id: programId,
          program_name: programName,
          consultant_id: null,
          consultant_name: consultantName,
          expires_at: null,
        },
        routingOptions: routingOptions.length > 1 ? routingOptions : undefined,
      }, req);
    }

    if (action === "get_slots") {
      const slots: TimeSlot[] = [];
      const now = new Date();

      // CANONICAL ROUTING: pick the exact consultant that public-book-first-contact will use,
      // so displayed availability matches the actual booking target. Failure to resolve is
      // fail-closed (503) — never silently show slots against an arbitrary consultant.
      try {
        const resolved = await resolveFirstContactRoute({
          supabase,
          token,
          selectedProgramId: typeof selectedProgramId === 'string' ? selectedProgramId : null,
        });
        consultantEmail = resolved.consultantEmail;
        consultantName = resolved.consultantName;
        if (resolved.programId) {
          programId = resolved.programId;
          programName = resolved.programName;
        }
      } catch (e) {
        if (e instanceof NoRouteError) {
          console.warn('resolveFirstContactRoute NO_ROUTE for get_slots:', e.reason, e.trace);
          return corsJsonResponse({
            error: 'Booking is currently unavailable. Please contact us directly.',
            reason: e.reason,
          }, req, 503);
        }
        throw e;
      }

      // FAIL-CLOSED: availability MUST come from a real calendar. If Graph is not
      // configured, credentials are missing, the token exchange fails, or every
      // per-day free/busy call fails, we return HTTP 503 with a calm message and
      // insert a system_alerts row for operators. We never fabricate weekday slots.
      const failClosed = async (
        reason: string,
        severity: 'high' | 'critical' = 'high',
        detail?: Record<string, unknown>,
      ) => {
        try {
          await supabase.from('system_alerts').insert({
            kind: 'public_availability_unavailable',
            severity,
            dedupe_key: `public_availability:${reason}:${consultantEmail ?? 'no-consultant'}:${new Date().toISOString().slice(0, 10)}`,
            payload: {
              reason,
              consultant_email: consultantEmail,
              consultant_name: consultantName,
              program_id: programId,
              program_name: programName,
              token_kind: token === 'demo' ? 'demo' : 'hashed',
              detail: detail ?? null,
              at: new Date().toISOString(),
            },
          });
        } catch (alertErr) {
          console.error('Failed to insert system_alerts row:', alertErr);
        }
        return corsJsonResponse(
          {
            status: 'unavailable',
            reason,
            error: 'A disponibilidade não pode ser confirmada de momento. Tente novamente em breve ou contacte-nos diretamente.',
          },
          req,
          503,
        );
      };

      const credentials = await getGraphCredentials(supabase);
      if (!credentials) {
        return failClosed('graph_not_configured');
      }
      if (!consultantEmail) {
        return failClosed('consultant_email_missing');
      }

      let accessToken: string;
      try {
        accessToken = await getGraphAccessToken(credentials);
      } catch (tokenErr) {
        console.error('Graph token error:', tokenErr instanceof Error ? tokenErr.message : tokenErr);
        return failClosed('graph_token_failed', 'critical', {
          message: tokenErr instanceof Error ? tokenErr.message : String(tokenErr),
        });
      }

      let scheduleCallsAttempted = 0;
      let scheduleCallsFailed = 0;

      for (let day = 1; day <= 14; day++) {
        const date = addDays(now, day);
        const dayOfWeek = date.getDay();
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        const dateStr = format(date, 'yyyy-MM-dd');
        const startTime = `${dateStr}T09:00:00`;
        const endTime = `${dateStr}T18:00:00`;

        scheduleCallsAttempted += 1;
        let schedule: { availabilityView: string } | null = null;
        try {
          schedule = await getFreeBusySchedule(accessToken, consultantEmail, startTime, endTime);
        } catch (scheduleErr) {
          console.error('Graph schedule threw:', scheduleErr instanceof Error ? scheduleErr.message : scheduleErr);
          schedule = null;
        }

        if (schedule?.availabilityView) {
          slots.push(...generateSlotsFromAvailability(dateStr, schedule.availabilityView));
        } else {
          scheduleCallsFailed += 1;
        }
      }

      // If EVERY schedule call failed, we have no truthful data — fail closed.
      // (Partial-day failures are logged but the remaining real slots are still
      // returned so bookable days aren't hidden.)
      if (scheduleCallsAttempted > 0 && scheduleCallsFailed === scheduleCallsAttempted) {
        return failClosed('graph_schedule_all_failed', 'critical', {
          attempted: scheduleCallsAttempted,
          failed: scheduleCallsFailed,
        });
      }

      return corsJsonResponse(
        {
          status: 'ok',
          slots,
          consultantName,
          programId,
          programName,
          graphEnabled: true,
          partial: scheduleCallsFailed > 0,
          scheduleCallsAttempted,
          scheduleCallsFailed,
        },
        req,
      );
    }


    return corsJsonResponse({ error: "Invalid action" }, req, 400);
  } catch (error: unknown) {
    console.error("Error:", error instanceof Error ? error.message : 'Unknown error');
    return corsJsonResponse({ 
      error: "Unable to retrieve availability. Please try again or contact us directly." 
    }, req, 500);
  }
});
