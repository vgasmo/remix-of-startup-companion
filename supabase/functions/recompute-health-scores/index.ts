import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";
import { requireCronOrStaff } from "../_shared/security.ts";

/**
 * Helper to send Teams notification for health alerts (non-blocking)
 */
async function sendTeamsHealthAlert(
  supabaseUrl: string,
  supabaseKey: string,
  workspaceId: string,
  startupName: string,
  alertType: string,
  reason: string,
  prevScore: number,
  newScore: number
) {
  try {
    const appUrl = Deno.env.get('APP_URL') || 'https://startupleiria.app';
    const response = await fetch(`${supabaseUrl}/functions/v1/teams-notify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'x-cron-secret': Deno.env.get('CRON_SECRET') || '',
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        event_type: 'health_alert',
        payload: {
          title: alertType === 'drop_to_critical' ? '🚨 Critical Health Alert' : '⚠️ Health Alert',
          summary: reason,
          startup_name: startupName,
          fields: [
            { name: 'Previous Score', value: `${prevScore}` },
            { name: 'Current Score', value: `${newScore}` },
            { name: 'Change', value: `${prevScore - newScore} points` },
          ],
          link: `${appUrl}/workspace/${workspaceId}?tab=overview`,
          link_text: 'View Workspace',
          priority: alertType === 'drop_to_critical' ? 'critical' : 'high',
        },
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Helper to fire the health alert email edge function (non-blocking).
 */
async function sendHealthAlertEmail(
  supabaseUrl: string,
  supabaseKey: string,
  alertId: string,
) {
  try {
    await fetch(`${supabaseUrl}/functions/v1/send-health-alert-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseKey}`,
        'x-cron-secret': Deno.env.get('CRON_SECRET') || '',
      },
      body: JSON.stringify({ alert_id: alertId }),
    });
  } catch {
    // Non-blocking; alert is already persisted.
  }
}

interface HealthModel {
  program_id: string;
  weights_json: {
    actions: number;
    sessions: number;
    kpis: number;
    checkins: number;
  };
  thresholds_json: {
    thriving: number;
    healthy: number;
    stable: number;
    at_risk: number;
  };
}

interface ExplanationFactor {
  factor: string;
  score: number;
  maxScore: number;
  details: string;
  impact: "positive" | "negative" | "neutral";
}

interface AlertConfig {
  pointsDropThreshold: number;
  componentDropThreshold: number;
}

function getHealthLabel(score: number, thresholds: HealthModel["thresholds_json"]): string {
  if (score >= thresholds.thriving) return "thriving";
  if (score >= thresholds.healthy) return "healthy";
  if (score >= thresholds.stable) return "stable";
  if (score >= thresholds.at_risk) return "at_risk";
  return "critical";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsOptions(req);
  }

  try {
    const corsHeaders = getCorsHeaders(req);

    // SECURITY: Fail-closed — accept valid CRON_SECRET (timing-safe) OR a staff user JWT.
    // Requires CRON_SECRET to be configured server-side; missing config returns 500.
    const supabaseUserClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } }
    );
    const supabaseAdminClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    const authCheck = await requireCronOrStaff(req, supabaseUserClient, supabaseAdminClient);
    if ("error" in authCheck) {
      console.error("[recompute-health-scores] Unauthorized invocation");
      return authCheck.error;
    }

    console.log("[recompute-health-scores] Starting health scores recomputation...");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse optional filters from request body
    let programIdFilter: string | null = null;
    let workspaceIdFilter: string | null = null;
    try {
      const body = await req.json();
      programIdFilter = body.program_id || null;
      workspaceIdFilter = body.workspace_id || null;
    } catch {
      // No body or invalid JSON, proceed without filters
    }

    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7) + "-01";
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString().slice(0, 7) + "-01";
    const todayStr = today.toISOString().split("T")[0];

    // Get workspaces based on filters (include startup for notifications)
    let wsQuery = supabase.from("workspaces").select("id, program_id, status, startup:startups(name)").eq("status", "active");
    if (workspaceIdFilter) {
      wsQuery = wsQuery.eq("id", workspaceIdFilter);
    } else if (programIdFilter) {
      wsQuery = wsQuery.eq("program_id", programIdFilter);
    }

    const { data: workspaces, error: wsError } = await wsQuery;

    if (wsError) {
      console.error("[recompute-health-scores] Error fetching workspaces:", wsError);
      throw wsError;
    }

    console.log(`[recompute-health-scores] Processing ${workspaces?.length || 0} active workspaces`);

    // Get health models for all programs
    const { data: healthModels } = await supabase
      .from("program_health_model")
      .select("*")
      .eq("is_enabled", true);

    const modelsByProgram: Record<string, HealthModel & { id?: string }> = {};
    for (const model of healthModels || []) {
      modelsByProgram[model.program_id] = model;
    }

    // Get latest model version for each program
    const { data: modelVersions } = await supabase
      .from("program_health_model_versions")
      .select("id, program_id")
      .order("changed_at", { ascending: false });

    const latestVersionByProgram: Record<string, string> = {};
    for (const v of modelVersions || []) {
      if (!latestVersionByProgram[v.program_id]) {
        latestVersionByProgram[v.program_id] = v.id;
      }
    }

    // Default model if program doesn't have one
    const defaultModel: HealthModel = {
      program_id: "default",
      weights_json: { actions: 30, sessions: 20, kpis: 30, checkins: 20 },
      thresholds_json: { thriving: 85, healthy: 70, stable: 50, at_risk: 30 },
    };

    // Alert configuration
    const alertConfig: AlertConfig = {
      pointsDropThreshold: 15,
      componentDropThreshold: 20,
    };

    let updatedCount = 0;
    let historyCount = 0;
    let alertsCreated = 0;

    for (const workspace of workspaces || []) {
      const model = modelsByProgram[workspace.program_id] || defaultModel;
      const weights = model.weights_json;
      const thresholds = model.thresholds_json;
      const modelVersionId = latestVersionByProgram[workspace.program_id] || null;
      const explanation: ExplanationFactor[] = [];

      // Get previous health snapshot for comparison
      const { data: prevSnapshot } = await supabase
        .from("workspace_health_history")
        .select("*")
        .eq("workspace_id", workspace.id)
        .order("computed_at", { ascending: false })
        .limit(1)
        .single();

      // Fetch all data in parallel
      const [
        actionsResult,
        sessionsResult,
        kpisResult,
        kpisLastMonthResult,
        checkinsResult,
        workspaceKpisResult,
      ] = await Promise.all([
        supabase
          .from("action_items")
          .select("id, status, due_date, created_at")
          .eq("workspace_id", workspace.id)
          .gte("created_at", new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()),
        supabase
          .from("sessions")
          .select("id, scheduled_at")
          .eq("workspace_id", workspace.id)
          .order("scheduled_at", { ascending: false })
          .limit(5),
        supabase
          .from("kpi_values")
          .select("id, kpi_definition_id, value")
          .eq("workspace_id", workspace.id)
          .eq("period_month", currentMonth),
        supabase
          .from("kpi_values")
          .select("id, kpi_definition_id, value")
          .eq("workspace_id", workspace.id)
          .eq("period_month", lastMonth),
        supabase
          .from("checkin_instances")
          .select("id, status, due_date, submitted_at")
          .eq("workspace_id", workspace.id)
          .gte("due_date", new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]),
        supabase
          .from("workspace_kpis")
          .select("kpi_definition_id")
          .eq("workspace_id", workspace.id)
          .eq("active", true),
      ]);

      // Calculate Actions Score (0-100)
      const actions = actionsResult.data || [];
      const totalActions = actions.length;
      const completedActions = actions.filter(a => a.status === "completed").length;
      const overdueActions = actions.filter(a => 
        a.status !== "completed" && 
        a.due_date && 
        new Date(a.due_date) < today
      ).length;

      let actionsScore = 100;
      if (totalActions > 0) {
        const completionRate = completedActions / totalActions;
        const overdueRate = overdueActions / totalActions;
        actionsScore = Math.max(0, Math.min(100, 
          completionRate * 80 + 20 - (overdueRate * 50)
        ));
      }

      explanation.push({
        factor: "Ações",
        score: Math.round(actionsScore),
        maxScore: 100,
        details: totalActions === 0 
          ? "Sem ações criadas" 
          : `${completedActions}/${totalActions} completas, ${overdueActions} em atraso`,
        impact: overdueActions > 2 ? "negative" : completedActions === totalActions ? "positive" : "neutral",
      });

      // Calculate Sessions Score (0-100)
      const sessions = sessionsResult.data || [];
      const pastSessions = sessions.filter(s => new Date(s.scheduled_at) < today);
      const futureSessions = sessions.filter(s => new Date(s.scheduled_at) >= today);

      let sessionsScore = 50;
      if (pastSessions.length > 0) {
        const lastSession = new Date(pastSessions[0].scheduled_at);
        const daysSince = Math.floor((today.getTime() - lastSession.getTime()) / (1000 * 60 * 60 * 24));
        
        if (daysSince <= 7) sessionsScore = 100;
        else if (daysSince <= 14) sessionsScore = 80;
        else if (daysSince <= 21) sessionsScore = 50;
        else if (daysSince <= 30) sessionsScore = 30;
        else sessionsScore = 10;
      } else {
        sessionsScore = 20;
      }

      if (futureSessions.length > 0) {
        sessionsScore = Math.min(100, sessionsScore + 10);
      }

      const daysSinceSession = pastSessions.length > 0 
        ? Math.floor((today.getTime() - new Date(pastSessions[0].scheduled_at).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      explanation.push({
        factor: "Sessões",
        score: Math.round(sessionsScore),
        maxScore: 100,
        details: daysSinceSession !== null 
          ? `Última sessão há ${daysSinceSession} dias` 
          : "Sem sessões registadas",
        impact: sessionsScore < 50 ? "negative" : sessionsScore >= 80 ? "positive" : "neutral",
      });

      // Calculate KPIs Score (0-100)
      const currentKpis = kpisResult.data || [];
      const expectedKpis = workspaceKpisResult.data || [];
      const expectedCount = expectedKpis.length;
      const filledCount = currentKpis.length;

      let kpisScore = 100;
      if (expectedCount > 0) {
        const fillRate = filledCount / expectedCount;
        kpisScore = fillRate * 100;
      }

      const lastMonthKpis = kpisLastMonthResult.data || [];
      if (currentKpis.length > 0 && lastMonthKpis.length > 0) {
        let improving = 0;
        let declining = 0;
        for (const current of currentKpis) {
          const last = lastMonthKpis.find(l => l.kpi_definition_id === current.kpi_definition_id);
          if (last && current.value !== null && last.value !== null) {
            if (current.value > last.value) improving++;
            else if (current.value < last.value) declining++;
          }
        }
        if (improving > declining) kpisScore = Math.min(100, kpisScore + 5);
        else if (declining > improving) kpisScore = Math.max(0, kpisScore - 5);
      }

      explanation.push({
        factor: "KPIs",
        score: Math.round(kpisScore),
        maxScore: 100,
        details: expectedCount === 0 
          ? "Sem KPIs configurados" 
          : `${filledCount}/${expectedCount} preenchidos este mês`,
        impact: kpisScore < 50 ? "negative" : kpisScore >= 80 ? "positive" : "neutral",
      });

      // Calculate Check-ins Score (0-100)
      const checkins = checkinsResult.data || [];
      const submittedOnTime = checkins.filter(c => 
        c.status === "submitted" && 
        c.submitted_at && 
        new Date(c.submitted_at) <= new Date(c.due_date + "T23:59:59")
      ).length;
      const totalCheckins = checkins.length;

      let checkinsScore = 100;
      if (totalCheckins > 0) {
        checkinsScore = (submittedOnTime / totalCheckins) * 100;
      }

      const overdueCheckins = checkins.filter(c => 
        c.status === "pending" && 
        new Date(c.due_date) < today
      ).length;

      explanation.push({
        factor: "Check-ins",
        score: Math.round(checkinsScore),
        maxScore: 100,
        details: totalCheckins === 0 
          ? "Sem check-ins configurados" 
          : `${submittedOnTime}/${totalCheckins} submetidos a tempo${overdueCheckins > 0 ? `, ${overdueCheckins} em atraso` : ""}`,
        impact: overdueCheckins > 0 ? "negative" : checkinsScore >= 80 ? "positive" : "neutral",
      });

      // Calculate weighted total score
      const totalWeight = weights.actions + weights.sessions + weights.kpis + weights.checkins;
      const weightedScore = (
        (actionsScore * weights.actions) +
        (sessionsScore * weights.sessions) +
        (kpisScore * weights.kpis) +
        (checkinsScore * weights.checkins)
      ) / totalWeight;

      const finalScore = Math.round(weightedScore);
      const healthLabel = getHealthLabel(finalScore, thresholds);

      const componentScores = {
        actions: Math.round(actionsScore),
        sessions: Math.round(sessionsScore),
        kpis: Math.round(kpisScore),
        checkins: Math.round(checkinsScore),
      };

      explanation.sort((a, b) => {
        const order = { negative: 0, neutral: 1, positive: 2 };
        return order[a.impact] - order[b.impact];
      });

      // Update workspace
      const { error: updateError } = await supabase
        .from("workspaces")
        .update({
          health_score_calculated: healthLabel,
          health_score_numeric: finalScore,
          health_score_updated_at: new Date().toISOString(),
          health_score_explanation: explanation,
          health_score_components: componentScores,
          health_score: healthLabel,
        })
        .eq("id", workspace.id)
        .is("health_score_override", null);

      await supabase
        .from("workspaces")
        .update({
          health_score_calculated: healthLabel,
          health_score_numeric: finalScore,
          health_score_updated_at: new Date().toISOString(),
          health_score_explanation: explanation,
          health_score_components: componentScores,
        })
        .eq("id", workspace.id)
        .not("health_score_override", "is", null);

      if (!updateError) {
        updatedCount++;
      } else {
        console.error(`[recompute-health-scores] Error updating workspace ${workspace.id}:`, updateError);
      }

      // Insert health history snapshot (max 1 per day)
      const { data: existingToday } = await supabase
        .from("workspace_health_history")
        .select("id")
        .eq("workspace_id", workspace.id)
        .gte("computed_at", todayStr + "T00:00:00Z")
        .lt("computed_at", todayStr + "T23:59:59Z")
        .limit(1);

      if (!existingToday || existingToday.length === 0) {
        const { error: historyError } = await supabase
          .from("workspace_health_history")
          .insert({
            workspace_id: workspace.id,
            score_numeric: finalScore,
            label: healthLabel,
            components_json: componentScores,
            explanation_json: explanation,
            model_version_id: modelVersionId,
          });

        if (!historyError) {
          historyCount++;
        } else {
          console.error(`[recompute-health-scores] Error inserting health history for ${workspace.id}:`, historyError);
        }
      }

      // Generate alerts based on comparison with previous snapshot
      if (prevSnapshot) {
        const prevScore = prevSnapshot.score_numeric;
        const prevLabel = prevSnapshot.label;
        const prevComponents = prevSnapshot.components_json as typeof componentScores;
        const scoreDelta = prevScore - finalScore;

        // Check for active snooze
        const { data: snoozedAlerts } = await supabase
          .from("workspace_health_alerts")
          .select("id")
          .eq("workspace_id", workspace.id)
          .eq("status", "snoozed")
          .gt("snoozed_until", new Date().toISOString())
          .limit(1);

        const isSnoozed = snoozedAlerts && snoozedAlerts.length > 0;

        if (!isSnoozed) {
          const startupName = (workspace as any).startup?.name || 'Unknown Startup';
          
          // Alert: drop to critical
          if (healthLabel === "critical" && prevLabel !== "critical") {
            const { data: alertRow } = await supabase.from("workspace_health_alerts").insert({
              workspace_id: workspace.id,
              alert_type: "drop_to_critical",
              severity: "critical",
              reason: `Health dropped to critical (${prevScore} → ${finalScore})`,
              evidence_json: {
                prev_score: prevScore,
                new_score: finalScore,
                prev_label: prevLabel,
                new_label: healthLabel,
                delta: scoreDelta,
              },
            }).select("id").single();
            alertsCreated++;
            
            // Send Teams notification for critical alerts
            sendTeamsHealthAlert(
              supabaseUrl,
              supabaseKey,
              workspace.id,
              startupName,
              'drop_to_critical',
              `Health dropped to critical (${prevScore} → ${finalScore})`,
              prevScore,
              finalScore
            ).catch(() => {}); // Non-blocking
          }
          // Alert: drop to at_risk
          else if (healthLabel === "at_risk" && prevLabel !== "at_risk" && prevLabel !== "critical") {
            await supabase.from("workspace_health_alerts").insert({
              workspace_id: workspace.id,
              alert_type: "drop_to_at_risk",
              severity: "warning",
              reason: `Health dropped to at risk (${prevScore} → ${finalScore})`,
              evidence_json: {
                prev_score: prevScore,
                new_score: finalScore,
                prev_label: prevLabel,
                new_label: healthLabel,
                delta: scoreDelta,
              },
            });
            alertsCreated++;
            
            // Send Teams notification for at_risk alerts
            sendTeamsHealthAlert(
              supabaseUrl,
              supabaseKey,
              workspace.id,
              startupName,
              'drop_to_at_risk',
              `Health dropped to at risk (${prevScore} → ${finalScore})`,
              prevScore,
              finalScore
            ).catch(() => {}); // Non-blocking
          }
          // Alert: significant points drop
          else if (scoreDelta >= alertConfig.pointsDropThreshold) {
            await supabase.from("workspace_health_alerts").insert({
              workspace_id: workspace.id,
              alert_type: "drop_points",
              severity: "warning",
              reason: `Health score dropped by ${scoreDelta} points`,
              evidence_json: {
                prev_score: prevScore,
                new_score: finalScore,
                delta: scoreDelta,
              },
            });
            alertsCreated++;
          }

          // Alert: component drop
          if (prevComponents) {
            for (const key of ["actions", "sessions", "kpis", "checkins"] as const) {
              const prevVal = prevComponents[key] || 0;
              const currVal = componentScores[key];
              const compDelta = prevVal - currVal;
              if (compDelta >= alertConfig.componentDropThreshold) {
                await supabase.from("workspace_health_alerts").insert({
                  workspace_id: workspace.id,
                  alert_type: "component_drop",
                  severity: "warning",
                  reason: `${key} score dropped by ${compDelta} points`,
                  evidence_json: {
                    component: key,
                    prev_value: prevVal,
                    new_value: currVal,
                    delta: compDelta,
                  },
                });
                alertsCreated++;
              }
            }
          }
        }
      }
    }

    console.log(`[recompute-health-scores] Complete: ${updatedCount} updated, ${historyCount} history entries, ${alertsCreated} alerts`);

    return new Response(
      JSON.stringify({
        success: true,
        updated: updatedCount,
        history_entries: historyCount,
        alerts_created: alertsCreated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const corsHeaders = getCorsHeaders(req);
    console.error("[recompute-health-scores] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
