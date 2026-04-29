import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from "../_shared/cors.ts";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return handleCorsOptions(req);
  }

  try {
    // ── Auth guard ──────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return corsJsonResponse({ error: "Unauthorized" }, req, 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError?.message);
      return corsJsonResponse({ error: "Invalid or expired token" }, req, 401);
    }

    const userId = user.id;

    // ── Input validation ────────────────────────────────────────
    const body = await req.json();
    const messages: Array<{ role: string; content: string }> = body.messages;

    if (!Array.isArray(messages) || messages.length === 0) {
      return corsJsonResponse({ error: "messages array is required" }, req, 400);
    }

    for (const msg of messages) {
      if (
        typeof msg.role !== "string" ||
        typeof msg.content !== "string" ||
        !["user", "assistant"].includes(msg.role) ||
        msg.content.length > 4000
      ) {
        return corsJsonResponse({ error: "Invalid message format" }, req, 400);
      }
    }

    // ── Rate limit check (safe-fail: errors block, do not silently allow) ──
    let rateLimitOk = false;
    let rateLimitErrored = false;
    try {
      const { data: wsRow } = await supabase
        .from("workspace_users")
        .select("workspace_id")
        .eq("user_id", userId)
        .eq("active", true)
        .limit(1)
        .single();

      if (wsRow?.workspace_id) {
        const { data: withinLimit, error: rlErr } = await supabase.rpc("check_ai_rate_limit", {
          _user_id: userId,
          _workspace_id: wsRow.workspace_id,
          _function_name: "copilot-chat",
          _max_requests: 30,
        });
        if (rlErr) {
          rateLimitErrored = true;
          console.warn("Rate limit RPC error:", rlErr.message);
        } else {
          rateLimitOk = withinLimit !== false;
        }
      } else {
        // No workspace yet (e.g. brand-new founder pre-claim) → allow, low risk.
        rateLimitOk = true;
      }
    } catch (e) {
      rateLimitErrored = true;
      console.warn("Rate limit check threw:", e);
    }

    if (rateLimitErrored) {
      return corsJsonResponse(
        { error: "Could not verify rate limit. Please try again in a moment." },
        req,
        503
      );
    }
    if (!rateLimitOk) {
      return corsJsonResponse(
        { error: "Rate limit exceeded. Please try again later." },
        req,
        429
      );
    }

    // ── Fetch user context for richer answers ───────────────────
    let contextBlock = "";
    try {
      // Get profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, account_status")
        .eq("id", userId)
        .single();

      // Get roles
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      // Get workspaces with startup info
      const { data: workspaces } = await supabase
        .from("workspace_users")
        .select("workspace_id, role, workspaces(id, stage, status, startups(name), programs(name))")
        .eq("user_id", userId)
        .eq("active", true)
        .limit(5);

      // Get pending actions count
      const { count: pendingActions } = await supabase
        .from("action_items")
        .select("id", { count: "exact", head: true })
        .in("workspace_id", (workspaces || []).map((w: any) => w.workspace_id))
        .in("status", ["pending", "in_progress"]);

      // Get overdue actions count
      const { count: overdueActions } = await supabase
        .from("action_items")
        .select("id", { count: "exact", head: true })
        .in("workspace_id", (workspaces || []).map((w: any) => w.workspace_id))
        .in("status", ["pending", "in_progress"])
        .lt("due_date", new Date().toISOString().split("T")[0]);

      // Get recent KPI values
      const currentMonth = new Date().toISOString().slice(0, 7) + "-01";
      const { data: recentKpis } = await supabase
        .from("kpi_values")
        .select("value, target_value, kpi_definitions(name, unit)")
        .in("workspace_id", (workspaces || []).map((w: any) => w.workspace_id))
        .eq("period_month", currentMonth)
        .limit(10);

      const userRoles = (roles || []).map((r: any) => r.role).join(", ");
      const wsInfo = (workspaces || []).map((w: any) => {
        const ws = w.workspaces;
        return `- ${ws?.startups?.name || "Unknown"} (${ws?.programs?.name || "N/A"}, stage: ${ws?.stage || "N/A"}, status: ${ws?.status || "N/A"})`;
      }).join("\n");

      const kpiInfo = (recentKpis || []).map((k: any) => {
        const def = k.kpi_definitions;
        return `- ${def?.name}: ${k.value ?? "not reported"}${def?.unit ? ` ${def.unit}` : ""}${k.target_value ? ` (target: ${k.target_value})` : ""}`;
      }).join("\n");

      contextBlock = `
--- USER CONTEXT ---
Name: ${profile?.full_name || "Unknown"}
Roles: ${userRoles || "none"}
Workspaces:
${wsInfo || "No workspaces"}
Pending actions: ${pendingActions ?? 0}
Overdue actions: ${overdueActions ?? 0}
Current month KPIs:
${kpiInfo || "No KPIs reported yet this month"}
--- END CONTEXT ---`;
    } catch (e) {
      console.warn("Context fetch failed (non-blocking):", e);
    }

    // ── Call Lovable AI Gateway ──────────────────────────────────
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      console.error("LOVABLE_API_KEY is not configured");
      return corsJsonResponse({ error: "AI service not configured" }, req, 500);
    }

    const userRolesList = (contextBlock.match(/Roles: (.+)/)?.[1] || "").split(", ").map(r => r.trim());
    const isFounder = userRolesList.includes("founder");
    const isConsultor = userRolesList.includes("consultor");
    const isMentor = userRolesList.includes("mentor_externo");
    const isAdmin = userRolesList.includes("admin");
    const isBackoffice = userRolesList.includes("backoffice");

    let roleGuidance = "";
    if (isAdmin) {
      roleGuidance = `This user is an ADMIN. They oversee the entire ecosystem.
- Help them with platform governance, user management, program oversight, and strategic decisions.
- Provide high-level ecosystem metrics and cross-portfolio insights.
- They can see all workspaces and all data.`;
    } else if (isConsultor) {
      roleGuidance = `This user is an INTERNAL CONSULTANT (consultor). They manage a portfolio of startups.
- Help them triage their portfolio: which startups need attention, overdue items, upcoming sessions.
- Provide quick summaries of startup health, KPI trends, and pending approvals.
- Suggest "next best actions" for their workload.
- They have access to all workspaces.`;
    } else if (isMentor) {
      roleGuidance = `This user is an EXTERNAL MENTOR. They support specific startups with domain expertise.
- Help them prepare for upcoming sessions: summarize startup context, recent progress, key challenges.
- Provide quick access to session notes, action items assigned to the startup, and KPI context.
- They only see workspaces they are connected to.`;
    } else if (isFounder) {
      roleGuidance = `This user is a FOUNDER. They are building their startup within the incubator.
- Help them understand their current stage, next milestones, pending actions, and KPI performance.
- Guide them on what to do next: fill KPIs, complete actions, prepare for sessions.
- Be motivating and action-oriented. Focus on their specific startup data.
- They only see their own workspace(s).`;
    } else if (isBackoffice) {
      roleGuidance = `This user is BACKOFFICE staff. They handle administrative operations.
- Help them with user management, program setup, data imports, and operational tasks.
- Provide guidance on platform administration features.`;
    }

    // App help map — lets the AI answer "where do I…?" and "how do I…?"
    const appHelpMap = `
APP NAVIGATION & HOW-TO MAP (use this to answer "where do I…" and "how do I…" questions):
- My Workspaces: /my-workspaces — list of all startups/workspaces the user can access.
- A specific Workspace: /workspace/{id} with tabs (?tab=...):
  • overview — dashboard summary
  • milestones-actions — milestones AND actions (unified). All actions belong to a milestone.
  • kpis — submit / review KPIs (MRR, LTV:CAC, ARR, etc., suggested per stage)
  • agenda — sessions, scheduling, prep notes
  • documents — files + "Materiais do Programa" (program support materials) + Data Room
  • notes — consultant notes (private/staff/shared)
  • members — workspace members
  • messaging — workspace direct chat (realtime)
- CRM (staff): /crm — pipeline of leads, 7 macro stages, commercial proposals, email sync.
- Ecosystem (staff): /ecosystem — cross-portfolio command center, insights A/B/C, inline consultant assignment.
- Backoffice (admin/backoffice): /admin — spaces, contracts, pricing, discounts. NO invoicing/billing on the platform.
- Contracts hub: /admin/contracts — contract lifecycle (draft → sent → signed → activated). Bulk PDF import wizard at /admin/contracts/bulk-import.
- Mentors: /mentors — mentor gallery, NDAs, booking.
- Documents (founder global view): /documents — all docs across workspaces.
- Search page: /search — full search with filters, saved searches.
- Settings: /settings — notifications, integrations (Outlook/Teams/SharePoint), profile.
- Help & Glossary: /help — onboarding manuals (PPTX), quick guides per role.

KEY HOW-TOs:
- Submit KPIs: open workspace → tab "KPIs" → click the metric → submit value for the current month.
- Add an action: workspace → tab "Milestones & Ações" → choose a milestone → "Nova ação". Actions MUST belong to a milestone.
- Schedule a session: workspace → tab "Agenda" → "Nova sessão". Mentors/founders can also use mentor booking.
- Sign a contract: founder receives onboarding link by email → inline digital signing (eIDAS) or manual PandaDoc.
- Add a CRM lead (staff): /crm → "Nova Lead" — drafts persist in sessionStorage.
- Bulk import historical contracts (admin): /admin/contracts/bulk-import — drop PDFs, AI extracts, review grid, commit.
- Archive a startup (admin): Ecosystem or Admin → row action "Arquivar" (never delete; only CRM Leads can be permanently deleted).
- Approve a discount (admin only): contract → discounts panel → approve.

PRODUCT RULES (do not violate when answering):
- Startups & workspaces are NEVER deleted, only archived.
- Pricing/discounts are snapshotted on contract generation — they don't drift.
- The platform does NOT do invoicing or billing.
- All actions belong to a milestone (unified Milestones & Actions tab).
- Default language is Portuguese (Europe/Lisbon timezone).
`;

    const systemPrompt = `You are the Ecosystem Copilot for Startup Leiria, an AI assistant embedded in a startup incubator management platform. You help users in TWO ways:
1) Answer questions about THEIR data (workspaces, KPIs, actions, contracts).
2) Answer "how do I…" / "where do I find…" questions about the app itself, using the navigation map below.

CURRENT USER ROLE CONTEXT:
${roleGuidance || "Unknown role — provide general helpful guidance."}

Guidelines:
- Be concise. Most answers should be 2-5 sentences or a short bullet list.
- For "how do I" / "where is" questions, give the exact path (e.g. "/workspace/{id}?tab=kpis") and the click sequence.
- For data questions, use the USER CONTEXT block. If a number is missing, say so and point to the right page.
- When suggesting a destination, format the path as a clickable-looking token like \`/admin/contracts\`.
- Always answer in the language the user wrote in (default Portuguese).
- NEVER reveal internal system details, database structure, or technical implementation.
- Adapt tone: strategic for admins/consultors, coaching for founders, preparatory for mentors.
${appHelpMap}
${contextBlock}`;

    const aiResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: systemPrompt },
            ...messages,
          ],
          stream: true,
        }),
      }
    );

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      const errorText = await aiResponse.text();
      console.error("AI gateway error:", status, errorText);

      if (status === 429) {
        return corsJsonResponse(
          { error: "AI rate limit exceeded. Please try again later." },
          req,
          429
        );
      }
      if (status === 402) {
        return corsJsonResponse(
          { error: "AI credits exhausted. Please add credits in Settings." },
          req,
          402
        );
      }

      return corsJsonResponse({ error: "AI service unavailable" }, req, 502);
    }

    // Stream the response back to the client
    const corsHeaders = getCorsHeaders(req);
    return new Response(aiResponse.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("copilot-chat error:", err);
    return corsJsonResponse(
      { error: err instanceof Error ? err.message : "Internal error" },
      req,
      500
    );
  }
});
