import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireCronOrStaff } from "../_shared/security.ts";
import { getCorsHeaders, handleCorsOptions } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsOptions(req);
  }

  try {
    const corsHeaders = getCorsHeaders(req);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
    });

    // Auth gate: require cron secret or authenticated staff user
    const authResult = await requireCronOrStaff(req, supabaseUser, supabase);
    if ("error" in authResult) return authResult.error;

    console.log("Starting work queue recomputation...");

    const today = new Date();
    const currentMonth = today.toISOString().slice(0, 7) + "-01";

    // Get all active workspaces with assignments
    const { data: workspaces, error: wsError } = await supabase
      .from("workspaces")
      .select(`
        id, 
        program_id, 
        stage,
        startup:startups(name),
        workspace_assignments(assigned_user_id, role)
      `)
      .eq("status", "active");

    if (wsError) throw wsError;

    let createdCount = 0;
    let updatedCount = 0;

    // Helper: upsert work queue item handling partial unique index
    // The table has a partial unique index on (workspace_id, type) WHERE status IN ('open', 'in_progress')
    // Standard upsert doesn't work with partial indexes, so we check-then-insert/update
    async function upsertWorkQueueItem(item: Record<string, unknown>) {
      const { data: existing } = await supabase
        .from("staff_work_queue_items")
        .select("id")
        .eq("workspace_id", item.workspace_id as string)
        .eq("type", item.type as string)
        .in("status", ["open", "in_progress"])
        .limit(1);

      if (existing && existing.length > 0) {
        const { error } = await supabase
          .from("staff_work_queue_items")
          .update(item)
          .eq("id", existing[0].id);
        return !error;
      } else {
        const { error } = await supabase
          .from("staff_work_queue_items")
          .insert(item);
        if (error) {
          console.error("Insert work queue item error:", error.message, JSON.stringify(item));
        }
        return !error;
      }
    }

    for (const workspace of workspaces || []) {
      const startupName = (workspace.startup as any)?.name || "Workspace";
      const leadConsultant = (workspace.workspace_assignments as any[])?.find(
        (a: any) => a.role === "lead_consultant"
      )?.assigned_user_id;

      // Check for missing KPIs this month
      const { data: expectedKpis } = await supabase
        .from("workspace_kpis")
        .select("kpi_definition_id")
        .eq("workspace_id", workspace.id)
        .eq("active", true);

      const { data: filledKpis } = await supabase
        .from("kpi_values")
        .select("kpi_definition_id")
        .eq("workspace_id", workspace.id)
        .eq("period_month", currentMonth);

      const expectedCount = expectedKpis?.length || 0;
      const filledCount = filledKpis?.length || 0;
      const missingKpis = expectedCount - filledCount;

      if (missingKpis > 0) {
        const ok = await upsertWorkQueueItem({
          workspace_id: workspace.id,
          type: "missing_kpis",
          title: `${startupName}: ${missingKpis} KPIs em falta`,
          description: `${filledCount}/${expectedCount} KPIs preenchidos este mês`,
          priority: missingKpis > 3 ? "high" : "medium",
          due_at: new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString(),
          status: "open",
          assigned_to: leadConsultant,
          evidence_json: { expected: expectedCount, filled: filledCount, missing: missingKpis },
        });
        if (ok) createdCount++;
      }

      // Check for overdue actions
      const { data: overdueActions } = await supabase
        .from("action_items")
        .select("id")
        .eq("workspace_id", workspace.id)
        .in("status", ["pending", "in_progress"])
        .lt("due_date", today.toISOString().split("T")[0]);

      const overdueCount = overdueActions?.length || 0;
      if (overdueCount >= 3) {
        const ok = await upsertWorkQueueItem({
          workspace_id: workspace.id,
          type: "overdue_actions",
          title: `${startupName}: ${overdueCount} ações em atraso`,
          description: `Startup tem ${overdueCount} ações passadas do prazo`,
          priority: overdueCount >= 5 ? "urgent" : "high",
          due_at: today.toISOString(),
          status: "open",
          assigned_to: leadConsultant,
          evidence_json: { overdue_count: overdueCount },
        });
        if (ok) createdCount++;
      }

      // Check for no recent sessions
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      const { data: recentSessions } = await supabase
        .from("sessions")
        .select("id")
        .eq("workspace_id", workspace.id)
        .gte("scheduled_at", thirtyDaysAgo.toISOString())
        .limit(1);

      if (!recentSessions || recentSessions.length === 0) {
        const ok = await upsertWorkQueueItem({
          workspace_id: workspace.id,
          type: "schedule_session",
          title: `${startupName}: Sem sessão há 30+ dias`,
          description: "Agendar sessão de acompanhamento",
          priority: "high",
          due_at: new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          status: "open",
          assigned_to: leadConsultant,
          evidence_json: { last_session_check: thirtyDaysAgo.toISOString() },
        });
        if (ok) createdCount++;
      }

      // Check for overdue check-ins
      const { data: overdueCheckins } = await supabase
        .from("checkin_instances")
        .select("id")
        .eq("workspace_id", workspace.id)
        .eq("status", "pending")
        .lt("due_date", today.toISOString().split("T")[0]);

      if (overdueCheckins && overdueCheckins.length > 0) {
        const ok = await upsertWorkQueueItem({
          workspace_id: workspace.id,
          type: "outreach",
          title: `${startupName}: Check-in em atraso`,
          description: `${overdueCheckins.length} check-in(s) por submeter`,
          priority: "medium",
          due_at: today.toISOString(),
          status: "open",
          assigned_to: leadConsultant,
          evidence_json: { overdue_checkins: overdueCheckins.length },
        });
        if (ok) createdCount++;
      }

      // Founder actions awaiting validation by staff
      const { data: awaitingValidation } = await supabase
        .from("action_items")
        .select("id")
        .eq("workspace_id", workspace.id)
        .eq("status", "awaiting_validation");

      if (awaitingValidation && awaitingValidation.length > 0) {
        const ok = await upsertWorkQueueItem({
          workspace_id: workspace.id,
          type: "validate_actions",
          title: `${startupName}: ${awaitingValidation.length} ${awaitingValidation.length === 1 ? "ação para validar" : "ações para validar"}`,
          description: "Founder marcou como concluído. Aguarda a sua validação.",
          priority: "high",
          due_at: new Date(today.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          status: "open",
          assigned_to: leadConsultant,
          evidence_json: { count: awaitingValidation.length },
        });
        if (ok) createdCount++;
      }

      // Submitted but unreviewed check-ins
      const { data: unreviewedCheckins } = await supabase
        .from("checkin_instances")
        .select("id")
        .eq("workspace_id", workspace.id)
        .eq("status", "submitted")
        .is("reviewed_at", null);

      if (unreviewedCheckins && unreviewedCheckins.length > 0) {
        const ok = await upsertWorkQueueItem({
          workspace_id: workspace.id,
          type: "review_checkin",
          title: `${startupName}: Check-in por rever`,
          description: `${unreviewedCheckins.length} check-in(s) submetido(s) a aguardar revisão`,
          priority: "medium",
          due_at: new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          status: "open",
          assigned_to: leadConsultant,
          evidence_json: { count: unreviewedCheckins.length },
        });
        if (ok) createdCount++;
      }


      // Update health confidence
      let confidence = "high";
      let reason = "Dados completos";

      if (expectedCount === 0) {
        confidence = "low";
        reason = "Sem KPIs configurados";
      } else if (missingKpis > expectedCount / 2) {
        confidence = "low";
        reason = "Menos de 50% dos KPIs preenchidos";
      } else if (missingKpis > 0) {
        confidence = "medium";
        reason = `${missingKpis} KPIs em falta`;
      }

      await supabase
        .from("workspaces")
        .update({ health_confidence: confidence, health_confidence_reason: reason })
        .eq("id", workspace.id);

      updatedCount++;
    }

    // Resolve items that are no longer relevant (open items older than 14 days)
    const { error: resolveError } = await supabase
      .from("staff_work_queue_items")
      .update({ status: "done" })
      .eq("status", "open")
      .lt("due_at", new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString());

    console.log(`Work queue recomputed: ${createdCount} items created/updated, ${updatedCount} workspaces processed`);

    return new Response(
      JSON.stringify({ success: true, createdItems: createdCount, updatedWorkspaces: updatedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const corsHeaders = getCorsHeaders(req);
    console.error("Error in recompute-work-queue:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
