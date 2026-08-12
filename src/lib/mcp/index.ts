import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listWorkspacesTool from "./tools/list-workspaces";
import getWorkspaceOverviewTool from "./tools/get-workspace-overview";
import listActionItemsTool from "./tools/list-action-items";
import createActionItemTool from "./tools/create-action-item";
import listUpcomingSessionsTool from "./tools/list-upcoming-sessions";
import listCrmLeadsTool from "./tools/list-crm-leads";

// Issuer must be the direct Supabase host, built from the project ref (inlined
// by Vite at build time so the module stays import-safe).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "remix-of-startup-companion",
  title: "Remix of Startup Companion",
  version: "0.1.0",
  instructions:
    "Tools for the Startup Leiria companion platform. Read startup workspaces, milestones, action items, upcoming sessions and CRM leads, and create action items inside a milestone. All data is scoped to the signed-in user's permissions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listWorkspacesTool,
    getWorkspaceOverviewTool,
    listActionItemsTool,
    createActionItemTool,
    listUpcomingSessionsTool,
    listCrmLeadsTool,
  ],
});
