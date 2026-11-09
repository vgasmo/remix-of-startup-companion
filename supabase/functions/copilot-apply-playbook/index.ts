import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCorsOptions, corsJsonResponse } from "../_shared/cors.ts";
import { PLAYBOOK_CATALOG, type PlaybookKey } from "../_shared/playbook-catalog.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  try {
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
      return corsJsonResponse({ error: "Invalid token" }, req, 401);
    }

    const body = await req.json().catch(() => ({}));
    const playbookKey = body.playbook_key as PlaybookKey;
    const workspaceId = body.workspace_id as string;
    const dueOffsetDays = Number.isInteger(body.due_offset_days) && body.due_offset_days >= 0 && body.due_offset_days <= 365
      ? body.due_offset_days
      : 14;

    if (!playbookKey || typeof playbookKey !== "string") {
      return corsJsonResponse({ error: "playbook_key is required" }, req, 400);
    }
    if (!workspaceId || typeof workspaceId !== "string" || !UUID_RE.test(workspaceId)) {
      return corsJsonResponse({ error: "workspace_id must be a UUID" }, req, 400);
    }

    if (!Object.prototype.hasOwnProperty.call(PLAYBOOK_CATALOG, playbookKey)) {
      return corsJsonResponse({ error: "Unknown playbook" }, req, 404);
    }
    const playbook = PLAYBOOK_CATALOG[playbookKey];

    // Pré-verificação com o MESMO predicado do RLS de milestones/action_items (can_write_workspace):
    // evita o 500 com mensagem de RLS para team_member/backoffice (membros ou staff sem escrita).
    const { data: canWrite, error: canWriteErr } = await supabase.rpc("can_write_workspace", {
      _workspace_id: workspaceId,
    });
    if (canWriteErr) {
      console.error("can_write_workspace failed:", canWriteErr.message);
      return corsJsonResponse({ error: "Could not verify workspace access" }, req, 500);
    }
    if (canWrite !== true) {
      return corsJsonResponse({ error: "Sem permissão de escrita neste workspace." }, req, 403);
    }

    // Idempotência: o mesmo playbook não se aplica duas vezes ao mesmo workspace
    // (índice único action_items_workspace_source_deliverable_uniq).
    const { data: alreadyApplied } = await supabase
      .from("action_items")
      .select("id")
      .eq("workspace_id", workspaceId)
      .like("source_deliverable_key", `playbook:${playbookKey}:%`)
      .limit(1);
    if (alreadyApplied && alreadyApplied.length > 0) {
      return corsJsonResponse({ error: "Este playbook já foi aplicado a este workspace.", code: "ALREADY_APPLIED" }, req, 409);
    }

    // Compute milestone target_date based on max action offset
    const maxOffset = Math.max(
      dueOffsetDays,
      ...playbook.actions.map((a) => a.offset_days ?? dueOffsetDays)
    );
    const target = new Date();
    target.setUTCDate(target.getUTCDate() + maxOffset);

    const { data: milestone, error: msErr } = await supabase
      .from("milestones")
      .insert({
        workspace_id: workspaceId,
        title: playbook.milestone_title,
        description: `${playbook.description}\n\n_Gerado a partir do playbook "${playbook.name}" pelo Copilot._`,
        status: "not_started",
        target_date: target.toISOString().slice(0, 10),
        created_by: user.id,
      })
      .select("id, title")
      .single();

    if (msErr || !milestone) {
      console.error("milestone insert failed:", msErr?.message);
      const denied = msErr?.code === "42501";
      return corsJsonResponse(
        { error: denied ? "Sem permissão de escrita neste workspace." : "Could not create milestone" },
        req,
        denied ? 403 : 500
      );
    }

    const baseDate = new Date();
    const actionRows = playbook.actions.map((a, idx) => {
      const action = a as { title: string; offset_days?: number; priority?: string; description?: string };
      const due = new Date(baseDate);
      due.setUTCDate(baseDate.getUTCDate() + (action.offset_days ?? dueOffsetDays));
      return {
        workspace_id: workspaceId,
        milestone_id: milestone.id,
        title: action.title,
        description: action.description ?? null,
        status: "pending" as const,
        priority: action.priority ?? "medium",
        due_date: due.toISOString().slice(0, 10),
        created_by: user.id,
        source_deliverable_key: `playbook:${playbookKey}:${idx}`,
      };
    });


    const { data: actions, error: aiErr } = await supabase
      .from("action_items")
      .insert(actionRows)
      .select("id, title");

    if (aiErr) {
      console.error("action_items insert failed:", aiErr.message);
      // Roll back milestone to avoid orphan
      const { error: rollbackErr } = await supabase.from("milestones").delete().eq("id", milestone.id);
      if (rollbackErr) console.error("milestone rollback failed:", milestone.id, rollbackErr.message);
      if (aiErr.code === "23505") {
        return corsJsonResponse({ error: "Este playbook já foi aplicado a este workspace.", code: "ALREADY_APPLIED" }, req, 409);
      }
      return corsJsonResponse({ error: "Could not create playbook actions" }, req, 500);
    }

    return corsJsonResponse(
      {
        ok: true,
        milestone,
        actions_created: actions?.length ?? 0,
        playbook: { key: playbookKey, name: playbook.name },
      },
      req,
      200
    );
  } catch (e: any) {
    console.error("copilot-apply-playbook error:", e?.message);
    return corsJsonResponse({ error: "Internal error" }, req, 500);
  }
});
