import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";
import { requireCronOrStaff } from "../_shared/security.ts";
import { resolveLocalesByUserIds, type Locale } from "../_shared/i18n.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface HealthAlertEmailRequest { alert_id: string; }

const STRINGS = {
  pt: {
    header: (s: string) => `⚠️ Alerta de Saúde: ${s}`,
    severityLabel: 'Severidade',
    scoreChange: 'Variação do Score',
    cta: 'Abrir Workspace',
    footer: 'Está a receber este alerta porque tem os avisos de saúde ativos.',
    managePrefs: 'Gerir preferências',
    subject: (s: string, sev: string) => `⚠️ Alerta de Saúde: ${s} - ${sev}`,
  },
  en: {
    header: (s: string) => `⚠️ Health Alert: ${s}`,
    severityLabel: 'Severity',
    scoreChange: 'Score Change',
    cta: 'View Workspace',
    footer: "You're receiving this because you have health alerts enabled.",
    managePrefs: 'Manage preferences',
    subject: (s: string, sev: string) => `⚠️ Health Alert: ${s} - ${sev}`,
  },
} as const;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
  const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });

  const authResult = await requireCronOrStaff(req, supabaseUser, supabaseAdmin);
  if ("error" in authResult) return authResult.error;

  try {
    const supabase = supabaseAdmin;
    const { alert_id }: HealthAlertEmailRequest = await req.json();
    console.log(`Processing health alert email for alert: ${alert_id}`);

    const { data: alert, error: alertError } = await supabase
      .from("workspace_health_alerts")
      .select(`*, workspace:workspaces(id, program_id, startup:startups(name))`)
      .eq("id", alert_id).single();

    if (alertError || !alert) throw new Error(`Alert not found: ${alert_id}`);

    const { data: workspaceUsers } = await supabase
      .from("workspace_users").select("user_id")
      .eq("workspace_id", alert.workspace_id).eq("active", true);

    const userIds = workspaceUsers?.map(wu => wu.user_id) || [];

    const { data: preferences } = await supabase
      .from("notification_preferences").select("user_id")
      .in("user_id", userIds).eq("email_on_health_drop", true);

    const prefUserIds = preferences?.map(p => p.user_id) || [];
    const usersToNotify = userIds.filter(id =>
      !preferences?.find(p => p.user_id === id) || prefUserIds.includes(id)
    );

    const { data: profiles } = await supabase
      .from("profiles").select("id, email, full_name").in("id", usersToNotify);

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ success: true, emailsSent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const localeMap = await resolveLocalesByUserIds(supabaseAdmin, profiles.map((p: any) => p.id));
    const startupName = alert.workspace?.startup?.name || "Workspace";
    const evidence = alert.evidence_json || {};
    const baseUrl = Deno.env.get("PUBLIC_APP_URL") || "https://fb.startupleiria.com";

    let emailsSent = 0;

    for (const profile of profiles) {
      try {
        const locale: Locale = localeMap.get(profile.id) ?? 'pt';
        const s = STRINGS[locale];
        const htmlLang = locale === 'pt' ? 'pt-PT' : 'en';

        const html = `
          <div lang="${htmlLang}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: ${alert.severity === 'critical' ? '#dc2626' : '#f59e0b'}; margin-bottom: 20px;">
              ${s.header(startupName)}
            </h1>
            <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
              <h2 style="margin: 0 0 10px 0; font-size: 18px;">${alert.reason}</h2>
              <p style="color: #6b7280; margin: 0;">
                ${s.severityLabel}: <strong style="color: ${alert.severity === 'critical' ? '#dc2626' : '#f59e0b'}">${alert.severity.toUpperCase()}</strong>
              </p>
            </div>
            ${evidence.prev_score !== undefined ? `
              <div style="margin-bottom: 20px;">
                <h3 style="margin-bottom: 10px;">${s.scoreChange}</h3>
                <p style="font-size: 24px; margin: 0;">
                  <span style="color: #6b7280;">${evidence.prev_score}</span>
                  <span style="margin: 0 10px;">→</span>
                  <span style="color: ${alert.severity === 'critical' ? '#dc2626' : '#f59e0b'}">${evidence.new_score}</span>
                  <span style="color: #dc2626; font-size: 14px; margin-left: 10px;">(-${evidence.delta || 0})</span>
                </p>
              </div>
            ` : ''}
            <a href="${baseUrl}/workspace/${alert.workspace_id}"
               style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
              ${s.cta}
            </a>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">
              ${s.footer}
              <a href="${baseUrl}/settings" style="color: #6b7280;">${s.managePrefs}</a>
            </p>
          </div>
        `;

        // Resend returns { data, error } and never throws — check error explicitly.
        const { error: sendError } = await resend.emails.send({
          from: "Startup Leiria <noreply@startupleiria.com>",
          to: [profile.email],
          subject: s.subject(startupName, alert.severity.toUpperCase()),
          html,
        });
        if (sendError) {
          console.error(`Resend rejected email to ${profile.email}:`, sendError);
          continue;
        }

        emailsSent++;
        console.log(`Email sent to ${profile.email} (${locale})`);
        await new Promise(r => setTimeout(r, 600));
      } catch (emailError) {
        console.error(`Failed to send email to ${profile.email}:`, emailError);
      }
    }

    return new Response(JSON.stringify({ success: true, emailsSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    console.error("Error in send-health-alert-email:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
