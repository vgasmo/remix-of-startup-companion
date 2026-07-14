/**
 * Public Book First Contact - Creates funnel item and calendar event
 * Supports real Graph API calendar integration with Teams meeting
 * 
 * HARDENED: Input validation, rate limiting, safe error messages
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';

// Input validation constants
const MAX_NAME_LENGTH = 200;
const MAX_EMAIL_LENGTH = 254;
const MAX_PHONE_LENGTH = 50;
const MAX_ORG_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 2000;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;

interface BookingRequest {
  token: string;
  slot: { date: string; time: string };
  contact: {
    name: string;
    email: string;
    phone?: string;
    organization?: string;
    message?: string;
    sector?: string;
    stage?: string;
    referral_source?: string;
    has_team?: string;
    pitch_deck_path?: string;
    has_tech?: string;
    is_iies?: string;
    vertical?: string;
    help_expectation?: string;
    personal_intro?: string;
  };
}

// Validate and sanitize booking request
function validateBookingRequest(body: unknown): { valid: true; data: BookingRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }

  const req = body as Record<string, unknown>;

  if (!req.token || typeof req.token !== 'string' || req.token.length > 500) {
    return { valid: false, error: 'Invalid token' };
  }

  if (!req.slot || typeof req.slot !== 'object') {
    return { valid: false, error: 'Invalid slot' };
  }
  const slot = req.slot as Record<string, unknown>;
  
  if (!slot.date || typeof slot.date !== 'string' || !DATE_REGEX.test(slot.date)) {
    return { valid: false, error: 'Invalid date format (expected YYYY-MM-DD)' };
  }
  if (!slot.time || typeof slot.time !== 'string' || !TIME_REGEX.test(slot.time)) {
    return { valid: false, error: 'Invalid time format (expected HH:MM)' };
  }

  if (!req.contact || typeof req.contact !== 'object') {
    return { valid: false, error: 'Invalid contact information' };
  }
  const contact = req.contact as Record<string, unknown>;

  if (!contact.name || typeof contact.name !== 'string' || contact.name.trim().length === 0) {
    return { valid: false, error: 'Name is required' };
  }
  if (contact.name.length > MAX_NAME_LENGTH) {
    return { valid: false, error: `Name must be ${MAX_NAME_LENGTH} characters or less` };
  }

  if (!contact.email || typeof contact.email !== 'string') {
    return { valid: false, error: 'Email is required' };
  }
  const email = contact.email.trim().toLowerCase();
  if (!EMAIL_REGEX.test(email) || email.length > MAX_EMAIL_LENGTH) {
    return { valid: false, error: 'Invalid email address' };
  }

  let phone: string | undefined;
  if (contact.phone !== undefined && contact.phone !== null) {
    if (typeof contact.phone !== 'string' || contact.phone.length > MAX_PHONE_LENGTH) {
      return { valid: false, error: 'Invalid phone number' };
    }
    phone = contact.phone.trim() || undefined;
  }

  let organization: string | undefined;
  if (contact.organization !== undefined && contact.organization !== null) {
    if (typeof contact.organization !== 'string' || contact.organization.length > MAX_ORG_LENGTH) {
      return { valid: false, error: 'Invalid organization name' };
    }
    organization = contact.organization.trim() || undefined;
  }

  let message: string | undefined;
  if (contact.message !== undefined && contact.message !== null) {
    if (typeof contact.message !== 'string' || contact.message.length > MAX_MESSAGE_LENGTH) {
      return { valid: false, error: `Message must be ${MAX_MESSAGE_LENGTH} characters or less` };
    }
    message = contact.message.trim() || undefined;
  }

  // Extract questionnaire fields (optional, no strict validation needed)
  const sector = typeof contact.sector === 'string' ? contact.sector.trim().slice(0, 100) : undefined;
  const stage = typeof contact.stage === 'string' ? contact.stage.trim().slice(0, 100) : undefined;
  const referral_source = typeof contact.referral_source === 'string' ? contact.referral_source.trim().slice(0, 100) : undefined;
  const has_team = typeof contact.has_team === 'string' ? contact.has_team.trim().slice(0, 20) : undefined;
  const pitch_deck_path = typeof contact.pitch_deck_path === 'string' ? contact.pitch_deck_path.trim().slice(0, 500) : undefined;
  const has_tech = typeof contact.has_tech === 'string' ? contact.has_tech.trim().slice(0, 20) : undefined;
  const is_iies = typeof contact.is_iies === 'string' ? contact.is_iies.trim().slice(0, 20) : undefined;
  const vertical = typeof contact.vertical === 'string' ? contact.vertical.trim().slice(0, 100) : undefined;
  const help_expectation = typeof contact.help_expectation === 'string' ? contact.help_expectation.trim().slice(0, MAX_MESSAGE_LENGTH) : undefined;
  const personal_intro = typeof contact.personal_intro === 'string' ? contact.personal_intro.trim().slice(0, MAX_MESSAGE_LENGTH) : undefined;

  return {
    valid: true,
    data: {
      token: req.token as string,
      slot: { date: slot.date as string, time: slot.time as string },
      contact: { name: (contact.name as string).trim(), email, phone, organization, message, sector, stage, referral_source, has_team, pitch_deck_path, has_tech, is_iies, vertical, help_expectation, personal_intro },
    },
  };
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

// Create calendar event with Teams meeting
async function createCalendarEvent(
  accessToken: string,
  consultantEmail: string,
  slot: { date: string; time: string },
  contact: { name: string; email: string; organization?: string; message?: string }
): Promise<{ eventId: string; teamsLink: string | null }> {
  const startDateTime = `${slot.date}T${slot.time}:00`;
  const [hours, minutes] = slot.time.split(':').map(Number);
  const endHours = hours + 1;
  const endTime = `${endHours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
  const endDateTime = `${slot.date}T${endTime}:00`;
  
  const eventPayload = {
    subject: `First Contact Meeting - ${contact.name}${contact.organization ? ` (${contact.organization})` : ''}`,
    body: {
      contentType: "HTML",
      content: `
        <p><strong>First Contact Meeting</strong></p>
        <p><strong>Contact:</strong> ${contact.name}</p>
        <p><strong>Email:</strong> ${contact.email}</p>
        ${contact.organization ? `<p><strong>Organization:</strong> ${contact.organization}</p>` : ''}
        ${contact.message ? `<p><strong>Notes:</strong> ${contact.message}</p>` : ''}
        <p><em>Booked via Startup Leiria public booking</em></p>
      `,
    },
    start: { dateTime: startDateTime, timeZone: "Europe/Lisbon" },
    end: { dateTime: endDateTime, timeZone: "Europe/Lisbon" },
    attendees: [{ emailAddress: { address: contact.email, name: contact.name }, type: "required" }],
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
  };

  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(consultantEmail)}/events`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(eventPayload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to create calendar event:", errorText);
    throw new Error(`Failed to create calendar event: ${response.status}`);
  }

  const event = await response.json();
  
  return {
    eventId: event.id,
    teamsLink: event.onlineMeeting?.joinUrl || null,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsOptions(req);
  }

  try {
    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return corsJsonResponse({ success: false, error: "Invalid JSON body" }, req, 400);
    }

    const validation = validateBookingRequest(rawBody);
    if (!validation.valid) {
      return corsJsonResponse({ success: false, error: validation.error }, req, 400);
    }

    const { token, slot, contact } = validation.data;

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if public booking is enabled + strict calendar validation flag
    const { data: flags } = await supabase
      .from("feature_flags")
      .select("key, enabled")
      .in("key", ["public_first_contact_booking", "strict_calendar_validation"]);

    const flagMap = new Map((flags ?? []).map((f: { key: string; enabled: boolean }) => [f.key, f.enabled]));
    if (!flagMap.get("public_first_contact_booking")) {
      return corsJsonResponse({ success: false, error: "Public booking is not enabled" }, req, 403);
    }
    const strictCalendarValidation = flagMap.get("strict_calendar_validation") === true;

    // Rate limiting - check if this email has booked recently (max 2 per 24h)
    const { data: recentBookings } = await supabase
      .from("funnel_items")
      .select("id, created_at")
      .eq("contact_email", contact.email)
      .gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    if (recentBookings && recentBookings.length >= 2) {
      return corsJsonResponse({ 
        success: false, 
        error: "Too many booking attempts. Please try again later." 
      }, req, 429);
    }

    // Get consultant info for calendar event
    let consultantEmail: string | null = null;
    let consultantId: string | null = null;
    let consultantName: string | null = null;
    
    if (token !== 'demo') {
      try {
        const tokenHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
        const tokenHex = Array.from(new Uint8Array(tokenHash)).map(b => b.toString(16).padStart(2, "0")).join("");

        const { data: linkData } = await supabase
          .from("public_booking_links")
          .select("owner_consultant_id")
          .eq("token_hash", tokenHex)
          .eq("active", true)
          .maybeSingle();
        
        if (linkData?.owner_consultant_id) {
          consultantId = linkData.owner_consultant_id;
          const { data: profile } = await supabase
            .from("profiles")
            .select("email, full_name")
            .eq("id", consultantId)
            .maybeSingle();
          
          consultantEmail = profile?.email || null;
          consultantName = profile?.full_name || null;
        }
      } catch {
        // Table might not exist
      }
    }
    
    // Fallback: get any consultant
    if (!consultantEmail) {
      const { data: consultants } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "consultor")
        .limit(1);
      
      if (consultants?.[0]?.user_id) {
        consultantId = consultants[0].user_id;
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("id", consultantId)
          .maybeSingle();
        
        consultantEmail = profile?.email || null;
        consultantName = profile?.full_name || null;
      }
    }
    

    // Get the first program for the funnel item
    const { data: programs } = await supabase.from("programs").select("id").limit(1);
    const programId = programs?.[0]?.id || null;

    // === DUPLICATE CHECK: Prevent duplicate leads from same email ===
    const { data: existingLead } = await supabase
      .from("funnel_items")
      .select("id, stage, contact_name")
      .eq("contact_email", contact.email)
      .not("stage", "in", '("rejected","archived")')
      .limit(1);

    let funnelItemId: string;

    if (existingLead && existingLead.length > 0) {
      // Update existing lead with new booking time
      await supabase.from("funnel_items")
        .update({
          first_contact_at: `${slot.date}T${slot.time}:00`,
          stage: existingLead[0].stage === "new" ? "first_contact_booked" : existingLead[0].stage,
          notes: `Reagendado em ${slot.date}. ${contact.message || ""}`.trim(),
          last_activity_at: new Date().toISOString(),
        })
        .eq("id", existingLead[0].id);

      await supabase.from("funnel_events").insert({
        funnel_item_id: existingLead[0].id,
        event_type: "booking_rescheduled",
        metadata: { date: slot.date, time: slot.time, source: "public_booking" },
      });

      funnelItemId = existingLead[0].id;
    } else {
      // === ORIGINAL: Create new funnel item (only if no existing lead) ===
      // Build metadata from questionnaire fields
      const bookingMetadata: Record<string, unknown> = {};
      if (contact.sector) bookingMetadata.sector = contact.sector;
      if (contact.stage) bookingMetadata.startup_stage = contact.stage;
      if (contact.referral_source) bookingMetadata.referral_source = contact.referral_source;
      if (contact.has_team) bookingMetadata.has_team = contact.has_team;
      if (contact.pitch_deck_path) bookingMetadata.pitch_deck_path = contact.pitch_deck_path;
      if (contact.has_tech) bookingMetadata.has_tech = contact.has_tech;
      if (contact.is_iies) bookingMetadata.is_iies = contact.is_iies;
      if (contact.vertical) bookingMetadata.vertical = contact.vertical;
      if (contact.help_expectation) bookingMetadata.help_expectation = contact.help_expectation;
      if (contact.personal_intro) bookingMetadata.personal_intro = contact.personal_intro;
      bookingMetadata.booking_date = `${slot.date}T${slot.time}:00`;
      bookingMetadata.booking_source = 'public_form';

      const { data: funnelItem, error: funnelError } = await supabase
        .from("funnel_items")
        .insert({
          stage: "first_contact_booked",
          type: "lead",
          contact_name: contact.name,
          contact_email: contact.email,
          contact_phone: contact.phone || null,
          organization_name: contact.organization || null,
          notes: contact.message || null,
          source: "public_booking",
          program_id: programId,
          owner_consultant_id: consultantId,
          first_contact_at: `${slot.date}T${slot.time}:00`,
          metadata_json: bookingMetadata,
        })
        .select()
        .single();

      if (funnelError) throw funnelError;

      // Log event
      await supabase.from("funnel_events").insert({
        funnel_item_id: funnelItem.id,
        event_type: "created",
        to_stage: "first_contact_booked",
        metadata: { source: "public_booking", slot },
      });

      funnelItemId = funnelItem.id;
    }

    // Create calendar event via Graph API if configured
    let teamsLink: string | null = null;
    let calendarEventId: string | null = null;

    const credentials = await getGraphCredentials(supabase);

    if (credentials && consultantEmail) {
      try {
        const accessToken = await getGraphAccessToken(credentials);
        const eventResult = await createCalendarEvent(accessToken, consultantEmail, slot, contact);

        calendarEventId = eventResult.eventId;
        teamsLink = eventResult.teamsLink;

        console.log("Created calendar event:", calendarEventId, "Teams link:", teamsLink);

        if (teamsLink || calendarEventId) {
          await supabase
            .from("funnel_items")
            .update({
              notes: `${contact.message || ''}\n\n---\nTeams Link: ${teamsLink || 'N/A'}\nCalendar Event ID: ${calendarEventId || 'N/A'}`.trim(),
            })
            .eq("id", funnelItemId);
        }
      } catch (graphError) {
        console.error("Graph API error:", graphError);
        // Fail-closed: when strict_calendar_validation is on, a Graph failure
        // rolls back the booking so we never confirm a slot the calendar didn't accept.
        if (strictCalendarValidation) {
          await supabase.from("funnel_items").delete().eq("id", funnelItemId);
          return corsJsonResponse({
            success: false,
            error: "Calendar validation failed. Please try again or contact us directly.",
          }, req, 502);
        }
      }
    } else if (strictCalendarValidation) {
      // Flag on but Graph not configured → fail-closed (no silent bookings).
      await supabase.from("funnel_items").delete().eq("id", funnelItemId);
      return corsJsonResponse({
        success: false,
        error: "Calendar validation is required but not configured. Please contact us directly.",
      }, req, 503);
    } else {
      console.log("Graph API not configured, skipping calendar event creation");
    }

    // === Send alert email to consultant (fire-and-forget) ===
    try {
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      const APP_URL = Deno.env.get("APP_URL") || "https://fb.startupleiria.com";
      if (RESEND_API_KEY && consultantEmail) {
        const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));
        const displayName = consultantName || 'Consultor';
        const dt = `${slot.date} ${slot.time}`;
        const teamsBlock = teamsLink
          ? `<p><a href="${esc(teamsLink)}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">Abrir reunião no Teams</a></p>`
          : '';
        const html = `
          <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #eee; border-radius: 8px; overflow: hidden;">
            <div style="padding: 20px 24px; background: #111; color: #fff;">
              <h1 style="margin:0;font-size:18px;">Nova marcação de Primeiro Contacto</h1>
            </div>
            <div style="padding: 20px 24px;">
              <p style="margin:0 0 12px;">Olá ${esc(displayName)},</p>
              <p style="margin:0 0 16px;">Recebeste uma nova marcação através do formulário público.</p>
              <table style="width:100%;font-size:14px;border-collapse:collapse;">
                <tr><td style="padding:6px 0;color:#666;">Data</td><td style="padding:6px 0;"><strong>${esc(dt)} (Europe/Lisbon)</strong></td></tr>
                <tr><td style="padding:6px 0;color:#666;">Contacto</td><td style="padding:6px 0;">${esc(contact.name)}</td></tr>
                <tr><td style="padding:6px 0;color:#666;">Email</td><td style="padding:6px 0;">${esc(contact.email)}</td></tr>
                ${contact.phone ? `<tr><td style="padding:6px 0;color:#666;">Telefone</td><td style="padding:6px 0;">${esc(contact.phone)}</td></tr>` : ''}
                ${contact.organization ? `<tr><td style="padding:6px 0;color:#666;">Organização</td><td style="padding:6px 0;">${esc(contact.organization)}</td></tr>` : ''}
              </table>
              ${contact.message ? `<blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #d1d5db;background:#f9fafb;white-space:pre-wrap;font-size:14px;">${esc(contact.message)}</blockquote>` : ''}
              ${teamsBlock}
              <p style="margin:16px 0 0;"><a href="${esc(APP_URL)}/crm" style="color:#111;">Abrir CRM</a></p>
            </div>
          </div>`;
        const resp = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Startup Leiria <noreply@startupleiria.com>',
            to: [consultantEmail],
            reply_to: contact.email,
            subject: `Nova marcação: ${contact.name} — ${slot.date} ${slot.time}`,
            html,
          }),
        });
        if (!resp.ok) {
          const errText = await resp.text();
          console.warn('Consultant alert email failed', resp.status, errText.slice(0, 200));
        } else {
          try {
            await supabase.from('email_log').insert({
              email_type: 'first_contact_booking_alert',
              recipients: [{ email: consultantEmail, user_id: consultantId }],
              subject: `Nova marcação: ${contact.name} — ${slot.date} ${slot.time}`,
              status: 'sent',
              sent_at: new Date().toISOString(),
            });
          } catch { /* email_log optional */ }
        }
      } else if (!RESEND_API_KEY) {
        console.warn('RESEND_API_KEY not configured; skipping consultant alert email');
      }
    } catch (mailErr) {
      console.error('Consultant alert email error:', mailErr);
    }


    return corsJsonResponse({ 
      success: true,
      funnelItemId,
      teamsLink,
      calendarEventId,
      message: teamsLink 
        ? "Your booking has been confirmed. You'll receive a calendar invite with Teams link shortly."
        : "Your booking has been confirmed. The consultant will send you meeting details.",
    }, req);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error:", message);
    return corsJsonResponse({ success: false, error: 'An unexpected error occurred. Please try again.' }, req, 500);
  }
});
