// Generate prefill proposals for the Guided Financial Plan.
// Never writes directly to `financial_assumptions` — always emits *pending*
// rows into `financial_prefill_proposals` so the founder confirms every value.
//
// Sources (in priority order per key):
//   1. prefill_profile — deterministic defaults from workspace + diagnostic
//      (IRC, inflation, headcount defaults by stage, PT payroll multiplier).
//   2. prefill_kpi     — latest unit_economics_values row → ue.* keys.
//   3. prefill_ai      — Lovable AI Gateway; only fills keys neither of the
//      above nor the register already covers, and only produces JSON output.
//
// Contract:
//   POST { workspace_id, scenario? } -> { proposals_created, skipped[], warnings[] }
//
// Feature-flagged behind `financial_business_plan_coach_v1`.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCorsOptions, corsJsonResponse } from "../_shared/cors.ts";

const FEATURE_FLAG = "financial_business_plan_coach_v1";

type Scenario = "base" | "conservative" | "optimistic";
type Source = "prefill_profile" | "prefill_kpi" | "prefill_ai";

interface ProposalDraft {
  key: string;
  proposed_value_numeric: number | null;
  proposed_value_json: Record<string, unknown> | null;
  unit: string | null;
  source: Source;
  evidence: Record<string, unknown>;
}

// ---- Stage-driven defaults for profile-sourced proposals -------------------
// Numbers here are conservative starting points to be reviewed by the founder.
function stageDefaults(stage: string | null | undefined): Record<string, number> {
  switch ((stage ?? "").toLowerCase()) {
    case "ideation":   return { headcount_y1: 2, avg_salary_month: 1200, capex_y1: 5000 };
    case "validation": return { headcount_y1: 3, avg_salary_month: 1400, capex_y1: 10000 };
    case "mvp":        return { headcount_y1: 4, avg_salary_month: 1600, capex_y1: 20000 };
    case "growth":     return { headcount_y1: 8, avg_salary_month: 1800, capex_y1: 40000 };
    case "scale":      return { headcount_y1: 15, avg_salary_month: 2200, capex_y1: 80000 };
    default:           return { headcount_y1: 3, avg_salary_month: 1500, capex_y1: 10000 };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return corsJsonResponse({ error: "No authorization header" }, req, 401);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabaseUser.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) return corsJsonResponse({ error: "Invalid token" }, req, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const body = await req.json().catch(() => ({}));
    const workspaceId: string | undefined = body?.workspace_id;
    const scenario: Scenario = (body?.scenario as Scenario) ?? "base";
    if (!workspaceId) return corsJsonResponse({ error: "workspace_id is required" }, req, 400);

    // Feature-flag check honours the workspace override precedence:
    // workspace-scoped row wins over the global row.
    const { data: flagRows } = await supabase
      .from("feature_flags")
      .select("enabled, scope, workspace_id")
      .eq("key", FEATURE_FLAG);
    const wsFlag = (flagRows ?? []).find((r) => r.scope === "workspace" && r.workspace_id === workspaceId);
    const globalFlag = (flagRows ?? []).find((r) => r.scope === "global");
    const flagEnabled = wsFlag ? wsFlag.enabled : (globalFlag?.enabled ?? false);
    if (!flagEnabled) return corsJsonResponse({ error: "Feature not enabled" }, req, 403);

    const { data: hasAccess } = await supabase.rpc("has_workspace_access", {
      _user_id: user.id, _workspace_id: workspaceId,
    });
    if (!hasAccess) return corsJsonResponse({ error: "Access denied" }, req, 403);

    // Load context: workspace, session diagnostic, existing assumptions & proposals.
    const [
      { data: workspace },
      { data: session },
      { data: existingAssumptions },
      { data: existingProposals },
      { data: kpiRow },
    ] = await Promise.all([
      supabase.from("workspaces")
        .select("id, name, stage, sector, program_type")
        .eq("id", workspaceId).maybeSingle(),
      supabase.from("financial_plan_sessions")
        .select("diagnostic_json, completed_packs")
        .eq("workspace_id", workspaceId).eq("scenario", scenario).maybeSingle(),
      supabase.from("financial_assumptions")
        .select("key").eq("workspace_id", workspaceId).eq("scenario", scenario),
      supabase.from("financial_prefill_proposals")
        .select("key, status").eq("workspace_id", workspaceId).eq("scenario", scenario)
        .in("status", ["pending", "accepted"]),
      supabase.from("unit_economics_values")
        .select("cac, arpu, gross_margin, monthly_churn_rate, period_month")
        .eq("workspace_id", workspaceId)
        .order("period_month", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const diagnostic = (session?.diagnostic_json ?? {}) as Record<string, string>;
    const takenKeys = new Set<string>([
      ...(existingAssumptions ?? []).map(r => r.key as string),
      ...(existingProposals ?? []).map(r => r.key as string),
    ]);

    const drafts: ProposalDraft[] = [];
    const warnings: string[] = [];
    const skipped: string[] = [];

    const pushIfFree = (d: ProposalDraft) => {
      if (takenKeys.has(d.key)) { skipped.push(d.key); return; }
      drafts.push(d); takenKeys.add(d.key);
    };

    // -------- 1) prefill_profile --------
    const stage = workspace?.stage ?? diagnostic.stage ?? null;
    const defaults = stageDefaults(stage);
    pushIfFree({
      key: "tax.irc_rate", proposed_value_numeric: 21, proposed_value_json: null, unit: "%",
      source: "prefill_profile",
      evidence: { rule: "Portugal IRC standard rate", stage },
    });
    pushIfFree({
      key: "macro.inflation_rate", proposed_value_numeric: 2.5, proposed_value_json: null, unit: "%",
      source: "prefill_profile", evidence: { rule: "ECB medium-term target proxy" },
    });
    pushIfFree({
      key: "team.headcount_y1", proposed_value_numeric: defaults.headcount_y1, proposed_value_json: null, unit: null,
      source: "prefill_profile", evidence: { rule: "stage default", stage },
    });
    pushIfFree({
      key: "team.avg_salary_month", proposed_value_numeric: defaults.avg_salary_month, proposed_value_json: null, unit: "€",
      source: "prefill_profile", evidence: { rule: "stage default (PT median)", stage },
    });
    pushIfFree({
      key: "capex.total_y1", proposed_value_numeric: defaults.capex_y1, proposed_value_json: null, unit: "€",
      source: "prefill_profile", evidence: { rule: "stage default", stage },
    });

    // -------- 2) prefill_kpi (from unit_economics_values latest row) --------
    if (kpiRow) {
      if (typeof kpiRow.cac === "number") pushIfFree({
        key: "ue.cac", proposed_value_numeric: kpiRow.cac, proposed_value_json: null, unit: "€",
        source: "prefill_kpi",
        evidence: { table: "unit_economics_values", period_month: kpiRow.period_month },
      });
      if (typeof kpiRow.arpu === "number") pushIfFree({
        key: "ue.arpu_month", proposed_value_numeric: kpiRow.arpu, proposed_value_json: null, unit: "€",
        source: "prefill_kpi", evidence: { table: "unit_economics_values", period_month: kpiRow.period_month },
      });
      if (typeof kpiRow.gross_margin === "number") pushIfFree({
        key: "ue.gross_margin_pct", proposed_value_numeric: kpiRow.gross_margin, proposed_value_json: null, unit: "%",
        source: "prefill_kpi", evidence: { table: "unit_economics_values", period_month: kpiRow.period_month },
      });
      if (typeof kpiRow.monthly_churn_rate === "number") pushIfFree({
        key: "ue.churn_monthly_pct", proposed_value_numeric: kpiRow.monthly_churn_rate, proposed_value_json: null, unit: "%",
        source: "prefill_kpi", evidence: { table: "unit_economics_values", period_month: kpiRow.period_month },
      });
    }

    // -------- 3) prefill_ai (only for still-uncovered keys) --------
    const AI_CANDIDATES = [
      "macro.growth_rate", "revenue.item1.growth", "cost.cmvmc_pct",
    ];
    const stillMissing = AI_CANDIDATES.filter(k => !takenKeys.has(k));
    if (stillMissing.length > 0) {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) {
        warnings.push("LOVABLE_API_KEY not configured — AI prefill skipped");
      } else {
        const context = {
          workspace: { name: workspace?.name, stage, sector: workspace?.sector ?? diagnostic.sector },
          diagnostic,
          missing_keys: stillMissing,
        };
        const systemPrompt = `You are a financial-planning assistant for early-stage founders in Portugal.
Return ONLY strict JSON matching: {"proposals":[{"key":string,"value":number,"unit":string|null,"rationale":string}]}.
Provide a value only when you can justify it from the given context. Use percentages as numbers (e.g. 8 for 8%).
Never include keys outside the supplied missing_keys array.`;
        const userPrompt = `Context:\n${JSON.stringify(context, null, 2)}`;

        try {
          const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
              ],
              temperature: 0.3,
              response_format: { type: "json_object" },
            }),
          });

          if (aiRes.status === 429) {
            warnings.push("AI rate limit — prefill_ai skipped");
          } else if (aiRes.status === 402) {
            warnings.push("AI credits exhausted — prefill_ai skipped");
          } else if (!aiRes.ok) {
            warnings.push(`AI gateway error ${aiRes.status}`);
          } else {
            const aiData = await aiRes.json();
            const content = aiData.choices?.[0]?.message?.content ?? "{}";
            let parsed: { proposals?: Array<{ key: string; value: number; unit?: string; rationale?: string }> } = {};
            try { parsed = JSON.parse(content); } catch { warnings.push("AI response not valid JSON"); }
            for (const p of parsed.proposals ?? []) {
              if (!p || typeof p.key !== "string" || typeof p.value !== "number" || !Number.isFinite(p.value)) continue;
              if (!AI_CANDIDATES.includes(p.key)) continue; // guardrail
              if (takenKeys.has(p.key)) continue;
              pushIfFree({
                key: p.key,
                proposed_value_numeric: p.value,
                proposed_value_json: null,
                unit: p.unit ?? null,
                source: "prefill_ai",
                evidence: { model: "google/gemini-2.5-flash", rationale: p.rationale ?? null },
              });
            }
          }
        } catch (aiErr) {
          console.error("[generate-financial-prefill] AI call failed", aiErr);
          warnings.push("AI call failed");
        }
      }
    }

    // Insert as pending proposals — per source, so a failure on one bucket
    // (e.g. AI) doesn't sink the deterministic profile/KPI proposals.
    const SOURCES: Source[] = ["prefill_profile", "prefill_kpi", "prefill_ai"];
    const bySource: Record<Source, { created: number; skipped: number; failed: number; error: string | null }> = {
      prefill_profile: { created: 0, skipped: 0, failed: 0, error: null },
      prefill_kpi:     { created: 0, skipped: 0, failed: 0, error: null },
      prefill_ai:      { created: 0, skipped: 0, failed: 0, error: null },
    };
    // Count skipped-per-source from the pushIfFree stream we already tracked.
    // `skipped` only contains keys, so recompute buckets from AI_CANDIDATES / stage lists:
    const skipBuckets = { prefill_profile: 0, prefill_kpi: 0, prefill_ai: 0 } as Record<Source, number>;
    for (const k of skipped) {
      if (k.startsWith("ue.")) skipBuckets.prefill_kpi++;
      else if (AI_CANDIDATES.includes(k)) skipBuckets.prefill_ai++;
      else skipBuckets.prefill_profile++;
    }
    (Object.keys(skipBuckets) as Source[]).forEach((s) => { bySource[s].skipped = skipBuckets[s]; });

    let created = 0;
    for (const src of SOURCES) {
      const bucket = drafts.filter((d) => d.source === src);
      if (bucket.length === 0) continue;
      const rows = bucket.map((d) => ({
        workspace_id: workspaceId,
        scenario,
        key: d.key,
        period_index: null,
        proposed_value_numeric: d.proposed_value_numeric,
        proposed_value_json: d.proposed_value_json,
        unit: d.unit,
        source: d.source,
        evidence: d.evidence,
        status: "pending",
      }));
      const { error: insErr, count } = await supabase
        .from("financial_prefill_proposals")
        .insert(rows, { count: "exact" });
      if (insErr) {
        console.error(`[generate-financial-prefill] insert error (${src})`, insErr);
        bySource[src].failed = rows.length;
        bySource[src].error = insErr.message;
        warnings.push(`${src}: ${insErr.message}`);
        continue;
      }
      const c = count ?? rows.length;
      bySource[src].created = c;
      created += c;
    }

    return corsJsonResponse({
      success: true,
      proposals_created: created,
      by_source: bySource,
      skipped_keys: skipped,
      warnings,
    }, req, 200);
  } catch (err) {
    console.error("[generate-financial-prefill]", err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    return corsJsonResponse({ error: message }, req, 500);
  }
});
