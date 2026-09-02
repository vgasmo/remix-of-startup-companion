/**
 * P-round hardening: never return raw PostgREST/Postgres messages to an MCP
 * client. Raw errors leak whether a given UUID exists (an existence oracle for
 * other tenants' rows). Log the detail server-side, throw a generic message.
 *
 * Note: this file is bundled into supabase/functions/mcp with type annotations
 * stripped, so it must not rely on literal/`as const` return types.
 */
export function throwToolError(tool: string, error: unknown): never {
  const detail = error && typeof error === 'object' && 'message' in error
    ? String((error as { message?: unknown }).message)
    : String(error);
  console.error(JSON.stringify({ level: 'error', event: 'mcp_tool_error', tool, detail }));
  throw new Error(`The ${tool} tool could not complete the request.`);
}
