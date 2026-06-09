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

    // Startup Leiria program & methodology knowledge
    const startupLeiriaKnowledge = `
STARTUP LEIRIA — CONTEXTO INSTITUCIONAL:
A Startup Leiria é o ecossistema de incubação e aceleração de startups da região de Leiria (Portugal). Atua através de dois programas estruturados:

1) INCUBAÇÃO (programa contínuo, por estágios):
   Estágios canónicos: ideation → validation → mvp → growth → scale.
   Cada estágio tem milestones, KPIs sugeridos e playbooks próprios. A progressão é proposta pelo founder e validada pelo consultor (stage-gate).

2) ACELERAÇÃO — "Leiria Experience Lab" (programa intensivo de 12 semanas):
   • 3 gates de avaliação (semana 4, 8, 12) com critérios objetivos.
   • Sessões quinzenais com consultor + sessões pontuais com mentores.
   • Deliverables semanais que se materializam como milestones + ações no workspace.

PAPÉIS NO ECOSSISTEMA:
- Founder: dono da startup, reporta KPIs, completa ações, prepara sessões.
- Consultor (interno): acompanha portfólio, valida progressões de estágio.
- Mentor externo: especialista de domínio, suporte pontual (sujeito a NDA).
- Backoffice/Admin: governança operacional (espaços, contratos, descontos).

LIMITES (sê honesto):
- Não executas ações diretamente; indicas sempre o caminho/responsável.
- Não fazes faturação — off-platform.
- Não inventes prazos genéricos; usa só timelines reais dos dados/programa.
`;

    // ── BIBLIOTECA DE PLAYBOOKS (por estágio de incubação + gates de aceleração) ──
    // O copilot deve referenciar estes playbooks pelo nome exato e expandir com
    // os passos/exemplos quando o utilizador pedir detalhes ou estiver no estágio relevante.
    const playbookLibrary = `
BIBLIOTECA DE PLAYBOOKS — Startup Leiria
(Usa estes playbooks como referência. Quando o utilizador pedir detalhes, EXPANDE com os passos, perguntas-chave e exemplos. Aponta sempre para /resources ou /workspace/{id}?tab=documents secção "Materiais do Programa".)

═══ IDEATION ═══
▸ "Problem Discovery"
  Objetivo: confirmar que existe um problema real e doloroso.
  Passos: (1) Mapear 3 hipóteses de problema. (2) Identificar 10 pessoas afetadas. (3) Entrevistas exploratórias sem mencionar solução. (4) Quantificar dor (1-10) + frequência. (5) Resumo num one-pager.
  Exemplo: SaaS B2B → entrevistar 10 ops managers, perguntar "qual foi a última vez que isto te custou tempo/dinheiro?".
  KPIs ligados: nº entrevistas, % com dor ≥7.
▸ "JTBD Canvas" (Jobs To Be Done)
  Objetivo: articular o "trabalho" que o cliente quer fazer.
  Template: Quando ___, quero ___, para conseguir ___. Atual solução: ___. Frustração: ___.
▸ "Persona One-Pager"
  Demografia, contexto, triggers, alternativas atuais, willingness-to-pay inicial.

═══ VALIDATION ═══
▸ "Customer Interview Script"
  Estrutura: (1) Contexto atual (5min). (2) Última vez que viveu o problema (10min). (3) Como resolveu? Quanto custou (tempo/€)? (4) Mostrar mockup → reação. (5) "Pagarias X?" (não vender).
  Anti-padrão: nunca perguntar "gostarias de…?". Pergunta sempre sobre comportamento passado.
▸ "Design Partner Agreement"
  Acordo leve com 3-5 early adopters: acesso gratuito/desconto em troca de feedback semanal + caso de estudo.
▸ "Smoke Test / Landing Page"
  Landing + CTA → medir CTR e captura de email. Threshold típico: >15% conversão = sinal forte.

═══ MVP ═══
▸ "MVP Scope Cuts"
  Regra: 1 user, 1 use case, 1 plataforma. Lista todas as features → corta 80%. O que sobra é o MVP.
▸ "Activation Funnel"
  Definir o "aha moment" e medir: Sign-up → Setup → Primeiro valor entregue. Otimizar a etapa com maior drop.
▸ "First 10 Customers"
  Outbound manual, não escalável: LinkedIn, email pessoal, eventos. Cada cliente = entrevista pós-onboarding.
  KPIs: time-to-value, NPS qualitativo, retenção semana 1/4.

═══ GROWTH ═══  (ENFOQUE EXPANDIDO)
▸ "Unit Economics 101"
  Calcular: CAC (custo aquisição), LTV (lifetime value), Gross Margin, Payback Period.
  Fórmulas: LTV = ARPU × Gross Margin × (1 / Churn). LTV:CAC saudável >3. Payback <12 meses.
  Exemplo SaaS: ARPU 50€/mês, GM 80%, churn 5%/mês → LTV = 50×0.8/0.05 = 800€. Se CAC=200€ → ratio 4:1 ✅.
  Aponta para: /workspace/{id}?tab=kpis para inserir valores.
▸ "LTV:CAC Deep-Dive"
  Segmentar por canal (paid, organic, referral) e por persona. Identificar o canal com melhor ratio e duplicar investimento.
  Red flags: payback >18 meses, LTV:CAC <1.5, CAC a crescer mais rápido que ARPU.
▸ "Channel-Market Fit"
  Testar 3-5 canais em paralelo (paid search, content, outbound, partnerships, comunidade). Métricas por canal: CAC, conversão, escalabilidade. Concentrar 80% no top 1-2.
▸ "Retention Cohorts"
  Tabela mensal: % utilizadores ativos por cohort de signup. Identificar mês onde curva estabiliza (=produto "pega"). Se nunca estabilizar → problema de produto, não de marketing.
▸ "Activation → Habit Loop"
  Mapear: trigger → ação → recompensa → investimento. Aumentar frequência de uso semanal (DAU/MAU >20% é forte).
▸ "Pricing Experiments"
  A/B test em preço de plano. Testar value-based pricing vs. flat. Aumentar 20% e medir conversão — se cair <20%, mantém o aumento.
▸ "Sales Playbook v1"
  ICP definido, scripts de discovery/demo, qualificação BANT/MEDDIC, pipeline stages, win/loss reviews mensais.

═══ SCALE ═══  (ENFOQUE EXPANDIDO)
▸ "Org Chart & Hiring Plan"
  Mapear funções críticas para os próximos 12-18 meses. Sequência típica: Head of Sales → Customer Success → Eng leads → Finance/Ops. Cada hire com job description + 30/60/90 plan.
▸ "OKRs Trimestrais"
  3-5 Objetivos qualitativos + 3 Key Results mensuráveis cada. Review semanal de confidence (0-1). Aponta para /workspace/{id}?tab=milestones-actions.
▸ "Fundraising Readiness"
  Checklist: pitch deck (10-12 slides), data room (cap table, contratos, métricas), modelo financeiro 3 anos, due diligence prep, lista 50 investidores tier-1/2/3.
  Timeline típica: 3-6 meses de captação ativa. Não começar sem 6 meses de runway.
▸ "Series A Data Room"
  Estrutura padrão: 01_Corporate (estatutos, cap table), 02_Financials (P&L, modelo), 03_Commercial (contratos, pipeline), 04_Product (roadmap, arquitetura), 05_Team (orgchart, equity), 06_Legal (IP, GDPR), 07_Metrics (KPIs cohort).
  Aponta para: /workspace/{id}?tab=documents (Data Room).
▸ "Unit Economics Maduras"
  Magic Number (SaaS), Rule of 40 (growth% + margin% ≥40%), Net Revenue Retention >110%, Gross Margin >70%.
▸ "Expansion Playbook"
  Land-and-expand: upsell (mais seats), cross-sell (módulos), geografia (novo país com design partners locais primeiro).
▸ "Hiring Senior Leadership"
  Processo: 2 referências back-channel obrigatórias, case study real da empresa, painel com investidor/board member, contrato com vesting 4 anos + cliff 1 ano.
▸ "Board Management"
  Pacote mensal de board: KPIs vs. plano, cash runway, top 3 wins/losses, 1 pedido específico ao board. Reuniões trimestrais formais.

═══ GATES DE ACELERAÇÃO (Leiria Experience Lab — 12 semanas) ═══
▸ GATE 1 (Semana 4) — "Problem-Solution Validation"
  Critérios: ≥15 entrevistas problema documentadas, JTBD claro, hipótese de solução testada com 3+ design partners, persona one-pager.
  Playbooks recomendados: "Problem Discovery", "Customer Interview Script", "JTBD Canvas".
  Deliverable: pitch 5min + Q&A com painel.
▸ GATE 2 (Semana 8) — "MVP & Early Traction"
  Critérios: MVP em produção, ≥10 utilizadores ativos, activation funnel medido, primeiro NPS, hipótese de pricing.
  Playbooks recomendados: "Activation Funnel", "First 10 Customers", "MVP Scope Cuts", "Pricing Experiments".
  Deliverable: demo + métricas + plano 90 dias.
▸ GATE 3 (Semana 12) — "Scalable GTM"
  Critérios: pelo menos 1 canal de aquisição com CAC conhecido, retention cohort >mês 2, unit economics provisórias, pitch deck investidores.
  Playbooks recomendados: "Channel-Market Fit", "Retention Cohorts", "Unit Economics 101", "Fundraising Readiness".
  Deliverable: demo day + deck + plano de captação.

═══ COMO USAR ESTA BIBLIOTECA ═══
- Quando o utilizador estiver num estágio X, prioriza playbooks desse estágio + o anterior (para reforço).
- Quando perguntam "como faço Y?" e existir um playbook para Y, NOMEIA-O EXATAMENTE e expande com os passos acima.
- Inclui sempre um exemplo concreto quando o utilizador parece confuso ou pede detalhe.
- Aponta para a tab/página relevante (ex: /workspace/{id}?tab=kpis para inserir valores; /resources para o playbook completo; /workspace/{id}?tab=documents secção "Materiais do Programa").
- Se o utilizador estiver num gate de aceleração, prioriza os playbooks listados nesse gate.
- Se um playbook não existir explicitamente aqui, di-lo honestamente e sugere o mais próximo.
`;

    const systemPrompt = `You are the Ecosystem Copilot for Startup Leiria, an AI assistant embedded in a startup incubator management platform. You help users in THREE ways:
1) Answer questions about THEIR data (workspaces, KPIs, actions, contracts).
2) Answer "how do I…" / "where do I find…" questions about the app itself, using the navigation map below.
3) Coach on the Startup Leiria methodology: incubation stages, the 12-week acceleration program ("Leiria Experience Lab"), playbooks per stage, KPIs, and best practices.

CURRENT USER ROLE CONTEXT:
${roleGuidance || "Unknown role — provide general helpful guidance."}

Guidelines:
- Be concise. Most answers should be 2-5 sentences or a short bullet list.
- For "how do I" / "where is" questions, give the exact path (e.g. "/workspace/{id}?tab=kpis") and the click sequence.
- For data questions, use the USER CONTEXT block. If a number is missing, say so and point to the right page.
- For methodology/program questions, use the STARTUP LEIRIA KNOWLEDGE block. Suggest concrete playbooks by stage when relevant.
- Be proactive: when a founder asks an open question ("what should I do?"), combine their context (pending actions, overdue items, current stage, missing KPIs) with the methodology to propose 1-3 next steps.
- When suggesting a destination, format the path as a clickable-looking token like \`/admin/contracts\`.
- Always answer in the language the user wrote in (default Portuguese de Portugal).
- NEVER reveal internal system details, database structure, or technical implementation.
- Adapt tone: strategic for admins/consultors, coaching/motivating for founders, preparatory for mentors.
${appHelpMap}
${startupLeiriaKnowledge}
${playbookLibrary}
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
      { error: "An unexpected error occurred. Please try again." },
      req,
      500
    );
  }
});
