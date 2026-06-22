import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FollowupRequest {
  sessionId: string;
  recipientEmails?: string[];
  includeActions?: boolean;
  includeKpis?: boolean;
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      return new Response(JSON.stringify({ error: "Email service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create client with user's auth to validate access
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { sessionId, recipientEmails, includeActions = true, includeKpis = true }: FollowupRequest = await req.json();

    if (!sessionId) {
      return new Response(JSON.stringify({ error: "Session ID is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch session with AI outputs
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .select(`
        id, workspace_id, title, scheduled_at, ai_summary, ai_decisions, ai_action_suggestions, ai_kpi_prompts,
        workspace:workspaces(
          id,
          startup:startups(name),
          program:programs(name)
        )
      `)
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check workspace access
    const { data: hasAccess } = await supabaseUser.rpc("has_workspace_access", {
      _workspace_id: session.workspace_id,
    });

    if (!hasAccess) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get recipients if not provided
    let recipients = recipientEmails || [];
    if (recipients.length === 0) {
      const { data: members } = await supabaseAdmin
        .from("workspace_users")
        .select("user_id")
        .eq("workspace_id", session.workspace_id)
        .eq("active", true);

      if (members && members.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .in("id", members.map(m => m.user_id));

        recipients = profiles?.map(p => p.email).filter(Boolean) || [];
      }
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ error: "No recipients found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve recipient locales in batch
    const { data: recipientProfiles } = await supabaseAdmin
      .from("profiles")
      .select("email, preferred_language")
      .in("email", recipients.map(e => e.toLowerCase()));
    const localeByEmail = new Map<string, 'pt' | 'en'>(
      (recipientProfiles ?? []).map((p: any) => [String(p.email).toLowerCase(), (p.preferred_language as 'pt' | 'en') ?? 'pt'])
    );

    // Get sender info
    const { data: senderProfile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .single();

    const startupName = (session.workspace as any)?.startup?.name || "Startup";

    // Build email content with HTML escaping
    const decisions = session.ai_decisions as string[] || [];
    const actionSuggestions = session.ai_action_suggestions as any[] || [];
    const kpiPrompts = session.ai_kpi_prompts as any[] || [];

    // Escape all dynamic content
    const safeSessionTitle = escapeHtml(session.title || "");
    const safeStartupName = escapeHtml(startupName);
    const safeSummary = session.ai_summary ? escapeHtml(session.ai_summary) : "";
    const safeSenderName = escapeHtml(senderProfile?.full_name || "Startup Leiria");

    const stringsByLocale = {
      pt: {
        followupTitle: (t: string) => `Seguimento da sessão: ${t}`,
        summary: '📋 Resumo',
        decisions: '✅ Decisões-chave',
        actions: '📌 Itens de ação',
        kpis: '📊 KPIs a actualizar',
        sentBy: 'Enviado por',
        viaPlatform: 'via Plataforma Startup Leiria',
        subject: (t: string, n: string) => `Seguimento: ${t} - ${n}`,
        dateLocale: 'pt-PT',
      },
      en: {
        followupTitle: (t: string) => `Session Follow-up: ${t}`,
        summary: '📋 Summary',
        decisions: '✅ Key Decisions',
        actions: '📌 Action Items',
        kpis: '📊 KPIs to Update',
        sentBy: 'Sent by',
        viaPlatform: 'via Startup Leiria Platform',
        subject: (t: string, n: string) => `Follow-up: ${t} - ${n}`,
        dateLocale: 'en-US',
      },
    };

    const buildHtml = (locale: 'pt' | 'en'): string => {
      const s = stringsByLocale[locale];
      const sessionDateLoc = new Date(session.scheduled_at).toLocaleDateString(s.dateLocale, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
      const safeSessionDateLoc = escapeHtml(sessionDateLoc);
      return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 8px;">${s.followupTitle(safeSessionTitle)}</h1>
        <p style="color: #666; font-size: 14px; margin-bottom: 24px;">${safeStartupName} • ${safeSessionDateLoc}</p>

        ${safeSummary ? `
          <div style="background: #f8f9fa; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="color: #1a1a1a; font-size: 16px; margin: 0 0 12px 0;">${s.summary}</h2>
            <p style="color: #333; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${safeSummary}</p>
          </div>
        ` : ""}

        ${decisions.length > 0 ? `
          <div style="margin-bottom: 24px;">
            <h2 style="color: #1a1a1a; font-size: 16px; margin: 0 0 12px 0;">${s.decisions}</h2>
            <ul style="margin: 0; padding-left: 20px;">
              ${decisions.map(d => `<li style="color: #333; font-size: 14px; margin-bottom: 8px;">${escapeHtml(String(d))}</li>`).join("")}
            </ul>
          </div>
        ` : ""}

        ${includeActions && actionSuggestions.length > 0 ? `
          <div style="margin-bottom: 24px;">
            <h2 style="color: #1a1a1a; font-size: 16px; margin: 0 0 12px 0;">${s.actions}</h2>
            <table style="width: 100%; border-collapse: collapse;">
              ${actionSuggestions.map(action => {
                const safeTitle = escapeHtml(String(action.title || ""));
                const safeDescription = action.description ? escapeHtml(String(action.description)) : "";
                const safePriority = escapeHtml(String(action.priority || "medium"));
                return `
                <tr style="border-bottom: 1px solid #eee;">
                  <td style="padding: 12px 0;">
                    <strong style="color: #1a1a1a; font-size: 14px;">${safeTitle}</strong>
                    ${safeDescription ? `<p style="color: #666; font-size: 13px; margin: 4px 0 0 0;">${safeDescription}</p>` : ""}
                  </td>
                  <td style="padding: 12px 0; text-align: right; vertical-align: top;">
                    <span style="background: ${action.priority === 'urgent' ? '#fee2e2' : action.priority === 'high' ? '#fef3c7' : '#e0f2fe'}; color: ${action.priority === 'urgent' ? '#dc2626' : action.priority === 'high' ? '#d97706' : '#0284c7'}; padding: 4px 8px; border-radius: 4px; font-size: 12px; text-transform: uppercase;">${safePriority}</span>
                  </td>
                </tr>
              `}).join("")}
            </table>
          </div>
        ` : ""}

        ${includeKpis && kpiPrompts.length > 0 ? `
          <div style="background: #fffbeb; padding: 16px; border-radius: 8px; margin-bottom: 24px;">
            <h2 style="color: #92400e; font-size: 16px; margin: 0 0 12px 0;">${s.kpis}</h2>
            ${kpiPrompts.map(kpi => {
              const safeKpiName = escapeHtml(String(kpi.kpiName || ""));
              const safeReason = escapeHtml(String(kpi.reason || ""));
              return `
              <div style="margin-bottom: 12px;">
                <strong style="color: #1a1a1a; font-size: 14px;">${safeKpiName}</strong>
                <p style="color: #666; font-size: 13px; margin: 4px 0 0 0;">${safeReason}</p>
              </div>
            `}).join("")}
          </div>
        ` : ""}

        <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee;">
          <p style="color: #999; font-size: 12px; margin: 0;">
            ${s.sentBy} ${safeSenderName} ${s.viaPlatform}
          </p>
        </div>
      </div>
      `;
    };

    const resend = new Resend(resendApiKey);

    // Send emails per-recipient with locale-specific subject + body
    const results: { email: string; success: boolean; error?: string }[] = [];
    let firstSubject = '';
    let firstHtml = '';

    for (const email of recipients) {
      const locale = localeByEmail.get(email.toLowerCase()) ?? 'pt';
      const subject = stringsByLocale[locale].subject(safeSessionTitle, safeStartupName);
      const html = buildHtml(locale);
      if (!firstSubject) { firstSubject = subject; firstHtml = html; }
      try {
        const { error } = await resend.emails.send({
          from: "Startup Leiria <noreply@startupleiria.com>",
          to: [email],
          subject,
          html,
        });
        if (error) {
          results.push({ email, success: false, error: error.message });
        } else {
          results.push({ email, success: true });
        }
        await new Promise(resolve => setTimeout(resolve, 600));
      } catch (e: unknown) {
        results.push({ email, success: false, error: e instanceof Error ? e.message : "Unknown error" });
      }
    }

    // Log email send (use first recipient's locale for the stored copy)
    const successCount = results.filter(r => r.success).length;
    await supabaseAdmin.from("email_log").insert({
      session_id: sessionId,
      workspace_id: session.workspace_id,
      email_type: "session_followup",
      recipients: recipients,
      subject: firstSubject,
      body: firstHtml,
      status: successCount === recipients.length ? "sent" : successCount > 0 ? "partial" : "failed",
      sent_at: new Date().toISOString(),
      created_by: user.id,
    });


    // Log activity
    await supabaseAdmin.from("activity_log").insert({
      user_id: user.id,
      workspace_id: session.workspace_id,
      entity_type: "session",
      entity_id: sessionId,
      action: "followup_email_sent",
      metadata: { sessionTitle: session.title, recipientCount: successCount },
    });

    console.log(`Follow-up email sent for session ${sessionId}: ${successCount}/${recipients.length} successful`);

    return new Response(JSON.stringify({
      success: true,
      sent: successCount,
      total: recipients.length,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in send-session-followup:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
