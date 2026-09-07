import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { throwToolError } from "../toolError";
import { enforceMcpRateLimit } from "../rateLimit";

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
    await enforceMcpRateLimit(supabase, "list_workspaces");
    // P3: apply the search server-side BEFORE the limit, otherwise a startup
    // outside the newest N rows is reported as non-existent.
    let query = supabase
      .from("workspaces")
      .select(
        "id, stage, health_score, priority_level, updated_at, startup:startups!inner(id, name), program:programs(id, name, program_type)",
      )
      .order("updated_at", { ascending: false });

    if (search) query = query.ilike("startup.name", `%${search}%`);

    const { data, error } = await query.limit(limit ?? 25);

    if (error) throwToolError("list_workspaces", error);

    const rows = data ?? [];

    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { workspaces: rows, count: rows.length },
    };
  },
});
