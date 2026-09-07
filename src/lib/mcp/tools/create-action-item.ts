import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { throwToolError } from "../toolError";
import { enforceMcpRateLimit } from "../rateLimit";

export default defineTool({
  name: "create_action_item",
  title: "Create action item",
  description:
    "Create an action item inside a milestone of a workspace. Every action must belong to a milestone — use get_workspace_overview to pick one.",
  inputSchema: {
    workspace_id: z.string().uuid().describe("Workspace the action belongs to."),
    milestone_id: z.string().uuid().describe("Milestone the action belongs to."),
    title: z.string().trim().min(1).max(200).describe("Short action title."),
    description: z.string().trim().max(2000).optional(),
    due_date: z.string().trim().optional().describe("Due date as YYYY-MM-DD."),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ workspace_id, milestone_id, title, description, due_date, priority }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    await enforceMcpRateLimit(supabase, "create_action_item");
    // P0.2 defence in depth: the milestone MUST belong to the same workspace.
    const { data: ms, error: msError } = await supabase
      .from("milestones")
      .select("id")
      .eq("id", milestone_id)
      .eq("workspace_id", workspace_id)
      .maybeSingle();
    if (msError) throwToolError("create_action_item", msError);
    if (!ms) {
      return {
        content: [{ type: "text", text: "Milestone does not belong to this workspace" }],
        isError: true,
      };
    }
    const { data, error } = await supabase
      .from("action_items")
      .insert({
        workspace_id,
        milestone_id,
        title,
        description: description ?? null,
        due_date: due_date ?? null,
        priority: priority ?? "medium",
        status: "pending",
        created_by: ctx.getUserId(),
      })
      .select("id, workspace_id, milestone_id, title, status, priority, due_date")
      .maybeSingle();

    if (error) throwToolError("create_action_item", error);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { action_item: data },
    };
  },
});
