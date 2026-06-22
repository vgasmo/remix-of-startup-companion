import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@4.0.0";
import { requireCronSecret } from "../_shared/security.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Security guard: require cron secret for scheduled jobs
  const cronAuth = requireCronSecret(req);
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

      // Get workspace users with their notification preferences
      const { data: workspaceUsers, error: usersError } = await supabase
        .from("workspace_users")
        .select(`
          user_id,
          role,
          profiles!inner(id, email, full_name, preferred_language),
          notification_preferences(
            milestone_reminders_enabled,
            milestone_reminder_days,
            slack_enabled,
            slack_webhook_url
          )
        `)
        .eq("workspace_id", milestone.workspace_id)
        .eq("active", true);

      if (usersError) {
        console.error("Error fetching workspace users:", usersError);
        continue;
      }


      for (const user of workspaceUsers || []) {
        const prefs = user.notification_preferences?.[0];
        const reminderDays = prefs?.milestone_reminder_days ?? 3;
        const remindersEnabled = prefs?.milestone_reminders_enabled ?? true;

        // Skip if reminders disabled or not the right day
        if (!remindersEnabled || daysUntilDue !== reminderDays) {
          continue;
        }

        // Check if we already sent this reminder
        const { data: existingReminder } = await supabase
          .from("milestone_reminders")
          .select("id")
          .eq("milestone_id", milestone.id)
          .eq("days_before", daysUntilDue)
          .single();

        if (existingReminder) {
          console.log(`Reminder already sent for milestone ${milestone.id}`);
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

        // Send email reminder
        try {
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
                <a href="${Deno.env.get("PUBLIC_APP_URL") || 'https://fb.startupleiria.com'}/workspace/${milestone.workspace_id}?tab=milestones"
                   style="background: #6366f1; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">
                  ${s.cta}
                </a>
              </p>
              <p style="color: #888; font-size: 14px; margin-top: 24px;">
                ${s.footer}
              </p>
            </div>
          `;

          await resend.emails.send({
            from: "Startup Leiria <noreply@startupleiria.com>",
            to: profile.email,
            subject: s.subject(daysUntilDue, dayWord, milestone.title),
            html: emailHtml,
          });

          emailsSent++;
          console.log(`Email sent to ${profile.email} for milestone ${milestone.id}`);
        } catch (emailError) {
          console.error("Error sending email:", emailError);
        }

        // Send Slack notification if enabled
        if (prefs?.slack_enabled && prefs?.slack_webhook_url) {
          try {
            await fetch(prefs.slack_webhook_url, {
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
            slackSent++;
            console.log(`Slack notification sent for milestone ${milestone.id}`);
          } catch (slackError) {
            console.error("Error sending Slack:", slackError);
          }
        }

        // Create in-app notification
        try {
          await supabase.from("notifications").insert({
            user_id: user.user_id,
            type: "milestone_reminder",
            title: s.notifTitle(daysUntilDue, dayWord),
            message: s.notifMessage(milestone.title, startupName, dateStr),
            link: `/workspace/${milestone.workspace_id}?tab=milestones`,
            metadata: { milestone_id: milestone.id, days_until_due: daysUntilDue },
          });
          notificationsSent++;
        } catch (notifError) {
          console.error("Error creating notification:", notifError);
        }

        // Record that we sent this reminder
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
});
