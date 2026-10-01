import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronOrStaff } from "../_shared/security.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

interface SlackNotificationRequest {
  workspace_id: string;
  message: string;
  title?: string;
  type?: "info" | "success" | "warning" | "error";
  link?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

  try {
    const supabase = supabaseAdmin;

    const { workspace_id, message, title, type = "info", link } = await req.json() as SlackNotificationRequest;

    if (!workspace_id || !message) {
      return new Response(
        JSON.stringify({ error: "workspace_id and message are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending Slack notification for workspace ${workspace_id}`);

    // Sem FK workspace_users -> notification_preferences: o embed dá PGRST200.
    const { data: members, error: usersError } = await supabase
      .from("workspace_users").select("user_id")
      .eq("workspace_id", workspace_id).eq("active", true);
    if (usersError) throw usersError;
    const ids = (members ?? []).map((m: { user_id: string }) => m.user_id);
    const { data: prefsRows, error: prefsError } = ids.length
      ? await supabase.from("notification_preferences")
          .select("user_id, slack_enabled, slack_webhook_url").in("user_id", ids)
      : { data: [], error: null };
    if (prefsError) throw prefsError;
    type SlackPrefs = { user_id: string; slack_enabled: boolean | null; slack_webhook_url: string | null };
    const prefsByUser = new Map<string, SlackPrefs>(
      ((prefsRows ?? []) as SlackPrefs[]).map((p): [string, SlackPrefs] => [p.user_id, p]),
    );
    const workspaceUsers = ids.map((id: string) => ({
      user_id: id,
      notification_preferences: prefsByUser.has(id) ? [prefsByUser.get(id)!] : [],
    }));

    const emoji = {
      info: "ℹ️",
      success: "✅",
      warning: "⚠️",
      error: "🚨",
    }[type];

    const color = {
      info: "#3b82f6",
      success: "#22c55e",
      warning: "#f59e0b",
      error: "#ef4444",
    }[type];

    let sentCount = 0;

    for (const user of workspaceUsers || []) {
      const prefs = user.notification_preferences?.[0];
      
      if (!prefs?.slack_enabled || !prefs?.slack_webhook_url) {
        continue;
      }

      try {
        const blocks: any[] = [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: title ? `${emoji} *${title}*\n${message}` : `${emoji} ${message}`,
            },
          },
        ];

        if (link) {
          blocks.push({
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", text: "View Details" },
                url: link,
              },
            ],
          });
        }

        const res = await fetch(prefs.slack_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: title ? `${emoji} ${title}: ${message}` : `${emoji} ${message}`,
            attachments: [
              {
                color,
                blocks,
              },
            ],
          }),
        });

        if (!res.ok) {
          console.error(`Slack webhook ${res.status} for user ${user.user_id}`);
          continue;
        }
        sentCount++;
        console.log(`Slack notification sent to user ${user.user_id}`);
      } catch (slackError) {
        console.error(`Error sending to user ${user.user_id}:`, slackError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent_count: sentCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in send-slack-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
