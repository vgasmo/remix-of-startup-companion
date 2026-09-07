import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { throwToolError } from "../toolError";
import { enforceMcpRateLimit } from "../rateLimit";

export default defineTool({
  name: "list_action_items",
  title: "List action items",
  description:
    "List action items across accessible workspaces. Optionally filter by workspace, status, or only overdue items.",
  inputSchema: {
    workspace_id: z.string().uuid().optional().describe("Restrict to a single workspace."),
    status: z
      .enum(["pending", "in_progress", "awaiting_validation", "completed", "cancelled"])
      .optional()
      .describe("Filter by action status."),
    only_overdue: z.boolean().default(false).describe("Only items past their due date and not completed."),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, status, only_overdue, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    await enforceMcpRateLimit(supabase, "list_action_items");
    let query = supabase
      .from("action_items")
      .select("id, workspace_id, title, description, status, priority, due_date, created_at")
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(limit ?? 25);

    if (workspace_id) query = query.eq("workspace_id", workspace_id);
    if (status) query = query.eq("status", status);
    if (only_overdue) {
      query = query
        .lt("due_date", new Date().toISOString().slice(0, 10))
        .not("status", "in", "(completed,cancelled)");
    }

    const { data, error } = await query;
    if (error) throwToolError("list_action_items", error);

    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { action_items: data ?? [], count: (data ?? []).length },
    };
  },
});
