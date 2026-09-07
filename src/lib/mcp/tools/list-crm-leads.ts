import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";
import { throwToolError } from "../toolError";
import { enforceMcpRateLimit } from "../rateLimit";

export default defineTool({
  name: "list_crm_leads",
  title: "List CRM leads",
  description:
    "List CRM pipeline leads (funnel items) the signed-in user can access, newest first. Optionally filter by stage or organisation name.",
  inputSchema: {
    stage: z.string().trim().optional().describe("Funnel stage key to filter by."),
    search: z.string().trim().optional().describe("Organisation name filter."),
    limit: z.number().int().min(1).max(100).default(25),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ stage, search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    await enforceMcpRateLimit(supabase, "list_crm_leads");
    let query = supabase
      .from("funnel_items")
      .select("id, organization_name, stage, owner_consultant_id, last_activity_at, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);

    if (stage) query = query.eq("stage", stage);
    if (search) query = query.ilike("organization_name", `%${search}%`);

    const { data, error } = await query;
    if (error) throwToolError("list_crm_leads", error);
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { leads: data ?? [], count: (data ?? []).length },
    };
  },
});
