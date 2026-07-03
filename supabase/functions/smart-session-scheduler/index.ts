import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Checking for health score drops...");

    // Get workspaces with recent health drops
    const { data: workspaces, error: wsError } = await supabase
      .from('workspaces')
      .select(`
        id,
        health_score,
        previous_health_score,
        last_session_at,
        startup:startups(id, name),
        program:programs(id, name)
      `)
      .eq('status', 'active')
      .not('health_score', 'is', null);

    if (wsError) {
      console.error("Error fetching workspaces:", wsError);
      throw wsError;
    }

    const sessionsToSuggest: any[] = [];
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    for (const workspace of workspaces || []) {
      const healthScore = workspace.health_score as number;
      const previousScore = workspace.previous_health_score as number | null;
      const lastSession = workspace.last_session_at ? new Date(workspace.last_session_at) : null;

      // Check if health dropped significantly (>15 points) or is critical (<40)
      const significantDrop = previousScore && (previousScore - healthScore) >= 15;
      const isCritical = healthScore < 40;
      const noRecentSession = !lastSession || lastSession < threeDaysAgo;

      if ((significantDrop || isCritical) && noRecentSession) {
        // Check if we already suggested a session recently
        const { data: recentSuggestions } = await supabase
          .from('staff_work_queue_items')
          .select('id')
          .eq('workspace_id', workspace.id)
          .eq('type', 'suggested_session')
          .gte('created_at', threeDaysAgo.toISOString())
          .limit(1);

        if (recentSuggestions && recentSuggestions.length > 0) {
          continue;
        }

        const reason = significantDrop 
          ? `Health score dropped from ${previousScore} to ${healthScore}`
          : `Critical health score: ${healthScore}`;

        // Create work queue item for consultors
        const { data: suggestion, error: suggestError } = await supabase
          .from('staff_work_queue_items')
          .insert({
            workspace_id: workspace.id,
            type: 'suggested_session',
            title: `Schedule check-in: ${(workspace.startup as any)?.name || 'Startup'}`,
            description: `${reason}. Consider scheduling a session to address concerns.`,
            priority: isCritical ? 'urgent' : 'high',
            status: 'open',
            evidence_json: {
              health_score: healthScore,
              previous_score: previousScore,
              last_session: workspace.last_session_at,
              reason,
            },
          })
          .select()
          .single();

        if (!suggestError && suggestion) {
          sessionsToSuggest.push(suggestion);

          // Notify workspace users
          const { data: wsUsers } = await supabase
            .from('workspace_users')
            .select('user_id')
            .eq('workspace_id', workspace.id)
            .eq('active', true)
            .in('role', ['consultor', 'mentor_externo']);

          for (const user of wsUsers || []) {
            await supabase.from('notifications').insert({
              user_id: user.user_id,
              type: 'health_alert',
              title: `Schedule session with ${(workspace.startup as any)?.name || 'Startup'}`,
              message: reason,
              link: `/workspace/${workspace.id}?tab=agenda`,
            });
          }
        }
      }
    }

    console.log(`Suggested ${sessionsToSuggest.length} sessions`);

    return new Response(
      JSON.stringify({
        success: true,
        checked: workspaces?.length || 0,
        sessionsSuggested: sessionsToSuggest.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in smart-session-scheduler:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
