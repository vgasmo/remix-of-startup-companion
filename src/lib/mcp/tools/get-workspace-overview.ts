import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { throwToolError } from "../toolError";
import { enforceMcpRateLimit } from "../rateLimit";

export default defineTool({
  name: "get_workspace_overview",
  title: "Get workspace overview",
  description:
    "Get one workspace with its startup, program, milestones and open action items. Use list_workspaces to find the id.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace id."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    await enforceMcpRateLimit(supabase, "get_workspace_overview");

    const [workspace, milestones, actions] = await Promise.all([
      supabase
        .from("workspaces")
        .select(
          "id, stage, health_score, health_notes, priority_level, current_week, updated_at, startup:startups(id, name, description, website), program:programs(id, name, program_type)",
        )
        .eq("id", workspace_id)
        .maybeSingle(),
      supabase
        .from("milestones")
        .select("id, title, status, target_date, position")
        .eq("workspace_id", workspace_id)
        .order("position", { ascending: true }),
      supabase
        .from("action_items")
        .select("id, title, status, priority, due_date")
        .eq("workspace_id", workspace_id)
        .neq("status", "completed")
        .order("due_date", { ascending: true, nullsFirst: false })
        .limit(50),
    ]);

    const failure = workspace.error ?? milestones.error ?? actions.error;
    if (failure) throwToolError("get_workspace_overview", failure);
    if (!workspace.data) {
      return { content: [{ type: "text", text: "Workspace not found or not accessible" }], isError: true };
    }

    const payload = {
      workspace: workspace.data,
      milestones: milestones.data ?? [],
      open_actions: actions.data ?? [],
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
