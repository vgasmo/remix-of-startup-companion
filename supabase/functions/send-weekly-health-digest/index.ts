import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";
import { requireCronSecret } from "../_shared/security.ts";
import { resolveLocalesByUserIds, type Locale } from "../_shared/i18n.ts";
import { withCronRunLogging } from '../_shared/cronRun.ts';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const STRINGS = {
  pt: {
    title: '📊 Resumo Semanal de Saúde',
    weekOf: (a: string, b: string) => `Semana de ${a} - ${b}`,
    attention: (n: number) => `⚠️ Workspaces a Precisar de Atenção (${n})`,
    noRisk: '🎉 Sem workspaces em risco esta semana!',
    improved: '📈 Maiores Melhorias',
    declined: '📉 Maiores Quedas',
    cta: 'Ver Todos os Workspaces',
    footer: 'Está a receber este resumo semanal.',
    managePrefs: 'Gerir preferências',
    colStartup: 'Startup',
    colScore: 'Score',
    colAlerts: 'Alertas',
    subject: (n: number) => `📊 Resumo Semanal de Saúde - ${n} workspaces a precisar de atenção`,
    locale: 'pt-PT',
  },
  en: {
    title: '📊 Weekly Health Digest',
    weekOf: (a: string, b: string) => `Week of ${a} - ${b}`,
    attention: (n: number) => `⚠️ Workspaces Needing Attention (${n})`,
    noRisk: '🎉 No workspaces at risk this week!',
    improved: '📈 Most Improved',
    declined: '📉 Biggest Declines',
    cta: 'View All Workspaces',
    footer: "You're receiving this weekly digest.",
    managePrefs: 'Manage preferences',
    colStartup: 'Startup',
    colScore: 'Score',
    colAlerts: 'Alerts',
    subject: (n: number) => `📊 Weekly Health Digest - ${n} workspaces need attention`,
    locale: 'en-GB',
  },
} as const;

serve(withCronRunLogging('send-weekly-health-digest', async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const cronAuth = await requireCronSecret(req);
  if ("error" in cronAuth) return cronAuth.error;

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { data: staffRoles } = await supabase
      .from("user_roles").select("user_id").in("role", ["admin", "consultor"]);

    const staffIds = staffRoles?.map(r => r.user_id) || [];

    const { data: preferences } = await supabase
      .from("notification_preferences").select("user_id")
      .in("user_id", staffIds).eq("weekly_health_digest", true);

    const prefUserIds = preferences?.map(p => p.user_id) || [];
    const usersToNotify = staffIds.filter(id =>
      !preferences?.find(p => p.user_id === id) || prefUserIds.includes(id)
    );

    const { data: profiles } = await supabase
      .from("profiles").select("id, email, full_name").in("id", usersToNotify);

    if (!profiles || profiles.length === 0) {
      return new Response(JSON.stringify({ success: true, emailsSent: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const localeMap = await resolveLocalesByUserIds(supabase, profiles.map((p: any) => p.id));

    const { data: workspacesRaw } = await supabase
      .from("workspaces")
      .select(`id, health_score, health_score_numeric, health_score_components,
        startup:startups(name), program:programs(name)`)
      .eq("status", "active").order("health_score_numeric", { ascending: true });

    const getStartupName = (ws: any): string => {
      if (!ws?.startup) return "Workspace";
      if (Array.isArray(ws.startup)) return ws.startup[0]?.name || "Workspace";
      return ws.startup.name || "Workspace";
    };

    const workspaces = workspacesRaw || [];
    const workspaceIds = workspaces?.map(w => w.id) || [];
    const { data: historyData } = await supabase
      .from("workspace_health_history")
      .select("workspace_id, score_numeric, computed_at")
      .in("workspace_id", workspaceIds)
      .gte("computed_at", weekAgo.toISOString())
      .order("computed_at", { ascending: true });

    const trendsMap: Record<string, { start: number; end: number; delta: number }> = {};
    for (const ws of workspaces || []) {
      const wsHistory = historyData?.filter(h => h.workspace_id === ws.id) || [];
      if (wsHistory.length >= 2) {
        const start = wsHistory[0].score_numeric;
        const end = wsHistory[wsHistory.length - 1].score_numeric;
        trendsMap[ws.id] = { start, end, delta: end - start };
      }
    }

    const { data: activeAlerts } = await supabase
      .from("workspace_health_alerts").select("workspace_id, severity").eq("status", "active");

    const alertsByWorkspace: Record<string, { critical: number; warning: number }> = {};
    for (const alert of activeAlerts || []) {
      if (!alertsByWorkspace[alert.workspace_id]) {
        alertsByWorkspace[alert.workspace_id] = { critical: 0, warning: 0 };
      }
      if (alert.severity === "critical") alertsByWorkspace[alert.workspace_id].critical++;
      else alertsByWorkspace[alert.workspace_id].warning++;
    }

    const atRisk = workspaces?.filter(w => w.health_score === "at_risk" || w.health_score === "critical") || [];
    const mostImproved = Object.entries(trendsMap).filter(([, t]) => t.delta > 0)
      .sort((a, b) => b[1].delta - a[1].delta).slice(0, 5);
    const mostDeclined = Object.entries(trendsMap).filter(([, t]) => t.delta < 0)
      .sort((a, b) => a[1].delta - b[1].delta).slice(0, 5);

    const baseUrl = Deno.env.get("PUBLIC_APP_URL") || "https://fb.startupleiria.com";
    let emailsSent = 0;

    for (const profile of profiles) {
      try {
        const locale: Locale = localeMap.get(profile.id) ?? 'pt';
        const s = STRINGS[locale];
        const htmlLang = locale === 'pt' ? 'pt-PT' : 'en';

        const atRiskHtml = atRisk.map(w => {
          const alerts = alertsByWorkspace[w.id] || { critical: 0, warning: 0 };
          return `
            <tr>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
                <a href="${baseUrl}/workspace/${w.id}" style="color: #2563eb; text-decoration: none; font-weight: 500;">
                  ${getStartupName(w)}
                </a>
              </td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
                <span style="background: ${w.health_score === 'critical' ? '#fef2f2' : '#fef3c7'}; color: ${w.health_score === 'critical' ? '#dc2626' : '#d97706'}; padding: 4px 8px; border-radius: 4px; font-size: 12px;">
                  ${w.health_score_numeric}
                </span>
              </td>
              <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">
                ${alerts.critical > 0 ? `<span style="color: #dc2626;">🔴 ${alerts.critical}</span>` : ''}
                ${alerts.warning > 0 ? `<span style="color: #d97706;">🟡 ${alerts.warning}</span>` : ''}
                ${alerts.critical === 0 && alerts.warning === 0 ? '-' : ''}
              </td>
            </tr>
          `;
        }).join('');

        const improvedHtml = mostImproved.map(([id, trend]) => {
          const ws = workspaces?.find(w => w.id === id);
          return `<li style="padding: 8px 0;"><strong>${getStartupName(ws)}</strong>:
            <span style="color: #059669;">+${trend.delta} pts</span> (${trend.start} → ${trend.end})</li>`;
        }).join('');

        const declinedHtml = mostDeclined.map(([id, trend]) => {
          const ws = workspaces?.find(w => w.id === id);
          return `<li style="padding: 8px 0;"><strong>${getStartupName(ws)}</strong>:
            <span style="color: #dc2626;">${trend.delta} pts</span> (${trend.start} → ${trend.end})</li>`;
        }).join('');

        const html = `
          <div lang="${htmlLang}" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #1f2937; margin-bottom: 20px;">${s.title}</h1>
            <p style="color: #6b7280; margin-bottom: 30px;">
              ${s.weekOf(weekAgo.toLocaleDateString(s.locale), now.toLocaleDateString(s.locale))}
            </p>
            <h2 style="color: #dc2626; margin-bottom: 15px;">${s.attention(atRisk.length)}</h2>
            ${atRisk.length > 0 ? `
              <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead>
                  <tr style="background: #f9fafb;">
                    <th style="padding: 12px; text-align: left; border-bottom: 2px solid #e5e7eb;">${s.colStartup}</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">${s.colScore}</th>
                    <th style="padding: 12px; text-align: center; border-bottom: 2px solid #e5e7eb;">${s.colAlerts}</th>
                  </tr>
                </thead>
                <tbody>${atRiskHtml}</tbody>
              </table>
            ` : `<p style="color: #6b7280; margin-bottom: 30px;">${s.noRisk}</p>`}
            ${mostImproved.length > 0 ? `
              <h2 style="color: #059669; margin-bottom: 15px;">${s.improved}</h2>
              <ul style="list-style: none; padding: 0; margin-bottom: 30px;">${improvedHtml}</ul>
            ` : ''}
            ${mostDeclined.length > 0 ? `
              <h2 style="color: #f59e0b; margin-bottom: 15px;">${s.declined}</h2>
              <ul style="list-style: none; padding: 0; margin-bottom: 30px;">${declinedHtml}</ul>
            ` : ''}
            <a href="${baseUrl}/my-workspaces"
               style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
              ${s.cta}
            </a>
            <p style="color: #9ca3af; font-size: 12px; margin-top: 30px;">
              ${s.footer}
              <a href="${baseUrl}/settings" style="color: #6b7280;">${s.managePrefs}</a>
            </p>
          </div>
        `;

        await resend.emails.send({
          from: "Startup Leiria <noreply@startupleiria.com>",
          to: [profile.email],
          subject: s.subject(atRisk.length),
          html,
        });

        emailsSent++;
        await new Promise(r => setTimeout(r, 600));
      } catch (emailError) {
        console.error(`Failed to send digest to ${profile.email}:`, emailError);
      }
    }

    return new Response(JSON.stringify({ success: true, emailsSent }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: unknown) {
    console.error("Error in send-weekly-health-digest:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
}));
