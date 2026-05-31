import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronOrStaff } from "../_shared/security.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface TemplateNotificationRequest {
  type: "submitted" | "reviewed";
  instanceId: string;
  review_status?: string;
  review_notes?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);
    const supabaseUser = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });

    // Security guard: require cron secret OR authenticated staff user
    const authResult = await requireCronOrStaff(req, supabaseUser, supabaseAdmin);
    if ("error" in authResult) {
      return authResult.error;
    }

    const body: TemplateNotificationRequest = await req.json();
    console.log("Template notification request:", body);

    // Get template instance with related data
    const { data: instance, error: instanceError } = await supabaseAdmin
      .from("template_instances")
      .select(`
        *,
        template:templates(name, category),
        workspace:workspaces(id, startup:startups(name), program_id)
      `)
      .eq("id", body.instanceId)
      .single();

    if (instanceError || !instance) {
      console.error("Instance not found:", instanceError);
      return new Response(
        JSON.stringify({ success: false, error: "Instance not found" }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const templateName = (instance.template as any)?.name || "Template";
    const startupName = (instance.workspace as any)?.startup?.name || "Unknown Startup";
    const workspaceId = instance.workspace_id;

    if (body.type === "submitted") {
      // Notify consultors and mentors assigned to this workspace
      const { data: workspaceUsers } = await supabaseAdmin
        .from("workspace_users")
        .select("user_id, role")
        .eq("workspace_id", workspaceId)
        .eq("active", true)
        .in("role", ["consultor", "mentor_externo"]);

      // In-app notifications: insert one per reviewer so they see the
      // submission in the bell/notification center even if email fails.
      // Idempotent via (user_id, event_key) — retries won't duplicate.
      if (workspaceUsers?.length) {
        const notifRows = workspaceUsers
          .filter((wu) => !!wu.user_id)
          .map((wu) => ({
            user_id: wu.user_id,
            type: "template_submitted",
            title: `${templateName} submetido para revisão`,
            message: `${startupName} submeteu uma nova ferramenta para revisão.`,
            link: `/workspace/${workspaceId}?tab=templates&instance=${body.instanceId}`,
            entity_type: "template_instance",
            entity_id: body.instanceId,
            event_key: `template_submitted:${body.instanceId}:${wu.user_id}`,
            metadata: { template_name: templateName, startup_name: startupName, workspace_id: workspaceId },
          }));
        if (notifRows.length) {
          const { error: notifErr } = await supabaseAdmin
            .from("notifications")
            .upsert(notifRows, { onConflict: "user_id,event_key", ignoreDuplicates: true });
          if (notifErr) console.error("notifications upsert failed:", notifErr);
        }
      }

      if (!workspaceUsers?.length) {
        console.log("No reviewers found for workspace");
        return new Response(
          JSON.stringify({ success: true, emailsSent: 0, reason: "No reviewers" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }


      // Get submitter info
      let submitterName = "A founder";
      if (instance.created_by) {
        const { data: submitter } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", instance.created_by)
          .single();
        if (submitter?.full_name) {
          submitterName = submitter.full_name;
        }
      }

      let emailsSent = 0;
      for (const wu of workspaceUsers) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("email, full_name")
          .eq("id", wu.user_id)
          .single();

        if (!profile?.email) continue;

        const emailHtml = buildSubmittedEmail({
          reviewerName: profile.full_name || "Reviewer",
          templateName,
          startupName,
          submitterName,
          workspaceId,
        });

        try {
          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Startup Leiria <noreply@startupleiria.com>",
              to: [profile.email],
              subject: `📝 Template para revisão: ${templateName} - ${startupName}`,
              html: emailHtml,
            }),
          });

          if (emailResponse.ok) {
            emailsSent++;
            console.log(`Submitted notification sent to ${profile.email}`);
          }
        } catch (e) {
          console.error(`Failed to send email to ${profile.email}:`, e);
        }
      }

      return new Response(
        JSON.stringify({ success: true, emailsSent }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );

    } else if (body.type === "reviewed") {
      // Notify the founder who submitted the template
      if (!instance.created_by) {
        console.log("No creator to notify");
        return new Response(
          JSON.stringify({ success: true, emailsSent: 0, reason: "No creator" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      const { data: creator } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", instance.created_by)
        .single();

      if (!creator?.email) {
        console.log("Creator email not found");
        return new Response(
          JSON.stringify({ success: true, emailsSent: 0, reason: "No email" }),
          { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }

      // Get reviewer name
      let reviewerName = "A team member";
      if (instance.reviewer_id) {
        const { data: reviewer } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", instance.reviewer_id)
          .single();
        if (reviewer?.full_name) {
          reviewerName = reviewer.full_name;
        }
      }

      const isApproved = body.review_status === "approved";
      const emailHtml = buildReviewedEmail({
        founderName: creator.full_name || "Founder",
        templateName,
        startupName,
        reviewerName,
        isApproved,
        reviewNotes: body.review_notes,
        workspaceId,
      });

      const subject = isApproved
        ? `✅ Template aprovado: ${templateName} - ${startupName}`
        : `📝 Alterações necessárias: ${templateName} - ${startupName}`;

      try {
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: "Startup Leiria <noreply@startupleiria.com>",
            to: [creator.email],
            subject,
            html: emailHtml,
          }),
        });

        if (emailResponse.ok) {
          console.log(`Review notification sent to ${creator.email}`);
          return new Response(
            JSON.stringify({ success: true, emailsSent: 1 }),
            { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }
      } catch (e) {
        console.error(`Failed to send email to ${creator.email}:`, e);
      }
    }

    return new Response(
      JSON.stringify({ success: true, emailsSent: 0 }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-template-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

interface SubmittedEmailData {
  reviewerName: string;
  templateName: string;
  startupName: string;
  submitterName: string;
  workspaceId: string;
}

function buildSubmittedEmail(data: SubmittedEmailData): string {
  const appUrl = Deno.env.get("PUBLIC_APP_URL") || "https://fb.startupleiria.com";
  const url = `${appUrl}/workspace/${data.workspaceId}?tab=templates`;

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #c8e53d 0%, #c03c3c 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">📝 Template para Revisão</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">Startup Leiria</p>
      </div>
      
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 12px 12px;">
        <p style="margin-top: 0;">Olá ${data.reviewerName},</p>
        
        <p>${data.submitterName} submeteu um template para revisão:</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid #c8e53d; margin: 20px 0;">
          <h2 style="margin: 0 0 10px 0; font-size: 18px;">${data.templateName}</h2>
          <p style="color: #888; font-size: 14px; margin: 0;">
            <strong>Startup:</strong> ${data.startupName}
          </p>
        </div>
        
        <p>Por favor, revisa o template e deixa o teu feedback.</p>
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="${url}" 
             style="display: inline-block; background: #c03c3c; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
            Rever Template
          </a>
        </div>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        
        <p style="color: #666; font-size: 12px; text-align: center; margin-bottom: 0;">
          <a href="${appUrl}/settings" style="color: #c03c3c;">Gerir preferências</a>
        </p>
      </div>
    </body>
    </html>
  `;
}

interface ReviewedEmailData {
  founderName: string;
  templateName: string;
  startupName: string;
  reviewerName: string;
  isApproved: boolean;
  reviewNotes?: string;
  workspaceId: string;
}

function buildReviewedEmail(data: ReviewedEmailData): string {
  const reviewAppUrl = Deno.env.get("PUBLIC_APP_URL") || "https://fb.startupleiria.com";
  const url = `${reviewAppUrl}/workspace/${data.workspaceId}?tab=templates`;
  
  const statusText = data.isApproved ? "foi aprovado" : "precisa de alterações";
  const statusColor = data.isApproved ? "#22c55e" : "#f59e0b";
  const statusIcon = data.isApproved ? "✅" : "📝";

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, ${statusColor} 0%, #c03c3c 100%); padding: 30px; border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">${statusIcon} Template Revisto</h1>
        <p style="color: rgba(255,255,255,0.9); margin: 5px 0 0 0;">Startup Leiria</p>
      </div>
      
      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 12px 12px;">
        <p style="margin-top: 0;">Olá ${data.founderName},</p>
        
        <p>O teu template <strong>${data.templateName}</strong> ${statusText}.</p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; border-left: 4px solid ${statusColor}; margin: 20px 0;">
          <p style="margin: 0; color: #666;">
            <strong>Revisor:</strong> ${data.reviewerName}
          </p>
          ${data.reviewNotes ? `
            <hr style="border: none; border-top: 1px solid #eee; margin: 15px 0;">
            <p style="margin: 0;"><strong>Feedback:</strong></p>
            <p style="margin: 10px 0 0 0; color: #333;">${data.reviewNotes}</p>
          ` : ''}
        </div>
        
        ${!data.isApproved ? `
          <p>Por favor, revê o feedback e faz as alterações necessárias.</p>
        ` : `
          <p>Parabéns! Podes avançar para o próximo passo.</p>
        `}
        
        <div style="text-align: center; margin-top: 30px;">
          <a href="${url}" 
             style="display: inline-block; background: #c03c3c; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500;">
            Ver Template
          </a>
        </div>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        
        <p style="color: #666; font-size: 12px; text-align: center; margin-bottom: 0;">
          <a href="${reviewAppUrl}/settings" style="color: #c03c3c;">Gerir preferências</a>
        </p>
      </div>
    </body>
    </html>
  `;
}
