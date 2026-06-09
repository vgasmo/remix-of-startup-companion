import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCorsOptions, corsJsonResponse } from "../_shared/cors.ts";
import { PLAYBOOK_CATALOG, type PlaybookKey } from "../_shared/playbook-catalog.ts";

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
    const dueOffsetDays = Number.isFinite(body.due_offset_days) ? body.due_offset_days : 14;

    if (!playbookKey || typeof playbookKey !== "string") {
      return corsJsonResponse({ error: "playbook_key is required" }, req, 400);
    }
    if (!workspaceId || typeof workspaceId !== "string") {
      return corsJsonResponse({ error: "workspace_id is required" }, req, 400);
    }

    const playbook = PLAYBOOK_CATALOG[playbookKey];
    if (!playbook) {
      return corsJsonResponse({ error: `Unknown playbook: ${playbookKey}` }, req, 404);
    }

    // RLS will gate writes via can_write_workspace; do a friendly preflight.
    const { data: access } = await supabase
      .from("workspace_users")
      .select("workspace_id, role")
      .eq("user_id", user.id)
      .eq("workspace_id", workspaceId)
      .eq("active", true)
      .maybeSingle();

    // Staff (admin/consultor/backoffice) can write all workspaces via RLS; only block clear non-members
    if (!access) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const isStaff = (roles || []).some((r: any) =>
        ["admin", "consultor", "backoffice"].includes(r.role)
      );
      if (!isStaff) {
        return corsJsonResponse({ error: "No access to this workspace" }, req, 403);
      }
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
      return corsJsonResponse(
        { error: msErr?.message || "Could not create milestone" },
        req,
        500
      );
    }

    const baseDate = new Date();
    const actionRows = playbook.actions.map((a, idx) => {
      const due = new Date(baseDate);
      due.setUTCDate(baseDate.getUTCDate() + (a.offset_days ?? dueOffsetDays));
      return {
        workspace_id: workspaceId,
        milestone_id: milestone.id,
        title: a.title,
        description: a.description ?? null,
        status: "pending" as const,
        priority: a.priority ?? "medium",
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
      await supabase.from("milestones").delete().eq("id", milestone.id);
      return corsJsonResponse({ error: aiErr.message }, req, 500);
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
    return corsJsonResponse({ error: e?.message || "Internal error" }, req, 500);
  }
});
