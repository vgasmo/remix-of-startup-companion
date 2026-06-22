import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

interface WorkspaceInviteRequest {
  workspaceId: string;
  startupId?: string;
  email: string;
  role: string;
  includeBookingLink?: boolean;
  bookingToken?: string;
}

// Generate a secure random token
function generateToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Hash the token for storage
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// HTML escape function
function escapeHtml(text: string): string {
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return text.replace(/[&<>"']/g, (char) => htmlEntities[char] || char);
}

// Input validation
function validateInput(payload: WorkspaceInviteRequest): { valid: boolean; error?: string } {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!payload.workspaceId || !uuidRegex.test(payload.workspaceId)) {
    return { valid: false, error: "Invalid workspace ID" };
  }
  
  if (payload.startupId && !uuidRegex.test(payload.startupId)) {
    return { valid: false, error: "Invalid startup ID" };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!payload.email || !emailRegex.test(payload.email) || payload.email.length > 255) {
    return { valid: false, error: "Invalid email address" };
  }
  
  if (!payload.role || !['founder', 'team_member'].includes(payload.role)) {
    return { valid: false, error: "Invalid role" };
  }
  
  return { valid: true };
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
      return corsJsonResponse({ error: "Unauthorized" }, req, 401);
    }
    
    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !user) {
      console.error("Auth failed:", authError?.message);
      return corsJsonResponse({ error: "Unauthorized" }, req, 401);
    }
    
    const payload: WorkspaceInviteRequest = await req.json();
    
    // Validate input
    const validation = validateInput(payload);
    if (!validation.valid) {
      return corsJsonResponse({ error: validation.error }, req, 400);
    }
    
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check if user is admin or consultor
    const { data: userRoles, error: rolesError } = await supabaseService
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);
    
    if (rolesError) {
      console.error("Failed to fetch user roles:", rolesError);
      return corsJsonResponse({ error: "Failed to verify permissions" }, req, 500);
    }
    
    const roles = userRoles?.map(r => r.role) || [];
    if (!roles.includes('admin') && !roles.includes('consultor')) {
      return corsJsonResponse({ error: "Forbidden: Only staff can send invitations" }, req, 403);
    }
    
    // Get workspace and startup info
    const { data: workspace, error: wsError } = await supabaseService
      .from('workspaces')
      .select(`
        id,
        startup:startups(id, name, main_contact_email, main_contact_name)
      `)
      .eq('id', payload.workspaceId)
      .single();
    
    if (wsError || !workspace) {
      console.error("Workspace not found:", wsError);
      return corsJsonResponse({ error: "Workspace not found" }, req, 404);
    }
    
    const startup = workspace.startup as unknown as { id: string; name: string; main_contact_email: string | null; main_contact_name: string | null } | null;
    const startupName = startup?.name || 'Your Startup';
    
    // Check if invitation already exists
    const { data: existingInvite } = await supabaseService
      .from('workspace_invitations')
      .select('id, accepted_at')
      .eq('workspace_id', payload.workspaceId)
      .eq('email', payload.email.toLowerCase())
      .maybeSingle();
    
    // Generate token
    const rawToken = generateToken();
    const tokenHash = await hashToken(rawToken);
    
    if (existingInvite) {
      if (existingInvite.accepted_at) {
        return corsJsonResponse(
          { error: "This email has already accepted an invitation" },
          req, 400
        );
      }
      
      // Update existing invitation with new token
      const { error: updateError } = await supabaseService
        .from('workspace_invitations')
        .update({
          token_hash: tokenHash,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          created_by: user.id,
        })
        .eq('id', existingInvite.id);
      
      if (updateError) {
        console.error("Failed to update invitation:", updateError);
        return corsJsonResponse({ error: "Failed to update invitation" }, req, 500);
      }
    } else {
      // Create new invitation
      const { error: insertError } = await supabaseService
        .from('workspace_invitations')
        .insert({
          workspace_id: payload.workspaceId,
          startup_id: payload.startupId || startup?.id || null,
          email: payload.email.toLowerCase(),
          role: payload.role,
          token_hash: tokenHash,
          created_by: user.id,
        });
      
      if (insertError) {
        console.error("Failed to create invitation:", insertError);
        return corsJsonResponse({ error: "Failed to create invitation" }, req, 500);
      }
    }
    
    // Build invite URL
    const baseUrl = Deno.env.get("PUBLIC_APP_URL") || "https://fb.startupleiria.com";
    const inviteUrl = `${baseUrl}/accept-invite?token=${rawToken}`;
    
    // (Booking section is constructed below in a locale-aware block.)

    
    // Get sender profile
    const { data: senderProfile } = await supabaseService
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .single();

    const senderName = senderProfile?.full_name || 'Startup Leiria Team';

    // Resolve recipient locale (default PT)
    const { data: recipientProfile } = await supabaseService
      .from('profiles')
      .select('preferred_language')
      .eq('email', payload.email.toLowerCase())
      .maybeSingle();
    const locale: 'pt' | 'en' = (recipientProfile?.preferred_language as 'pt' | 'en') ?? 'pt';

    const strings = {
      pt: {
        subject: (n: string) => `Foi convidado para juntar-se a ${n} no Startup Leiria`,
        welcome: (n: string) => `🚀 Bem-vindo ao ${n}!`,
        invitedBy: (sender: string, n: string) => `Foi convidado por ${sender} para juntar-se ao workspace ${n} no Startup Leiria.`,
        founderIntro: 'Como founder, terá acesso a:',
        feat1: 'O dashboard do workspace da sua startup',
        feat2: 'Acompanhamento de KPIs e milestones',
        feat3: 'Agendamento de sessões com consultores',
        feat4: 'Documentos e recursos',
        accept: 'Aceitar Convite',
        bookTitle: '📅 Marque a sua primeira sessão',
        bookDesc: 'Agende a sua primeira reunião com o seu consultor para começar.',
        bookCta: 'Marcar Sessão',
        expiry: 'Este convite expira em 7 dias. Se não estava à espera deste email, pode ignorá-lo em segurança.',
        footer: 'Startup Leiria - A capacitar empreendedores',
      },
      en: {
        subject: (n: string) => `You're invited to join ${n} on Startup Leiria`,
        welcome: (n: string) => `🚀 Welcome to ${n}!`,
        invitedBy: (sender: string, n: string) => `You've been invited by ${sender} to join the ${n} workspace on Startup Leiria.`,
        founderIntro: "As a founder, you'll have access to:",
        feat1: "Your startup's workspace dashboard",
        feat2: 'KPI tracking and milestones',
        feat3: 'Session scheduling with consultants',
        feat4: 'Documents and resources',
        accept: 'Accept Invitation',
        bookTitle: '📅 Book Your First Session',
        bookDesc: 'Schedule your first meeting with your consultant to get started.',
        bookCta: 'Book a Session',
        expiry: "This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.",
        footer: 'Startup Leiria - Empowering entrepreneurs',
      },
    }[locale];

    // Send email
    const safeStartupName = escapeHtml(startupName);
    const safeSenderName = escapeHtml(senderName);

    // Build booking section (locale-aware)
    let localizedBookingSection = '';
    if (payload.includeBookingLink && payload.bookingToken) {
      const bookingUrl = `${baseUrl}/book/${payload.bookingToken}`;
      localizedBookingSection = `
        <div style="margin-top: 24px; padding: 16px; background: #f0f9ff; border-radius: 8px;">
          <p style="color: #0369a1; margin: 0 0 8px 0; font-weight: 500;">${strings.bookTitle}</p>
          <p style="color: #666; margin: 0 0 12px 0; font-size: 14px;">${strings.bookDesc}</p>
          <a href="${escapeHtml(bookingUrl)}" style="display: inline-block; background: #0ea5e9; color: white; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 500;">${strings.bookCta}</a>
        </div>
      `;
    }

    const emailResult = await resend.emails.send({
      from: "Startup Leiria <noreply@startupleiria.com>",
      to: [payload.email],
      subject: strings.subject(safeStartupName),
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 8px;">${strings.welcome(safeStartupName)}</h1>
          <p style="color: #666; margin-bottom: 24px;">${strings.invitedBy(safeSenderName, safeStartupName)}</p>

          <div style="background: #f8f9fa; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
            <p style="color: #666; margin: 0 0 16px 0;">
              ${strings.founderIntro}
            </p>
            <ul style="color: #666; margin: 0 0 16px 0; padding-left: 20px;">
              <li>${strings.feat1}</li>
              <li>${strings.feat2}</li>
              <li>${strings.feat3}</li>
              <li>${strings.feat4}</li>
            </ul>

            <a href="${escapeHtml(inviteUrl)}" style="display: inline-block; background: #7c3aed; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">${strings.accept}</a>
          </div>

          ${localizedBookingSection}

          <p style="color: #999; font-size: 12px; margin-top: 24px;">
            ${strings.expiry}
          </p>

          <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
          <p style="color: #999; font-size: 12px;">
            ${strings.footer}
          </p>
        </div>
      `,
    });

    
    console.log(`Invitation sent to ${payload.email} for workspace ${payload.workspaceId}`, emailResult);
    
    return corsJsonResponse({ 
      success: true, 
      message: `Invitation sent to ${payload.email}`,
      invitationId: existingInvite?.id || 'new'
    }, req);
    
  } catch (err) {
    console.error("Error in send-workspace-invite:", err);
    return corsJsonResponse({ error: "Internal server error" }, req, 500);
  }
});
