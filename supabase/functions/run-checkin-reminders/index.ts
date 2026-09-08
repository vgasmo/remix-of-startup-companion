import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronSecret } from "../_shared/security.ts";
import { withCronRunLogging } from '../_shared/cronRun.ts';



const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

// Simple Resend email sending function (no npm import needed)
async function sendEmail(apiKey: string, options: {
  from: string;
  to: string[];
  subject: string;
  html: string;
}): Promise<{ id?: string; error?: string }> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { error: errorText };
  }

  const data = await response.json();
  return { id: data.id };
}

interface PendingCheckin {
  id: string;
  workspace_id: string;
  due_date: string;
  definition_name: string;
  startup_name: string;
  founder_emails: string[];
  founder_names: string[];
}

const handler = async (req: Request): Promise<Response> => {
  console.log("[run-checkin-reminders] Starting execution");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // SECURITY: Fail-closed cron-secret validation (timing-safe, requires CRON_SECRET env).
    const authCheck = await requireCronSecret(req);
    if ("error" in authCheck) {
      console.error("[run-checkin-reminders] Unauthorized cron invocation");
      return authCheck.error;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = RESEND_API_KEY;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Step 1: Generate monthly check-ins for this period
    console.log("[run-checkin-reminders] Generating monthly check-ins...");
    const { data: generatedCount, error: genError } = await supabase.rpc("generate_weekly_checkins");
    
    if (genError) {
      console.error("[run-checkin-reminders] Error generating check-ins:", genError);
    } else {
      console.log(`[run-checkin-reminders] Generated ${generatedCount} new check-in instances`);
    }

    // Step 2: Update overdue status
    const today = new Date().toISOString().split("T")[0];
    const { error: updateError } = await supabase
      .from("checkin_instances")
      .update({ compliance_status: "overdue" })
      .eq("status", "pending")
      .lt("due_date", today);

    if (updateError) {
      console.error("[run-checkin-reminders] Error updating overdue status:", updateError);
    }

    // Step 3: Find pending check-ins that need reminders
    const { data: pendingCheckins, error: fetchError } = await supabase
      .from("checkin_instances")
      .select(`
        id,
        workspace_id,
        due_date,
        reminder_sent_at,
        definition:checkin_definitions(name),
        workspace:workspaces(
          startup:startups(name),
          members:workspace_users(user_id, role)
        )
      `)
      .eq("status", "pending")
      .is("reminder_sent_at", null)
      .lte("due_date", new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]); // Due within 2 days

    if (fetchError) {
      console.error("[run-checkin-reminders] Error fetching pending check-ins:", fetchError);
      throw fetchError;
    }

    console.log(`[run-checkin-reminders] Found ${pendingCheckins?.length || 0} pending check-ins needing reminders`);

    // Fetch founder profiles separately (no FK workspace_users -> profiles,
    // so a PostgREST embed fails with PGRST200).
    const founderIds = new Set<string>();
    for (const c of pendingCheckins || []) {
      for (const m of ((c.workspace as any)?.members || [])) {
        if (m.role === "founder") founderIds.add(m.user_id);
      }
    }
    const profileMap = new Map<string, { email: string | null; full_name: string | null }>();
    if (founderIds.size > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .in("id", Array.from(founderIds));
      if (profilesError) {
        console.error("[run-checkin-reminders] Error fetching profiles:", profilesError);
      } else {
        for (const p of profilesData || []) profileMap.set(p.id, p);
      }
    }

    const results = {
      generated: generatedCount || 0,
      reminders_sent: 0,
      errors: [] as string[],
    };

    if (!pendingCheckins || pendingCheckins.length === 0) {
      return new Response(JSON.stringify({ success: true, ...results }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Step 4: Send reminders and create notifications.
    // Truthful-result rule (Batch A #6): reminder_sent_at is only stamped
    // when at least one delivery channel confirmed success. If every channel
    // failed the checkin stays retry-eligible on the next cron run.
    for (const checkin of pendingCheckins) {
      let deliveredAny = false;
      try {
        const workspace = checkin.workspace as any;
        const definition = checkin.definition as any;
        const startupName = workspace?.startup?.name || "Your Startup";
        const definitionName = definition?.name || "Monthly Check-in";

        // Find founders in this workspace
        const founders = (workspace?.members || [])
          .filter((m: any) => m.role === "founder")
          .map((m: any) => ({ ...m, profile: profileMap.get(m.user_id) || null }));

        if (founders.length === 0) {
          console.log(`[run-checkin-reminders] No founders found for workspace ${checkin.workspace_id}`);
          continue;
        }

        // Create in-app notifications for each founder
        for (const founder of founders) {
          const { error: notifError } = await supabase.from("notifications").insert({
            user_id: founder.user_id,
            type: "checkin_reminder",
            title: "Monthly check-in pending",
            message: `Your monthly check-in for ${startupName} is due on ${checkin.due_date}. Please submit your update.`,
            link: `/workspace/${checkin.workspace_id}?tab=overview`,
            metadata: {
              checkin_instance_id: checkin.id,
              workspace_id: checkin.workspace_id,
            },
          });

          if (notifError) {
            console.error(`[run-checkin-reminders] Error creating notification for user ${founder.user_id}:`, notifError);
          } else {
            deliveredAny = true;
          }
        }

        // Send email reminders if Resend is configured
        if (resendApiKey) {
          for (const founder of founders) {
            const founderEmail = founder.profile?.email;
            const founderName = founder.profile?.full_name || "Founder";

            if (!founderEmail) continue;

            try {
              const emailResult = await sendEmail(resendApiKey, {
                from: "Startup Leiria <noreply@startupleiria.com>",
                to: [founderEmail],
                subject: `📋 Monthly check-in: ${startupName}`,
                html: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #333;">Hi ${founderName},</h2>
                    <p>Your <strong>${definitionName}</strong> for <strong>${startupName}</strong> is ready.</p>
                    <p><strong>Due date:</strong> ${new Date(checkin.due_date).toLocaleDateString("pt-PT", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
                    <p>This monthly check-in helps us track progress and provide better support.</p>
                    <div style="margin: 24px 0;">
                      <a href="${Deno.env.get("PUBLIC_APP_URL") || 'https://fb.startupleiria.com'}/workspace/${checkin.workspace_id}?tab=overview"
                         style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                        Complete monthly check-in
                      </a>
                    </div>
                    <p style="color: #666; font-size: 14px;">If you have any questions, reach out to your assigned consultant.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;" />
                    <p style="color: #999; font-size: 12px;">Startup Leiria</p>
                  </div>
                `,
              });

              if (emailResult.error) {
                throw new Error(emailResult.error);
              }

              // Log the email
              await supabase.from("email_log").insert({
                workspace_id: checkin.workspace_id,
                email_type: "checkin_reminder",
                subject: `📋 Monthly check-in: ${startupName}`,
                recipients: [{ email: founderEmail, name: founderName }],
                status: "sent",
                sent_at: new Date().toISOString(),
              });

              results.reminders_sent++;
              deliveredAny = true;

              // Rate limiting: 600ms delay between emails
              await new Promise((resolve) => setTimeout(resolve, 600));
            } catch (emailError: any) {
              console.error(`[run-checkin-reminders] Error sending email to ${founderEmail}:`, emailError);

              // Log failed email
              await supabase.from("email_log").insert({
                workspace_id: checkin.workspace_id,
                email_type: "checkin_reminder",
                subject: `📋 Monthly Check-in: ${startupName}`,
                recipients: [{ email: founderEmail, name: founderName }],
                status: "failed",
                error_message: emailError.message,
              });

              results.errors.push(`Email to ${founderEmail}: ${emailError.message}`);
            }
          }
        }

        // Only mark reminder_sent_at when at least one channel confirmed delivery.
        if (deliveredAny) {
          await supabase
            .from("checkin_instances")
            .update({ reminder_sent_at: new Date().toISOString() })
            .eq("id", checkin.id);
        } else {
          console.warn(`[run-checkin-reminders] No delivery channel succeeded for checkin ${checkin.id} — leaving retry-eligible`);
        }

      } catch (checkinError: any) {
        console.error(`[run-checkin-reminders] Error processing check-in ${checkin.id}:`, checkinError);
        results.errors.push(`Check-in ${checkin.id}: ${checkinError.message}`);
      }
    }


    console.log("[run-checkin-reminders] Completed", results);

    return new Response(JSON.stringify({ success: true, ...results }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });

  } catch (error: any) {
    console.error("[run-checkin-reminders] Fatal error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(withCronRunLogging('run-checkin-reminders', handler));
