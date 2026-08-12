import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_workspaces",
  title: "List workspaces",
  description:
    "List the startup workspaces the signed-in user can access, with stage, health score and program.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(25).describe("Maximum workspaces to return."),
    search: z.string().trim().optional().describe("Optional startup name filter."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, search }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("workspaces")
      .select(
        "id, stage, health_score, priority_level, updated_at, startup:startups(id, name), program:programs(id, name, program_type)",
      )
      .order("updated_at", { ascending: false })
      .limit(limit ?? 25);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const needle = search?.toLowerCase();
    const rows = (data ?? []).filter((row: any) =>
      !needle || (row.startup?.name ?? "").toLowerCase().includes(needle),
    );

    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { workspaces: rows, count: rows.length },
    };
  },
});
