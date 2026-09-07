/**
 * P2.12: per-user rate limiting for MCP tools, reusing the same
 * check_ai_rate_limit primitive the AI edge functions use.
 *
 * Bundled into supabase/functions/mcp with type annotations stripped, so keep
 * this file free of exotic typing.
 */
import { throwToolError } from "./toolError";

const DEFAULT_MAX_REQUESTS = 60;

/* eslint-disable @typescript-eslint/no-explicit-any */
type MinimalClient = {
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null }; error: any }> };
  rpc: (fn: any, args?: any) => any;
};

/** Throws a generic tool error when the caller exceeded their hourly budget. */
export async function enforceMcpRateLimit(
  supabase: MinimalClient,
  toolName: string,
  maxRequests: number = DEFAULT_MAX_REQUESTS,
): Promise<void> {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) throwToolError(toolName, userError ?? new Error("no user"));

  const { data, error } = await supabase.rpc("check_ai_rate_limit", {
    _user_id: userData.user.id,
    _workspace_id: null,
    _function_name: `mcp_${toolName}`,
    _max_requests: maxRequests,
  });
  if (error) throwToolError(toolName, error);
  if (data !== true) {
    throw new Error(`Rate limit reached for ${toolName}. Try again later.`);
  }
}
