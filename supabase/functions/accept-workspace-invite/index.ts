import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';

interface AcceptInviteRequest {
  token: string;
}

// Hash the token for lookup
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsOptions(req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Validate auth
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      console.error("No authorization header");
      return corsJsonResponse({ error: "Unauthorized: Please log in first" }, req, 401);
    }
    
    const authToken = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${authToken}` } }
    });
    
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(authToken);
    if (authError || !user) {
      console.error("Auth failed:", authError?.message);
      return corsJsonResponse({ error: "Unauthorized: Invalid session" }, req, 401);
    }
    
    const payload: AcceptInviteRequest = await req.json();
    
    if (!payload.token || typeof payload.token !== 'string' || payload.token.length !== 64) {
      return corsJsonResponse({ error: "Invalid invitation token" }, req, 400);
    }
    
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
    
    // Hash the token to look up the invitation
    const tokenHash = await hashToken(payload.token);
    
    // Find the invitation
    const { data: invitation, error: inviteError } = await supabaseService
      .from('workspace_invitations')
      .select('*')
      .eq('token_hash', tokenHash)
      .maybeSingle();
    
    if (inviteError) {
      console.error("Error looking up invitation:", inviteError);
      return corsJsonResponse({ error: "Failed to verify invitation" }, req, 500);
    }
    
    if (!invitation) {
      return corsJsonResponse({ error: "Invalid or expired invitation token" }, req, 404);
    }
    
    // Check if already accepted
    if (invitation.accepted_at) {
      return corsJsonResponse({ 
        error: "This invitation has already been accepted",
        workspaceId: invitation.workspace_id
      }, req, 400);
    }
    
    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return corsJsonResponse({ error: "This invitation has expired. Please request a new one." }, req, 400);
    }
    
    // Verify email matches (case-insensitive)
    if (invitation.email.toLowerCase() !== user.email?.toLowerCase()) {
      console.warn(`Email mismatch: invitation for ${invitation.email}, user is ${user.email}`);
      return corsJsonResponse({ 
        error: "This invitation is for a different account. Please sign in with the correct email."
      }, req, 403);
    }
    
    // Check if user already has access to this workspace
    const { data: existingAccess } = await supabaseService
      .from('workspace_users')
      .select('id')
      .eq('workspace_id', invitation.workspace_id)
      .eq('user_id', user.id)
      .maybeSingle();
    
    if (existingAccess) {
      // Update invitation as accepted
      await supabaseService
        .from('workspace_invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('id', invitation.id);
      
      return corsJsonResponse({ 
        success: true, 
        message: "You already have access to this workspace",
        workspaceId: invitation.workspace_id,
        alreadyMember: true
      }, req, 200);
    }
    
    // Create workspace_users record
    const { error: insertError } = await supabaseService
      .from('workspace_users')
      .insert({
        workspace_id: invitation.workspace_id,
        user_id: user.id,
        role: invitation.role || 'founder',
      });
    
    if (insertError) {
      console.error("Failed to add user to workspace:", insertError);
      return corsJsonResponse({ error: "Failed to add you to the workspace" }, req, 500);
    }
    
    // Add founder role to user_roles if not present
    const { data: existingRole } = await supabaseService
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'founder')
      .maybeSingle();
    
    if (!existingRole) {
      await supabaseService
        .from('user_roles')
        .insert({
          user_id: user.id,
          role: 'founder',
        });
    }
    
    // Mark invitation as accepted
    await supabaseService
      .from('workspace_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id);
    
    // Log activity
    await supabaseService
      .from('activity_log')
      .insert({
        user_id: user.id,
        workspace_id: invitation.workspace_id,
        entity_type: 'workspace_invitation',
        entity_id: invitation.id,
        action: 'accepted',
        metadata: { role: invitation.role }
      });
    
    console.log(`User ${user.id} accepted invitation and joined workspace ${invitation.workspace_id}`);
    
    return corsJsonResponse({ 
      success: true, 
      message: "Welcome! You've been added to the workspace.",
      workspaceId: invitation.workspace_id,
      startupId: invitation.startup_id,
      showOnboarding: true
    }, req, 200);
    
  } catch (err) {
    console.error("Error in accept-workspace-invite:", err);
    return corsJsonResponse({ error: "Internal server error" }, req, 500);
  }
});
