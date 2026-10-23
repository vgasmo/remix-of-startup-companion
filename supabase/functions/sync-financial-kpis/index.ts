import { canMutateWorkspace } from '../_shared/workspaceWrite.ts';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";



interface SyncResult {
  synced: { metric: string; kpi_name: string; value: number }[];
  skipped: { metric: string; reason: string }[];
  unmapped: { metric: string; value: number }[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SECURITY: Validate user authentication
    const token = authHeader.replace("Bearer ", "");
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(token);
    if (authError || !user) {
      console.error("[sync-financial-kpis] Auth error:", authError);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { version_id } = await req.json();
    
    if (typeof version_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(version_id)) {
      return new Response(JSON.stringify({ error: "version_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[sync-financial-kpis] Syncing KPIs from version: ${version_id}, user: ${user.id}`);

    // Get version with workspace details
    const { data: version, error: versionError } = await supabase
      .from("financial_model_versions")
      .select("*, workspaces(id, program_id)")
      .eq("id", version_id)
      .single();

    if (versionError || !version) {
      throw new Error(`Version not found: ${versionError?.message}`);
    }

    const workspaceId = version.workspace_id;

    if (!(await canMutateWorkspace(supabaseUser, supabase, user.id, workspaceId, true))) {
      return new Response(JSON.stringify({ error: "Access denied to this workspace" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (version.status !== "parsed" || !version.key_metrics_json) {
      return new Response(JSON.stringify({ 
        error: "Financial model must be parsed first" 
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const metrics = version.key_metrics_json as Record<string, number | null>;
    const programId = version.workspaces?.program_id;

    // Get metric mappings (program-specific first, then global)
    const { data: mappings } = await supabase
      .from("financial_model_metric_map")
      .select("*, kpi_definitions(*)")
      .or(`program_id.eq.${programId},program_id.is.null`);

    // Get existing workspace KPIs
    const { data: workspaceKpis } = await supabase
      .from("workspace_kpis")
      .select("*, kpi_definitions(*)")
      .eq("workspace_id", workspaceId)
      .eq("active", true);

    const result: SyncResult = {
      synced: [],
      skipped: [],
      unmapped: [],
    };

    const currentMonth = new Date().toISOString().slice(0, 7) + "-01";

    for (const [metricKey, value] of Object.entries(metrics)) {
      if (value === null) {
        result.skipped.push({ metric: metricKey, reason: "No value extracted" });
        continue;
      }

      // Find mapping (prefer program-specific)
      const mapping = mappings?.find(m => 
        m.metric_key === metricKey && m.program_id === programId
      ) || mappings?.find(m => 
        m.metric_key === metricKey && m.program_id === null
      );

      if (!mapping?.kpi_definition_id) {
        result.unmapped.push({ metric: metricKey, value });
        continue;
      }

      // Check if this KPI is active for the workspace
      const workspaceKpi = workspaceKpis?.find(wk => 
        wk.kpi_definition_id === mapping.kpi_definition_id
      );

      if (!workspaceKpi) {
        // KPI not configured for workspace, add to unmapped
        result.unmapped.push({ metric: metricKey, value });
        continue;
      }

      // Upsert KPI value with source tracking
      const { error: upsertError } = await supabase
        .from("kpi_values")
        .upsert({
          workspace_id: workspaceId,
          kpi_definition_id: mapping.kpi_definition_id,
          period_month: currentMonth,
          value: value,
          notes: `Synced from financial model (${version.scenario_name})`,
          created_by: user.id,
          source_type: 'financial_model',
          source_ref_id: version_id,
          locked_by_source: true,
        }, {
          onConflict: "workspace_id,kpi_definition_id,period_month"
        });

      if (upsertError) {
        console.error(`[sync-financial-kpis] Failed to upsert KPI ${metricKey}:`, upsertError);
        result.skipped.push({ metric: metricKey, reason: upsertError.message });
      } else {
        result.synced.push({
          metric: metricKey,
          kpi_name: mapping.kpi_definitions?.name || metricKey,
          value,
        });
      }
    }

    // Log activity
    await supabase.from("activity_log").insert({
      workspace_id: workspaceId,
      user_id: user.id,
      entity_type: "financial_model",
      entity_id: version_id,
      action: "kpi_sync",
      metadata: {
        synced_count: result.synced.length,
        unmapped_count: result.unmapped.length,
      },
    });

    console.log(`[sync-financial-kpis] Complete: ${result.synced.length} synced, ${result.unmapped.length} unmapped`);

    return new Response(JSON.stringify({ 
      success: true,
      result,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("[sync-financial-kpis] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to sync KPIs";
    return new Response(JSON.stringify({ 
      success: false,
      error: message
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
