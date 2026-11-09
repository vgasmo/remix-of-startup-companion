import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { canMutateWorkspace } from '../_shared/workspaceWrite.ts';
import { validateUUID } from '../_shared/validation.ts';

/** Campos que o utilizador preenche à mão: uma regeneração nunca os apaga. */
const MANUAL_FIELDS = ['highlights', 'lowlights', 'asks', 'next_month_priorities'] as const;

interface GenerateRequest {
  workspace_id: string;
  month: string; // YYYY-MM-01
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsOptions(req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Auth check using anon client
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return corsJsonResponse({ error: "Unauthorized" }, req, 401);
    }

    // Use anon key client for auth verification
    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      console.error("Auth error:", authError);
      return corsJsonResponse({ error: "Unauthorized", details: authError?.message }, req, 401);
    }

    // Use service role client for data operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body: GenerateRequest = await req.json().catch(() => ({} as GenerateRequest));
    const wsCheck = validateUUID(body?.workspace_id, 'workspace_id');
    if (!wsCheck.valid) return corsJsonResponse({ error: wsCheck.error }, req, 400);
    const workspace_id = wsCheck.value!;
    if (typeof body.month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(body.month)) {
      return corsJsonResponse({ error: 'month must be YYYY-MM-DD' }, req, 400);
    }
    // O investor_updates é por mês: normalizar sempre para o dia 1.
    const month = `${body.month.slice(0, 7)}-01`;

    // SECURITY: gerar/regenerar ESCREVE em investor_updates. Tem de coincidir com a RLS
    // (can_write_workspace: admin, consultor, founder) + conta ativa. Mentores e
    // team_members têm só leitura (has_workspace_access não chega).
    const hasAccess = await canMutateWorkspace(authClient, supabase, user.id, workspace_id);

    if (!hasAccess) {
      console.error('[generate-investor-update] Access denied for user:', user.id, 'workspace:', workspace_id);
      return corsJsonResponse({ error: 'Access denied to this workspace' }, req, 403);
    }

    // RATE LIMITING: Check AI rate limit
    const { data: withinLimit } = await supabase.rpc('check_ai_rate_limit', {
      _user_id: user.id,
      _workspace_id: workspace_id,
      _function_name: 'generate-investor-update',
      _max_requests: 10
    });

    if (!withinLimit) {
      console.warn('[generate-investor-update] Rate limit exceeded for user:', user.id);
      return corsJsonResponse({ 
        error: 'Rate limit exceeded. You can generate up to 10 investor updates per hour. Please try again later.' 
      }, req, 429);
    }

    console.log(`Generating investor update for workspace ${workspace_id}, month ${month}`);

    // Get workspace info
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .select(`
        id, stage, health_score, health_score_numeric,
        startup:startups(name, description, website, logo_url),
        program:programs(name)
      `)
      .eq("id", workspace_id)
      .single();

    if (wsError || !workspace) {
      return corsJsonResponse({ error: "Workspace not found" }, req, 404);
    }

    const prevMonth = new Date(month);
    prevMonth.setMonth(prevMonth.getMonth() - 1);
    const prevMonthStr = prevMonth.toISOString().slice(0, 7) + "-01";

    // Get KPIs for current and previous month
    const { data: currentKpis } = await supabase
      .from("kpi_values")
      .select(`
        value, target_value, kpi_definition_id,
        kpi_definition:kpi_definitions(name, unit)
      `)
      .eq("workspace_id", workspace_id)
      .eq("period_month", month);

    const { data: prevKpis } = await supabase
      .from("kpi_values")
      .select(`value, kpi_definition_id`)
      .eq("workspace_id", workspace_id)
      .eq("period_month", prevMonthStr);

    const kpisSnapshot = (currentKpis || []).map((kpi: any) => {
      const prevKpi = prevKpis?.find((p: any) => p.kpi_definition_id === kpi.kpi_definition_id);
      const delta = prevKpi ? (kpi.value || 0) - (prevKpi.value || 0) : null;
      return {
        name: kpi.kpi_definition?.name || "KPI",
        value: kpi.value,
        target: kpi.target_value,
        unit: kpi.kpi_definition?.unit || "",
        delta,
      };
    });

    // Get milestones completed this month
    const monthStart = new Date(month);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const { data: completedMilestones } = await supabase
      .from("milestones")
      .select("title, completed_at")
      .eq("workspace_id", workspace_id)
      .eq("status", "completed")
      .gte("completed_at", monthStart.toISOString())
      .lt("completed_at", monthEnd.toISOString());

    // Get upcoming milestones
    const { data: upcomingMilestones } = await supabase
      .from("milestones")
      .select("title, target_date")
      .eq("workspace_id", workspace_id)
      .in("status", ["not_started", "in_progress"])
      .order("target_date", { ascending: true })
      .limit(5);

    // Get health explanation as risks
    const { data: healthData } = await supabase
      .from("workspaces")
      .select("health_score_explanation")
      .eq("id", workspace_id)
      .single();

    const risks = (healthData?.health_score_explanation as any[] || [])
      .filter((f: any) => f.impact === "negative")
      .map((f: any) => f.details);

    // Build content
    const content = {
      month,
      startup_name: (workspace.startup as any)?.name || "Startup",
      highlights: [], // To be filled by user
      lowlights: [], // To be filled by user
      kpis: kpisSnapshot,
      milestones_achieved: (completedMilestones || []).map((m: any) => m.title),
      next_milestones: (upcomingMilestones || []).map((m: any) => ({
        title: m.title,
        target_date: m.target_date,
      })),
      risks,
      asks: [], // To be filled by user
      next_month_priorities: [], // To be filled by user
      health_score: workspace.health_score_numeric,
      stage: workspace.stage,
    };

    // Regenerar não pode apagar o que o utilizador já escreveu à mão.
    const { data: existingUpdate, error: existingError } = await supabase
      .from("investor_updates")
      .select("content_json")
      .eq("workspace_id", workspace_id)
      .eq("month", month)
      .maybeSingle();
    if (existingError) throw existingError;
    const previous = (existingUpdate?.content_json ?? {}) as Record<string, unknown>;
    for (const field of MANUAL_FIELDS) {
      if (Array.isArray(previous[field]) && (previous[field] as unknown[]).length > 0) {
        (content as Record<string, unknown>)[field] = previous[field];
      }
    }

    // Upsert the investor update
    const { data: update, error: upsertError } = await supabase
      .from("investor_updates")
      .upsert({
        workspace_id,
        month,
        content_json: content,
        generated_by: user.id,
      }, { onConflict: "workspace_id,month" })
      .select()
      .single();

    if (upsertError) throw upsertError;

    // Log activity
    await supabase.from("activity_log").insert({
      workspace_id,
      user_id: user.id,
      entity_type: "investor_update",
      entity_id: update.id,
      action: "generated",
      metadata: { month },
    });

    console.log(`Investor update generated: ${update.id}`);

    return corsJsonResponse({ success: true, update }, req, 200);
  } catch (error: unknown) {
    console.error("Error in generate-investor-update:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return corsJsonResponse({ error: message }, req, 500);
  }
});
