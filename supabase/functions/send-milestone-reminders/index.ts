import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";
import { requireCronSecret } from "../_shared/security.ts";
import { withCronRunLogging } from '../_shared/cronRun.ts';
import { isFounderEmailBlocked } from '../_shared/founderKillSwitch.ts';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(withCronRunLogging('send-milestone-reminders', async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Security guard: require cron secret for scheduled jobs
  const cronAuth = await requireCronSecret(req);
  if ("error" in cronAuth) {
    return cronAuth.error;
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    console.log("Starting milestone reminder check...");

    // Get all upcoming milestones with due dates
    const { data: milestones, error: milestonesError } = await supabase
      .from("milestones")
      .select(`
        id,
        title,
        target_date,
        status,
        workspace_id,
        workspaces!inner(
          id,
          startup_id,
          startups!inner(name)
        )
      `)
      .not("target_date", "is", null)
      .in("status", ["not_started", "in_progress"])
      .gte("target_date", new Date().toISOString().split("T")[0])
      .order("target_date", { ascending: true });

    if (milestonesError) {
      console.error("Error fetching milestones:", milestonesError);
      throw milestonesError;
    }

    console.log(`Found ${milestones?.length || 0} upcoming milestones`);

    let emailsSent = 0;
    let slackSent = 0;
    let notificationsSent = 0;

    for (const milestone of milestones || []) {
      const targetDate = new Date(milestone.target_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntilDue = Math.ceil((targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // Sem FK workspace_users -> profiles / notification_preferences: o embed dá PGRST200.
      const { data: members, error: usersError } = await supabase
        .from("workspace_users").select("user_id, role")
        .eq("workspace_id", milestone.workspace_id).eq("active", true);
      if (usersError) { console.error("Error fetching workspace users:", usersError); continue; }
      type MemberProfile = { id: string; email: string | null; full_name: string | null; preferred_language: string | null };
      type ReminderPrefs = { user_id: string; milestone_reminders_enabled: boolean | null; milestone_reminder_days: number | null;
        email_on_founder_delays: boolean | null; slack_enabled: boolean | null; slack_webhook_url: string | null };
      const memberIds = ((members ?? []) as { user_id: string }[]).map((m) => m.user_id);
      const { data: profileRows, error: profilesError } = memberIds.length
        ? await supabase.from("profiles").select("id, email, full_name, preferred_language").in("id", memberIds)
        : { data: [], error: null };
      const { data: prefRows, error: prefsError } = memberIds.length
        ? await supabase.from("notification_preferences")
            .select("user_id, milestone_reminders_enabled, milestone_reminder_days, email_on_founder_delays, slack_enabled, slack_webhook_url")
            .in("user_id", memberIds)
        : { data: [], error: null };
      if (profilesError || prefsError) { console.error("Error fetching member profiles/preferences:", profilesError ?? prefsError); continue; }
      const profileById = new Map<string, MemberProfile>(((profileRows ?? []) as MemberProfile[]).map((p): [string, MemberProfile] => [p.id, p]));
      const prefsByUser = new Map<string, ReminderPrefs>(((prefRows ?? []) as ReminderPrefs[]).map((p): [string, ReminderPrefs] => [p.user_id, p]));
      const workspaceUsers = ((members ?? []) as { user_id: string; role: string }[])
        .filter((m) => profileById.has(m.user_id)) // equivalente ao profiles!inner
        .map((m) => ({ ...m, profiles: profileById.get(m.user_id)!,
          notification_preferences: prefsByUser.has(m.user_id) ? [prefsByUser.get(m.user_id)!] : [] }));

      // Um registo por (marco, dias antes): verificar uma vez, antes do ciclo, para todos os membros receberem
      const { data: existingReminder } = await supabase
        .from("milestone_reminders").select("id")
        .eq("milestone_id", milestone.id).eq("days_before", daysUntilDue)
        .limit(1).maybeSingle();
      if (existingReminder) {
        console.log(`Reminder already sent for milestone ${milestone.id}`);
        continue;
      }
      let notifiedAny = false;


      for (const user of workspaceUsers || []) {
        if (user.role !== 'admin' && user.role !== 'consultor' && await isFounderEmailBlocked(supabase, user.user_id)) continue;
        const prefs = user.notification_preferences?.[0];
        const reminderDays = prefs?.milestone_reminder_days ?? 3;
        const remindersEnabled = prefs?.milestone_reminders_enabled ?? true;

        // Skip if reminders disabled or not the right day
        if (!remindersEnabled || daysUntilDue !== reminderDays) {
          continue;
        }

        const startupName = (milestone.workspaces as any)?.startups?.name || "Your Startup";
        const profile = user.profiles as any;
        const locale: 'pt' | 'en' = (profile.preferred_language as 'pt' | 'en') ?? 'pt';
        const dateStr = targetDate.toLocaleDateString(locale === 'pt' ? 'pt-PT' : 'en-GB');
        const dayWord = locale === 'pt'
          ? (daysUntilDue === 1 ? 'dia' : 'dias')
          : (daysUntilDue === 1 ? 'day' : 'days');

        const s = {
          pt: {
            heading: '⏰ Lembrete de Milestone',
            greeting: (n: string) => `Olá ${n},`,
            body: (d: number, w: string) => `Este é um lembrete de que o seguinte milestone vence em <strong>${d} ${w}</strong>:`,
            startup: 'Startup',
            dueDate: 'Data limite',
            cta: 'Ver Milestone',
            footer: 'Pode gerir as suas preferências de notificação nas Definições.',
            subject: (d: number, w: string, t: string) => `⏰ Milestone vence em ${d} ${w}: ${t}`,
            slackHeader: 'Lembrete de Milestone',
            slackDue: 'Vence',
            slackRemaining: (d: number, w: string) => `${d} ${w} restantes`,
            notifTitle: (d: number, w: string) => `Milestone vence em ${d} ${w}`,
            notifMessage: (t: string, n: string, dt: string) => `"${t}" para ${n} vence em ${dt}`,
          },
          en: {
            heading: '⏰ Milestone Reminder',
            greeting: (n: string) => `Hi ${n},`,
            body: (d: number, w: string) => `This is a reminder that the following milestone is due in <strong>${d} ${w}</strong>:`,
            startup: 'Startup',
            dueDate: 'Due Date',
            cta: 'View Milestone',
            footer: 'You can manage your notification preferences in Settings.',
            subject: (d: number, w: string, t: string) => `⏰ Milestone due in ${d} ${w}: ${t}`,
            slackHeader: 'Milestone Reminder',
            slackDue: 'Due',
            slackRemaining: (d: number, w: string) => `${d} ${w} remaining`,
            notifTitle: (d: number, w: string) => `Milestone due in ${d} ${w}`,
            notifMessage: (t: string, n: string, dt: string) => `"${t}" for ${n} is due on ${dt}`,
          },
        }[locale];

        // Staff/consultants can opt out of email alerts about founder delays
        // (in-app notifications and Slack are unaffected).
        const founderDelayEmailsEnabled = prefs?.email_on_founder_delays ?? true;
        const isStaffRole = ['consultor', 'admin', 'backoffice'].includes(user.role);
        const skipEmail = isStaffRole && !founderDelayEmailsEnabled;

        // Send email reminder
        if (!skipEmail) try {
          const emailHtml = `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #333;">${s.heading}</h2>
              <p>${s.greeting(profile.full_name || (locale === 'pt' ? 'utilizador' : 'there'))}</p>
              <p>${s.body(daysUntilDue, dayWord)}</p>
              <div style="background: #f5f5f5; padding: 16px; border-radius: 8px; margin: 16px 0;">
                <h3 style="margin: 0 0 8px 0; color: #333;">${milestone.title}</h3>
                <p style="margin: 0; color: #666;">
                  <strong>${s.startup}:</strong> ${startupName}<br/>
                  <strong>${s.dueDate}:</strong> ${dateStr}
                </p>
              </div>
              <p>
                <a href="${Deno.env.get("PUBLIC_APP_URL") || 'https://fb.startupleiria.com'}/workspace/${milestone.workspace_id}?tab=milestones-actions"
                   style="background: #6366f1; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
                  ${s.cta}
                </a>
              </p>
              <p style="color: #888; font-size: 14px; margin-top: 24px;">
                ${s.footer}
              </p>
            </div>
          `;

          // Resend returns { data, error } and never throws — check error explicitly.
          const { error: sendError } = await resend.emails.send({
            from: "Startup Leiria <noreply@startupleiria.com>",
            to: profile.email,
            subject: s.subject(daysUntilDue, dayWord, milestone.title),
            html: emailHtml,
          });
          if (sendError) {
            console.error("Resend rejected milestone reminder:", sendError);
          } else {
            emailsSent++;
          }
          console.log(`Email sent to ${profile.email} for milestone ${milestone.id}`);
        } catch (emailError) {
          console.error("Error sending email:", emailError);
        }

        // Send Slack notification if enabled
        if (prefs?.slack_enabled && prefs?.slack_webhook_url) {
          try {
            const res = await fetch(prefs.slack_webhook_url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: `${s.slackHeader}: "${milestone.title}" — ${s.slackRemaining(daysUntilDue, dayWord)}`,
                blocks: [
                  {
                    type: "section",
                    text: {
                      type: "mrkdwn",
                      text: `⏰ *${s.slackHeader}*\n\n*${milestone.title}*\n📍 ${startupName}\n📅 ${s.slackDue}: ${dateStr}\n⏳ ${s.slackRemaining(daysUntilDue, dayWord)}`,
                    },
                  },
                ],
              }),
            });
            if (res.ok) {
              slackSent++;
              console.log(`Slack notification sent for milestone ${milestone.id}`);
            } else {
              console.error(`Slack webhook ${res.status} for milestone ${milestone.id}`);
            }
          } catch (slackError) {
            console.error("Error sending Slack:", slackError);
          }
        }

        // Create in-app notification
        const { error: nErr } = await supabase.from("notifications").insert({
          user_id: user.user_id,
          type: "milestone_reminder",
          title: s.notifTitle(daysUntilDue, dayWord),
          message: s.notifMessage(milestone.title, startupName, dateStr),
          link: `/workspace/${milestone.workspace_id}?tab=milestones-actions`,
          metadata: { milestone_id: milestone.id, days_until_due: daysUntilDue },
        });
        if (nErr) console.error("Error creating notification:", nErr); else notificationsSent++;

        notifiedAny = true;
      }

      if (notifiedAny) {
        await supabase.from("milestone_reminders").insert({
          milestone_id: milestone.id,
          workspace_id: milestone.workspace_id,
          reminder_type: "combined",
          days_before: daysUntilDue,
        });
      }
    }

    console.log(`Reminders sent - Emails: ${emailsSent}, Slack: ${slackSent}, In-app: ${notificationsSent}`);

    return new Response(
      JSON.stringify({
        success: true,
        emails_sent: emailsSent,
        slack_sent: slackSent,
        notifications_sent: notificationsSent,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-milestone-reminders:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}));
