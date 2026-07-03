import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SessionInviteRequest {
  sessionId: string;
  workspaceId: string;
  title: string;
  scheduledAt: string;
  duration: number;
  agenda?: string;
  recipientEmails: string[];
  organizerName: string;
  startupName: string;
  eventType?: 'created' | 'rescheduled' | 'cancelled';
}

// HTML escape function to prevent XSS
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

// Escape special characters for ICS format
function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '');
}

// Input validation
function validateInput(payload: SessionInviteRequest): { valid: boolean; error?: string } {
  // Validate sessionId and workspaceId are valid UUIDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!payload.sessionId || !uuidRegex.test(payload.sessionId)) {
    return { valid: false, error: "Invalid session ID" };
  }
  
  if (!payload.workspaceId || !uuidRegex.test(payload.workspaceId)) {
    return { valid: false, error: "Invalid workspace ID" };
  }
  
  // Validate title
  if (!payload.title || typeof payload.title !== 'string' || payload.title.length > 200) {
    return { valid: false, error: "Title is required and must be less than 200 characters" };
  }
  
  // Validate scheduledAt is a valid date
  if (!payload.scheduledAt || isNaN(Date.parse(payload.scheduledAt))) {
    return { valid: false, error: "Invalid scheduled date" };
  }
  
  // Validate duration
  if (typeof payload.duration !== 'number' || payload.duration < 1 || payload.duration > 480) {
    return { valid: false, error: "Duration must be between 1 and 480 minutes" };
  }
  
  // Validate agenda if provided
  if (payload.agenda && (typeof payload.agenda !== 'string' || payload.agenda.length > 2000)) {
    return { valid: false, error: "Agenda must be less than 2000 characters" };
  }
  
  // Validate organizerName
  if (!payload.organizerName || typeof payload.organizerName !== 'string' || payload.organizerName.length > 100) {
    return { valid: false, error: "Organizer name is required and must be less than 100 characters" };
  }
  
  // Validate startupName
  if (!payload.startupName || typeof payload.startupName !== 'string' || payload.startupName.length > 100) {
    return { valid: false, error: "Startup name is required and must be less than 100 characters" };
  }
  
  // Validate recipient emails
  if (!Array.isArray(payload.recipientEmails) || payload.recipientEmails.length > 50) {
    return { valid: false, error: "Recipient emails must be an array with max 50 entries" };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const email of payload.recipientEmails) {
    if (typeof email !== 'string' || !emailRegex.test(email) || email.length > 255) {
      return { valid: false, error: `Invalid email address: ${email}` };
    }
  }
  
  return { valid: true };
}

function generateICS(session: {
  title: string;
  scheduledAt: string;
  duration: number;
  agenda?: string;
  startupName: string;
  organizerName: string;
}): string {
  const startDate = new Date(session.scheduledAt);
  const endDate = new Date(startDate.getTime() + (session.duration || 60) * 60000);
  
  const formatDate = (date: Date): string => {
    return date.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  };

  const uid = `session-${Date.now()}@lovable.app`;
  const now = formatDate(new Date());
  
  // Escape all user-controlled content for ICS format
  const safeTitle = escapeIcs(session.title);
  const safeStartupName = escapeIcs(session.startupName);
  const safeOrganizerName = escapeIcs(session.organizerName);
  const safeAgenda = escapeIcs(session.agenda || 'Mentoring session');
  
  const icsContent = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Startup Mentor Platform//EN
CALSCALE:GREGORIAN
METHOD:REQUEST
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${now}
DTSTART:${formatDate(startDate)}
DTEND:${formatDate(endDate)}
SUMMARY:${safeTitle} - ${safeStartupName}
DESCRIPTION:${safeAgenda}\\n\\nOrganized by: ${safeOrganizerName}
ORGANIZER;CN=${safeOrganizerName}:mailto:noreply@startupleiria.com
STATUS:CONFIRMED
SEQUENCE:0
END:VEVENT
END:VCALENDAR`;

  return icsContent;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Extract and validate JWT from Authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.error("No authorization header provided");
      return new Response(
        JSON.stringify({ error: "Unauthorized: No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    const token = authHeader.replace("Bearer ", "");
    
    // Create client with user's token to verify authentication
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` }
      }
    });
    
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      console.error("Authentication failed:", authError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log(`Authenticated user: ${user.id}`);

    const payload: SessionInviteRequest = await req.json();
    
    // Validate input
    const validation = validateInput(payload);
    if (!validation.valid) {
      console.error("Validation failed:", validation.error);
      return new Response(
        JSON.stringify({ error: validation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Verify user has access to the workspace using service role client
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: hasAccess, error: accessError } = await supabaseService.rpc('has_workspace_access', {
      _user_id: user.id,
      _workspace_id: payload.workspaceId
    });
    
    if (accessError) {
      console.error("Error checking workspace access:", accessError.message);
      return new Response(
        JSON.stringify({ error: "Failed to verify workspace access" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    if (!hasAccess) {
      console.error(`User ${user.id} does not have access to workspace ${payload.workspaceId}`);
      return new Response(
        JSON.stringify({ error: "Forbidden: No access to this workspace" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Verify session exists and belongs to the workspace
    const { data: session, error: sessionError } = await supabaseService
      .from('sessions')
      .select('id, workspace_id')
      .eq('id', payload.sessionId)
      .eq('workspace_id', payload.workspaceId)
      .single();
    
    if (sessionError || !session) {
      console.error("Session not found or doesn't belong to workspace:", sessionError?.message);
      return new Response(
        JSON.stringify({ error: "Session not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    console.log("Sending session invite:", {
      userId: user.id,
      sessionId: payload.sessionId,
      workspaceId: payload.workspaceId,
      title: payload.title,
      recipients: payload.recipientEmails.length,
      scheduledAt: payload.scheduledAt,
    });

    if (!payload.recipientEmails || payload.recipientEmails.length === 0) {
      console.log("No recipients to send to");
      return new Response(
        JSON.stringify({ message: "No recipients" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate ICS file with sanitized content
    const icsContent = generateICS({
      title: payload.title,
      scheduledAt: payload.scheduledAt,
      duration: payload.duration,
      agenda: payload.agenda,
      startupName: payload.startupName,
      organizerName: payload.organizerName,
    });

    const scheduledDate = new Date(payload.scheduledAt);
    const formattedDate = scheduledDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const formattedTime = scheduledDate.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });

    // Escape HTML in all user-controlled content
    const safeTitle = escapeHtml(payload.title);
    const safeStartupName = escapeHtml(payload.startupName);
    const safeOrganizerName = escapeHtml(payload.organizerName);
    const safeAgenda = payload.agenda ? escapeHtml(payload.agenda) : '';

    // Resolve recipient locales in batch (default PT)
    const { data: recipientProfiles } = await supabaseService
      .from('profiles')
      .select('email, preferred_language')
      .in('email', payload.recipientEmails.map(e => e.toLowerCase()));
    const localeByEmail = new Map<string, 'pt' | 'en'>(
      (recipientProfiles ?? []).map((p: any) => [String(p.email).toLowerCase(), (p.preferred_language as 'pt' | 'en') ?? 'pt'])
    );

    const eventType: 'created' | 'rescheduled' | 'cancelled' = payload.eventType ?? 'created';

    const stringsByLocale = {
      pt: {
        subject: (t: string, n: string) =>
          eventType === 'cancelled' ? `Sessão cancelada: ${t} - ${n}`
          : eventType === 'rescheduled' ? `Sessão reagendada: ${t} - ${n}`
          : `Sessão agendada: ${t} - ${n}`,
        heading:
          eventType === 'cancelled' ? '❌ Sessão Cancelada'
          : eventType === 'rescheduled' ? '🔄 Sessão Reagendada'
          : '📅 Sessão Agendada',
        intro:
          eventType === 'cancelled' ? 'Esta sessão de mentoria foi cancelada.'
          : eventType === 'rescheduled' ? 'Esta sessão de mentoria foi reagendada. Veja abaixo os novos detalhes.'
          : 'Foi convidado para uma sessão de mentoria.',
        startup: 'Startup',
        date: 'Data',
        time: 'Hora',
        duration: 'Duração',
        minutes: 'minutos',
        agenda: 'Agenda',
        icsNote:
          eventType === 'cancelled'
            ? 'Se já tinha adicionado esta sessão ao seu calendário, por favor remova-a.'
            : 'Está anexado um convite de calendário (.ics). Adicione-o ao seu calendário para receber lembretes.',
        organizedBy: 'Organizado por',
      },
      en: {
        subject: (t: string, n: string) =>
          eventType === 'cancelled' ? `Session Cancelled: ${t} - ${n}`
          : eventType === 'rescheduled' ? `Session Rescheduled: ${t} - ${n}`
          : `Session Scheduled: ${t} - ${n}`,
        heading:
          eventType === 'cancelled' ? '❌ Session Cancelled'
          : eventType === 'rescheduled' ? '🔄 Session Rescheduled'
          : '📅 Session Scheduled',
        intro:
          eventType === 'cancelled' ? 'This mentoring session has been cancelled.'
          : eventType === 'rescheduled' ? 'This mentoring session has been rescheduled. See the new details below.'
          : "You've been invited to a mentoring session.",
        startup: 'Startup',
        date: 'Date',
        time: 'Time',
        duration: 'Duration',
        minutes: 'minutes',
        agenda: 'Agenda',
        icsNote:
          eventType === 'cancelled'
            ? 'If you had already added this session to your calendar, please remove it.'
            : 'A calendar invite (.ics file) is attached. Add it to your calendar to receive reminders.',
        organizedBy: 'Organized by',
      },
    };

    // Send email to each recipient with rate limiting (Resend allows 2 req/sec on free plan)
    const results: Array<{ email: string; success: boolean; result?: unknown; error?: string }> = [];

    for (let i = 0; i < payload.recipientEmails.length; i++) {
      const email = payload.recipientEmails[i];
      const locale = localeByEmail.get(email.toLowerCase()) ?? 'pt';
      const s = stringsByLocale[locale];
      const dateLocaleTag = locale === 'pt' ? 'pt-PT' : 'en-US';
      const formattedDateLoc = scheduledDate.toLocaleDateString(dateLocaleTag, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
      const formattedTimeLoc = scheduledDate.toLocaleTimeString(dateLocaleTag, {
        hour: '2-digit', minute: '2-digit',
      });

      // Add delay between emails to avoid rate limiting (600ms between each)
      if (i > 0) {
        await new Promise(resolve => setTimeout(resolve, 600));
      }

      try {
        const result = await resend.emails.send({
          from: "Startup Leiria <noreply@startupleiria.com>",
          to: [email],
          subject: s.subject(safeTitle, safeStartupName),
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 8px;">${s.heading}</h1>
              <p style="color: #666; margin-bottom: 24px;">${s.intro}</p>

              <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
                <h2 style="color: #1a1a1a; font-size: 20px; margin: 0 0 16px 0;">${safeTitle}</h2>
                <p style="color: #666; margin: 0 0 8px 0;"><strong>${s.startup}:</strong> ${safeStartupName}</p>
                <p style="color: #666; margin: 0 0 8px 0;"><strong>${s.date}:</strong> ${escapeHtml(formattedDateLoc)}</p>
                <p style="color: #666; margin: 0 0 8px 0;"><strong>${s.time}:</strong> ${escapeHtml(formattedTimeLoc)}</p>
                <p style="color: #666; margin: 0 0 8px 0;"><strong>${s.duration}:</strong> ${payload.duration || 60} ${s.minutes}</p>
                ${safeAgenda ? `<p style="color: #666; margin: 16px 0 0 0;"><strong>${s.agenda}:</strong><br/>${safeAgenda.replace(/\n/g, '<br/>')}</p>` : ''}
              </div>

              <p style="color: #666; font-size: 14px;">
                ${s.icsNote}
              </p>

              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
              <p style="color: #999; font-size: 12px;">
                ${s.organizedBy} ${safeOrganizerName}
              </p>
            </div>
          `,
          attachments: eventType === 'cancelled' ? [] : [
            {
              filename: "session-invite.ics",
              content: btoa(icsContent),
            },
          ],
        });
        console.log(`Email sent to ${email}:`, result);
        results.push({ email, success: true, result });
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error(`Failed to send email to ${email}:`, err);
        results.push({ email, success: false, error: errorMessage });
      }
    }


    const successCount = results.filter(r => r.success).length;

    console.log(`Sent ${successCount}/${payload.recipientEmails.length} emails by user ${user.id}`);

    return new Response(
      JSON.stringify({ 
        message: `Sent ${successCount} invites`,
        results 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    // Log full error server-side for debugging
    console.error("Error in send-session-invite:", err instanceof Error ? err.message : err);
    // Return sanitized error to client
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
