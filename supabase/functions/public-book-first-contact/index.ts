/**
 * Public Book First Contact - Creates funnel item and calendar event
 * Supports real Graph API calendar integration with Teams meeting
 * 
 * HARDENED: Input validation, rate limiting, safe error messages
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { resolveFirstContactRoute, NoRouteError, deriveBookingIdempotencyKey } from '../_shared/first-contact-routing.ts';

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
  recording_consent?: boolean;
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

  const recording_consent = req.recording_consent === true;

  return {
    valid: true,
    data: {
      token: req.token as string,
      slot: { date: slot.date as string, time: slot.time as string },
      contact: { name: (contact.name as string).trim(), email, phone, organization, message, sector, stage, referral_source, has_team, pitch_deck_path, has_tech, is_iies, vertical, help_expectation, personal_intro },
      recording_consent,
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

    const { token, slot, contact, recording_consent } = validation.data;

    // Selected program comes from the routing step in PublicBooking.
    // Values: null (single-option link), 'global' (Geral option), or a UUID.
    const rawSelectedProgramId = (rawBody as { program_id?: unknown })?.program_id;
    const selectedProgramId: string | null =
      typeof rawSelectedProgramId === 'string' && rawSelectedProgramId !== '' && rawSelectedProgramId !== 'global'
        ? rawSelectedProgramId
        : null;

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

    // DB-enforced rate limiting: max 5 attempts / hour per email + 10 / 24h
    // Uses public_booking_rate_limits (server-only) instead of counting funnel_items,
    // so retries and invalid attempts also count and cannot be evaded by never committing.
    try {
      const emailNormalized = contact.email;
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [{ data: hourly }, { data: daily }] = await Promise.all([
        supabase
          .from("public_booking_rate_limits")
          .select("attempts")
          .eq("email_normalized", emailNormalized)
          .gte("last_attempt_at", hourAgo),
        supabase
          .from("public_booking_rate_limits")
          .select("attempts")
          .eq("email_normalized", emailNormalized)
          .gte("last_attempt_at", dayAgo),
      ]);

      const hourlyCount = (hourly ?? []).reduce((s, r: { attempts: number }) => s + (r.attempts ?? 0), 0);
      const dailyCount = (daily ?? []).reduce((s, r: { attempts: number }) => s + (r.attempts ?? 0), 0);

      if (hourlyCount >= 5 || dailyCount >= 10) {
        return corsJsonResponse({
          success: false,
          error: "Too many booking attempts. Please try again later.",
        }, req, 429);
      }

      // Upsert current-hour bucket
      const bucketStart = new Date();
      bucketStart.setMinutes(0, 0, 0);
      await supabase
        .from("public_booking_rate_limits")
        .upsert(
          {
            email_normalized: emailNormalized,
            bucket_start: bucketStart.toISOString(),
            attempts: 1,
            last_attempt_at: new Date().toISOString(),
          },
          { onConflict: "email_normalized,bucket_start", ignoreDuplicates: false },
        );
      // Increment the current-hour bucket so retries within the same hour count toward the cap.

      await supabase
        .from("public_booking_rate_limits")
        .update({ attempts: (hourlyCount || 0) + 1, last_attempt_at: new Date().toISOString() })
        .eq("email_normalized", emailNormalized)
        .eq("bucket_start", bucketStart.toISOString());
    } catch (rlErr) {
      console.warn("public_booking rate-limit check failed (fail-open):", rlErr);
    }


    // === CANONICAL ROUTING ===
    // Never fall back to `.limit(1)` on user_roles. The routing resolver validates
    // link + intake_routing + program, respects fixed_owner and round_robin,
    // and throws NoRouteError when there is no valid destination — in which case
    // we fail closed with a public 503 rather than committing a booking to an
    // arbitrary consultant.
    let consultantEmail: string | null = null;
    let consultantId: string | null = null;
    let consultantName: string | null = null;
    let programId: string | null = null;
    let routingDecision: Record<string, unknown> = {};

    try {
      const resolved = await resolveFirstContactRoute({
        supabase,
        token,
        selectedProgramId,
      });
      consultantId = resolved.consultantId;
      consultantEmail = resolved.consultantEmail;
      consultantName = resolved.consultantName;
      programId = resolved.programId;
      routingDecision = {
        routing_id: resolved.routingId,
        routing_mode: resolved.routingMode,
        scope: resolved.scope,
        link_id: resolved.linkId,
        program_id: resolved.programId,
        program_name: resolved.programName,
        trace: resolved.decisionTrace,
      };
    } catch (e) {
      if (e instanceof NoRouteError) {
        console.warn('First-contact booking NO_ROUTE:', e.reason, e.trace);
        // Best-effort staff alert so backoffice notices routing gaps.
        try {
          await supabase.from('system_alerts').insert({
            kind: 'first_contact_no_route',
            severity: 'high',
            dedupe_key: `first_contact_no_route:${e.reason}:${contact.email}`,
            payload: {
              reason: e.reason,
              trace: e.trace,
              contact_email: contact.email,
              message: `Public booking failed to resolve a consultant (${e.reason}).`,
            },
          });
        } catch { /* system_alerts is best-effort */ }
        return corsJsonResponse({
          success: false,
          error: 'We could not assign a consultant for this booking. Please contact us directly.',
          reason: e.reason,
        }, req, 503);
      }
      throw e;
    }


    // Deterministic idempotency key — repeated identical submissions (double clicks,
    // retries) resolve to the same funnel item instead of creating duplicates.
    const idempotencyKey = await deriveBookingIdempotencyKey(contact.email, slot.date, slot.time, token);

    // Base booking metadata (structured — do NOT append to `notes` free text).
    const bookingMetadata: Record<string, unknown> = {
      idempotency_key: idempotencyKey,
      booking_date: `${slot.date}T${slot.time}:00`,
      slot_date: slot.date,
      slot_time: slot.time,
      timezone: 'Europe/Lisbon',
      booking_source: 'public_form',
      routing_decision: routingDecision,
      consultant_id: consultantId,
      consultant_email: consultantEmail,
    };
    bookingMetadata.recording_consent = recording_consent === true;
    if (recording_consent) {
      bookingMetadata.recording_consent_at = new Date().toISOString();
    }
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

    // === ATOMIC COMMIT (C3) ===
    // Single-transaction RPC does idempotency lookup, early-stage reuse or
    // fresh insert, and event log. Prevents partial writes on interrupt.
    const { data: commitResult, error: commitErr } = await supabase.rpc(
      'commit_first_contact_booking_atomic',
      {
        p_idempotency_key: idempotencyKey,
        p_contact: {
          name: contact.name,
          email: contact.email,
          phone: contact.phone ?? null,
          organization: contact.organization ?? null,
          message: contact.message ?? null,
        },
        p_slot: { date: slot.date, time: slot.time },
        p_consultant_id: consultantId,
        p_program_id: programId,
        p_metadata: bookingMetadata,
        p_routing_decision: routingDecision,
      },
    );
    if (commitErr) throw commitErr;
    const commitRow = Array.isArray(commitResult) ? commitResult[0] : commitResult;
    const funnelItemId: string = commitRow?.funnel_item_id;
    if (!funnelItemId) throw new Error('commit_first_contact_booking_atomic returned no id');

    // Create calendar event via Graph API if configured
    let teamsLink: string | null = null;
    let calendarEventId: string | null = null;
    let calendarStatus: 'ok' | 'skipped' | 'failed' = 'skipped';
    let calendarError: string | null = null;

    const credentials = await getGraphCredentials(supabase);

    if (credentials && consultantEmail) {
      try {
        const accessToken = await getGraphAccessToken(credentials);
        const eventResult = await createCalendarEvent(accessToken, consultantEmail, slot, contact);

        calendarEventId = eventResult.eventId;
        teamsLink = eventResult.teamsLink;
        calendarStatus = 'ok';

        // Store calendar output in structured metadata — never overwrite `notes` free text.
        await supabase
          .from('funnel_items')
          .update({
            metadata_json: {
              ...bookingMetadata,
              calendar_event_id: calendarEventId,
              teams_url: teamsLink,
              calendar_status: 'ok',
            },
          })
          .eq('id', funnelItemId);
      } catch (graphError) {
        calendarStatus = 'failed';
        calendarError = graphError instanceof Error ? graphError.message : 'unknown';
        console.error('Graph API error:', graphError);
        await supabase.from('funnel_items').update({
          metadata_json: { ...bookingMetadata, calendar_status: 'failed', calendar_error: calendarError },
        }).eq('id', funnelItemId);
        if (strictCalendarValidation) {
          return corsJsonResponse({
            success: false,
            funnelItemId,
            calendar_status: calendarStatus,
            calendar_error: calendarError,
            error: 'Calendar validation failed. Please try again or contact us directly.',
          }, req, 502);
        }
      }
    } else if (strictCalendarValidation) {
      return corsJsonResponse({
        success: false,
        funnelItemId,
        calendar_status: 'skipped',
        error: 'Calendar validation is required but not configured. Please contact us directly.',
      }, req, 503);
    } else {
      console.log('Graph API not configured, skipping calendar event creation');
    }


    // === Internal in-app notification for the consultant (visible in CRM) ===
    try {
      if (consultantId) {
        const dt = `${slot.date} ${slot.time}`;
        const orgLabel = contact.organization ? ` (${contact.organization})` : '';
        await supabase.from('notifications').insert({
          user_id: consultantId,
          type: 'first_contact_booked',
          title: `Nova marcação de Primeiro Contacto — ${contact.name}${orgLabel}`,
          message: `Agendado para ${dt} (Europe/Lisbon). Lead já visível no pipeline do CRM.`,
          link: `/crm?open=${funnelItemId}`,
          entity_type: 'funnel_item',
          entity_id: funnelItemId,
          event_key: `first_contact_booked:${funnelItemId}:${slot.date}T${slot.time}`,
          read: false,
          metadata: {
            funnel_item_id: funnelItemId,
            contact_name: contact.name,
            contact_email: contact.email,
            organization: contact.organization || null,
            booking_date: slot.date,
            booking_time: slot.time,
            timezone: 'Europe/Lisbon',
            teams_link: teamsLink,
            calendar_event_id: calendarEventId,
            source: 'public_booking',
          },
        });
      }
    } catch (notifErr) {
      console.warn('Failed to create CRM notification:', notifErr);
    }

    // === Internal notification for the founder (if they already have an account) ===
    try {
      const { data: founderProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', contact.email)
        .maybeSingle();

      if (founderProfile?.id) {
        const dt = `${slot.date} ${slot.time}`;
        await supabase.from('notifications').insert({
          user_id: founderProfile.id,
          type: 'first_contact_booked',
          title: 'Marcação de Primeiro Contacto confirmada',
          message: `A tua reunião está agendada para ${dt} (Europe/Lisbon).${teamsLink ? ' Convite do Teams enviado por email.' : ''}`,
          link: `/dashboard`,

          entity_type: 'funnel_item',
          entity_id: funnelItemId,
          event_key: `first_contact_booked_founder:${funnelItemId}:${slot.date}T${slot.time}`,
          read: false,
          metadata: {
            funnel_item_id: funnelItemId,
            booking_date: slot.date,
            booking_time: slot.time,
            timezone: 'Europe/Lisbon',
            teams_link: teamsLink,
            calendar_event_id: calendarEventId,
            consultant_id: consultantId,
            consultant_name: consultantName,
            source: 'public_booking',
          },
        });
      }
    } catch (founderNotifErr) {
      console.warn('Failed to create founder notification:', founderNotifErr);
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
              <p style="margin:16px 0 0;"><a href="${esc(APP_URL)}/crm?open=${esc(funnelItemId)}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;">Abrir lead no CRM</a></p>
              <p style="margin:12px 0 0;font-size:12px;color:#666;">Fuso horário: Europe/Lisbon</p>
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

    // === Durable outbox trace (E3) ===
    // Record every subsystem attempt so ops can replay / audit even when the
    // inline delivery already completed. `completed` rows are audit trail;
    // `failed`/`pending` rows are candidates for a future retry worker.
    try {
      const outboxRows = [
        {
          funnel_item_id: funnelItemId,
          kind: 'graph_event',
          payload_json: {
            calendar_event_id: calendarEventId,
            teams_url: teamsLink,
            slot,
            consultant_email: consultantEmail,
          },
          status: calendarStatus === 'ok' ? 'completed' : (calendarStatus === 'failed' ? 'failed' : 'skipped'),
          attempts: 1,
          last_error: calendarError,
          completed_at: calendarStatus === 'ok' ? new Date().toISOString() : null,
        },
        {
          funnel_item_id: funnelItemId,
          kind: 'consultant_notification',
          payload_json: { consultant_id: consultantId, slot },
          status: consultantId ? 'completed' : 'skipped',
          attempts: 1,
          completed_at: consultantId ? new Date().toISOString() : null,
        },
        {
          funnel_item_id: funnelItemId,
          kind: 'founder_notification',
          payload_json: { contact_email: contact.email, slot },
          status: 'pending', // resolved by founder-notification block above; not authoritative
          attempts: 1,
        },
        {
          funnel_item_id: funnelItemId,
          kind: 'consultant_email',
          payload_json: { consultant_email: consultantEmail, slot },
          status: consultantEmail ? 'pending' : 'skipped',
          attempts: 1,
        },
      ];
      await supabase.from('first_contact_outbox').insert(outboxRows);
    } catch (outErr) {
      console.warn('first_contact_outbox insert failed (non-fatal):', outErr);
    }

    // Honest response: reflect what actually happened per subsystem so the client
    // shows a partial-success UI instead of "everything confirmed" on failure.
    const partialFailure = calendarStatus === 'failed';

    return corsJsonResponse({
      success: !partialFailure,
      funnelItemId,
      teamsLink,
      calendarEventId,
      calendar_status: calendarStatus,
      calendar_error: calendarError,
      routing: {
        consultant_id: consultantId,
        consultant_name: consultantName,
        program_id: programId,
        mode: (routingDecision as { routing_mode?: string })?.routing_mode ?? null,
      },
      message: partialFailure
        ? 'Your slot was recorded but the calendar invite failed. The consultant will contact you shortly.'
        : (teamsLink
          ? "Your booking has been confirmed. You'll receive a calendar invite with Teams link shortly."
          : 'Your booking has been confirmed. The consultant will send you meeting details.'),
    }, req);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error:", message);
    return corsJsonResponse({ success: false, error: 'An unexpected error occurred. Please try again.' }, req, 500);
  }
});
