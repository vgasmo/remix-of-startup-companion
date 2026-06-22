import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { requireCronSecret, generateRequestId, createLogger } from '../_shared/security.ts';

const FUNCTION_NAME = 'send-email-digest';
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SITE_URL = Deno.env.get("SITE_URL") || "https://startupleiria.com";

type Locale = 'pt' | 'en';

interface DigestData {
  userId: string;
  email: string;
  fullName: string;
  locale: Locale;
  overdueActions: number;
  criticalHealth: number;
  atRiskHealth: number;
  upcomingSessions: number;
  pendingKpis: number;
}

const STRINGS = {
  pt: {
    subject: (n: number) => `Resumo Semanal: ${n} itens precisam da sua atenção`,
    title: 'Resumo Semanal',
    brand: 'Startup Leiria',
    greeting: (name: string) => `Olá ${name},`,
    intro: 'Aqui está o seu resumo semanal de itens que precisam da sua atenção:',
    overdue: (n: number) => `⚠️ <strong>${n}</strong> ações em atraso`,
    critical: (n: number) => `🔴 <strong>${n}</strong> startup(s) em estado crítico`,
    atRisk: (n: number) => `🟠 <strong>${n}</strong> startup(s) em risco`,
    sessions: (n: number) => `📅 <strong>${n}</strong> sessões esta semana`,
    cta: 'Abrir Dashboard',
    footer: 'Está a receber este email porque tem os resumos por email ativos.',
    managePrefs: 'Gerir preferências',
  },
  en: {
    subject: (n: number) => `Weekly Digest: ${n} items need attention`,
    title: 'Weekly Digest',
    brand: 'Startup Leiria',
    greeting: (name: string) => `Hi ${name},`,
    intro: "Here's your weekly summary of items that need your attention:",
    overdue: (n: number) => `⚠️ <strong>${n}</strong> overdue action items`,
    critical: (n: number) => `🔴 <strong>${n}</strong> startup(s) in critical health`,
    atRisk: (n: number) => `🟠 <strong>${n}</strong> startup(s) at risk`,
    sessions: (n: number) => `📅 <strong>${n}</strong> upcoming sessions this week`,
    cta: 'View Dashboard',
    footer: "You're receiving this because you have email digests enabled.",
    managePrefs: 'Manage preferences',
  },
} as const;

function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

Deno.serve(async (req) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);

  if (req.method === "OPTIONS") return handleCorsOptions(req);

  try {
    const authResult = requireCronSecret(req);
    if ('error' in authResult) {
      log.warn('Unauthorized access attempt');
      return authResult.error;
    }

    log.info('Starting email digest job');

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: preferences, error: prefError } = await supabase
      .from("notification_preferences")
      .select(`user_id, digest_frequency, digest_day, last_digest_sent_at`)
      .eq("email_digest_enabled", true);

    if (prefError) throw prefError;

    const now = new Date();
    const dayOfWeek = now.getDay();
    const emailsSent: string[] = [];

    for (const pref of preferences || []) {
      const shouldSend = pref.digest_frequency === "daily" ||
        (pref.digest_frequency === "weekly" && dayOfWeek === (pref.digest_day || 1));
      if (!shouldSend) continue;

      if (pref.last_digest_sent_at) {
        const lastSent = new Date(pref.last_digest_sent_at);
        const hoursSinceLastSent = (now.getTime() - lastSent.getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastSent < 20) continue;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("email, full_name, preferred_language")
        .eq("id", pref.user_id)
        .single();

      if (!profile?.email) continue;
      const locale: Locale = (profile.preferred_language as Locale) ?? 'pt';

      const { data: workspaceUsers } = await supabase
        .from("workspace_users")
        .select("workspace_id")
        .eq("user_id", pref.user_id)
        .eq("active", true);

      const workspaceIds = workspaceUsers?.map(wu => wu.workspace_id) || [];
      if (workspaceIds.length === 0) continue;

      const { count: overdueCount } = await supabase
        .from("action_items")
        .select("*", { count: "exact", head: true })
        .in("workspace_id", workspaceIds)
        .in("status", ["pending", "in_progress"])
        .lt("due_date", now.toISOString().split("T")[0]);

      const { count: criticalCount } = await supabase
        .from("workspaces")
        .select("*", { count: "exact", head: true })
        .in("id", workspaceIds)
        .eq("health_score", "critical");

      const { count: atRiskCount } = await supabase
        .from("workspaces")
        .select("*", { count: "exact", head: true })
        .in("id", workspaceIds)
        .eq("health_score", "at_risk");

      const nextWeek = new Date(now);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const { count: sessionsCount } = await supabase
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .in("workspace_id", workspaceIds)
        .gte("scheduled_at", now.toISOString())
        .lte("scheduled_at", nextWeek.toISOString());

      const digestData: DigestData = {
        userId: pref.user_id,
        email: profile.email,
        fullName: profile.full_name || (locale === 'pt' ? 'Utilizador' : 'User'),
        locale,
        overdueActions: overdueCount || 0,
        criticalHealth: criticalCount || 0,
        atRiskHealth: atRiskCount || 0,
        upcomingSessions: sessionsCount || 0,
        pendingKpis: 0,
      };

      const hasContent = digestData.overdueActions > 0 ||
        digestData.criticalHealth > 0 || digestData.atRiskHealth > 0;
      if (!hasContent) continue;

      const emailHtml = buildDigestEmail(digestData);
      const s = STRINGS[locale];

      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Startup Leiria <noreply@startupleiria.com>",
            to: [digestData.email],
            subject: s.subject(digestData.overdueActions),
            html: emailHtml,
          }),
        });

        if (!emailResponse.ok) {
          throw new Error(`Resend API error: ${await emailResponse.text()}`);
        }

        const result = await emailResponse.json();
        log.info('Email sent', { email: digestData.email, emailId: result.id, locale });
        emailsSent.push(digestData.email);

        await supabase
          .from("notification_preferences")
          .update({ last_digest_sent_at: now.toISOString() })
          .eq("user_id", pref.user_id);
      } catch (emailError) {
        log.error('Failed to send email', emailError, { email: digestData.email });
      }
    }

    log.info('Digest job complete', { emailsSent: emailsSent.length });
    return corsJsonResponse({ success: true, emailsSent: emailsSent.length, recipients: emailsSent }, req);

  } catch (error) {
    log.error('Fatal error', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return corsJsonResponse({ error: message, code: 'INTERNAL_ERROR' }, req, 500);
  }
});

function buildDigestEmail(data: DigestData): string {
  const s = STRINGS[data.locale];
  const items: string[] = [];

  if (data.overdueActions > 0) items.push(`<li>${s.overdue(data.overdueActions)}</li>`);
  if (data.criticalHealth > 0) items.push(`<li>${s.critical(data.criticalHealth)}</li>`);
  if (data.atRiskHealth > 0) items.push(`<li>${s.atRisk(data.atRiskHealth)}</li>`);
  if (data.upcomingSessions > 0) items.push(`<li>${s.sessions(data.upcomingSessions)}</li>`);

  const safeFullName = escapeHtml(data.fullName);
  const htmlLang = data.locale === 'pt' ? 'pt-PT' : 'en';

  return `
    <!DOCTYPE html>
    <html lang="${htmlLang}">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #c8e53d 0%, #c03c3c 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">${s.title}</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">${s.brand}</p>
      </div>
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 12px 12px;">
        <p style="margin-top: 0;">${s.greeting(safeFullName)}</p>
        <p>${s.intro}</p>
        <ul style="background: white; padding: 20px 20px 20px 40px; border-radius: 8px; border-left: 4px solid #c03c3c;">
          ${items.join("\n          ")}
        </ul>
        <div style="text-align: center; margin-top: 30px;">
          <a href="${SITE_URL}/my-workspaces"
             style="display: inline-block; background: #c03c3c; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
            ${s.cta}
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        <p style="color: #666; font-size: 12px; text-align: center; margin-bottom: 0;">
          ${s.footer}<br>
          <a href="${SITE_URL}/settings" style="color: #c03c3c;">${s.managePrefs}</a>
        </p>
      </div>
    </body>
    </html>
  `;
}
