import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';

interface AcceptInviteRequest {
  token: string;
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return corsJsonResponse({ error: "Unauthorized: Please log in first" }, req, 401);
    }

    // Use the caller's JWT so accept_workspace_invitation() runs against the
    // real auth.uid() — the RPC is SECURITY DEFINER but validates email match
    // and permissions using auth.uid(); we never call it as service_role.
    const authToken = authHeader.replace("Bearer ", "");
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${authToken}` } },
    });

    const { data: userRes, error: authError } = await supabase.auth.getUser(authToken);
    if (authError || !userRes?.user) {
      return corsJsonResponse({ error: "Unauthorized: Invalid session" }, req, 401);
    }

    const payload: AcceptInviteRequest = await req.json();
    if (!payload.token || typeof payload.token !== 'string' || payload.token.length !== 64) {
      return corsJsonResponse({ error: "Invalid invitation token" }, req, 400);
    }

    const tokenHash = await hashToken(payload.token);

    // Single atomic RPC. Raises typed errors; we translate them to HTTP codes.
    const { data, error } = await supabase.rpc('accept_workspace_invitation', {
      p_token_hash: tokenHash,
    });

    if (error) {
      const code = error.message || '';
      if (code.includes('invitation_not_found')) {
        return corsJsonResponse({ error: "Invalid or expired invitation token" }, req, 404);
      }
      if (code.includes('invitation_expired')) {
        return corsJsonResponse({ error: "This invitation has expired. Please request a new one." }, req, 400);
      }
      if (code.includes('invitation_email_mismatch')) {
        return corsJsonResponse({
          error: "This invitation is for a different account. Please sign in with the correct email.",
        }, req, 403);
      }
      if (code.includes('auth_required')) {
        return corsJsonResponse({ error: "Unauthorized" }, req, 401);
      }
      console.error("accept_workspace_invitation error:", error);
      return corsJsonResponse({ error: "Failed to accept invitation" }, req, 500);
    }

    const result = (data ?? {}) as {
      success?: boolean;
      already_accepted?: boolean;
      workspace_id?: string;
      startup_id?: string | null;
      role?: string;
    };

    return corsJsonResponse({
      success: true,
      alreadyMember: !!result.already_accepted,
      workspaceId: result.workspace_id,
      startupId: result.startup_id ?? null,
      showOnboarding: !result.already_accepted,
      message: result.already_accepted
        ? "You already have access to this workspace"
        : "Welcome! You've been added to the workspace.",
    }, req, 200);
  } catch (err) {
    console.error("Error in accept-workspace-invite:", err);
    return corsJsonResponse({ error: "Internal server error" }, req, 500);
  }
});
