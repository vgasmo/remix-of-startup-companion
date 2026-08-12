import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_upcoming_sessions",
  title: "List upcoming sessions",
  description: "List upcoming sessions (meetings) in the workspaces the signed-in user can access.",
  inputSchema: {
    workspace_id: z.string().uuid().optional().describe("Restrict to a single workspace."),
    days_ahead: z.number().int().min(1).max(90).default(30).describe("How far ahead to look, in days."),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ workspace_id, days_ahead, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const now = new Date();
    const until = new Date(now.getTime() + (days_ahead ?? 30) * 86_400_000);

    let query = supabase
      .from("sessions")
      .select("id, workspace_id, title, scheduled_at, duration, status")
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", until.toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(limit ?? 25);

    if (workspace_id) query = query.eq("workspace_id", workspace_id);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { sessions: data ?? [], count: (data ?? []).length },
    };
  },
});
