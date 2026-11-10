import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { isAccountActive } from '../_shared/security.ts';

interface SyncRequest {
  funnel_item_id?: string;
  workspace_id?: string;
  consultant_user_id?: string; // Optional - will resolve via intake routing if not provided
  lookback_days?: number;
  max_messages?: number;
  dry_run?: boolean; // If true, only count potential emails, don't insert
}

interface SyncResult {
  inserted: number;
  skipped: number;
  errors: string[];
  mailbox: string;
  dry_run?: boolean;
  would_insert?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // SECURITY: Validate authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return corsJsonResponse({ error: 'Authorization required' }, req, 401);
    }

    // SECURITY: Validate token and get user
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      console.error('[sync-graph-email-history] Auth error:', authError);
      return corsJsonResponse({ error: 'Unauthorized' }, req, 401);
    }

    // Service client for privileged operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user is staff
    const { data: roles, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isStaff = roles?.some((r) => r.role === 'admin' || r.role === 'consultor');
    if (roleError || !isStaff) {
      return corsJsonResponse({ error: 'Forbidden: Staff only' }, req, 403);
    }
    if (!(await isAccountActive(supabase, user.id))) {
      return corsJsonResponse({ error: 'Account access denied' }, req, 403);
    }

    // Check feature flag
    const { data: flag } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('key', 'crm_graph_email_sync')
      .is('program_id', null)
      .single();

    if (!flag?.enabled) {
      return corsJsonResponse({ error: 'Feature disabled' }, req, 403);
    }

    const body: SyncRequest = await req.json();
    const { funnel_item_id, workspace_id, dry_run = false } = body;
    let { consultant_user_id } = body;
    // RC11: um consultor so sincroniza a propria mailbox; so o admin escolhe outra. Limites numericos validados.
    const callerIsAdmin = roles?.some((r) => r.role === 'admin') ?? false;
    if (consultant_user_id && consultant_user_id !== user.id && !callerIsAdmin) {
      return corsJsonResponse({ error: 'Forbidden: consultant_user_id must be the caller' }, req, 403);
    }
    if (!consultant_user_id && !callerIsAdmin) consultant_user_id = user.id;
    const lookback_days = Math.min(Math.max(Math.trunc(Number(body.lookback_days ?? 90)) || 90, 1), 365);
    const max_messages = Math.min(Math.max(Math.trunc(Number(body.max_messages ?? 200)) || 200, 1), 500);

    if (!funnel_item_id && !workspace_id) {
      return corsJsonResponse({ error: 'funnel_item_id or workspace_id required' }, req, 400);
    }

    // Security: consultors may only sync CRM records/workspaces they are responsible for.
    if (!callerIsAdmin) {
      const consultantOwnsWorkspace = async (wsId: string): Promise<boolean> => {
        const { data: ws, error: wsErr } = await supabase
          .from('workspaces').select('assigned_consultor_id').eq('id', wsId).maybeSingle();
        if (wsErr || !ws) return false;
        if (ws.assigned_consultor_id === user.id) return true;
        const { data: member, error: memErr } = await supabase
          .from('workspace_users').select('user_id')
          .eq('workspace_id', wsId).eq('user_id', user.id).eq('active', true).maybeSingle();
        return !memErr && !!member;
      };
      if (funnel_item_id) {
        const { data: fi, error: fiErr } = await supabase
          .from('funnel_items').select('owner_consultant_id, linked_workspace_id')
          .eq('id', funnel_item_id).maybeSingle();
        const allowed = !fiErr && !!fi && (
          fi.owner_consultant_id === user.id ||
          (!!fi.linked_workspace_id && await consultantOwnsWorkspace(fi.linked_workspace_id))
        );
        if (!allowed) return corsJsonResponse({ error: 'Forbidden: record not assigned to caller' }, req, 403);
      }
      if (workspace_id && !(await consultantOwnsWorkspace(workspace_id))) {
        return corsJsonResponse({ error: 'Forbidden: workspace not assigned to caller' }, req, 403);
      }
    }

    // Resolve consultant if not provided - use intake routing
    if (!consultant_user_id) {
      // Check workspace first for assigned consultant
      if (workspace_id) {
        const { data: ws } = await supabase
          .from('workspaces')
          .select('assigned_consultor_id, program_id')
          .eq('id', workspace_id)
          .single();
        
        if (ws?.assigned_consultor_id) {
          consultant_user_id = ws.assigned_consultor_id;
        } else if (ws?.program_id) {
          // Try program-level intake routing
          const { data: routing } = await supabase
            .from('intake_routing')
            .select('consultant_ids, mode, round_robin_index')
            .eq('program_id', ws.program_id)
            .eq('active', true)
            .single();
          
          if (routing?.consultant_ids?.length) {
            consultant_user_id = routing.consultant_ids[0];
          }
        }
      }

      // Fallback to global intake routing
      if (!consultant_user_id) {
        const { data: globalRouting } = await supabase
          .from('intake_routing')
          .select('consultant_ids')
          .eq('scope', 'global')
          .eq('active', true)
          .single();
        
        if (globalRouting?.consultant_ids?.length) {
          consultant_user_id = globalRouting.consultant_ids[0];
        }
      }

      if (!consultant_user_id) {
        return corsJsonResponse({ error: 'No consultant found for sync. Configure intake routing or provide consultant_user_id.' }, req, 400);
      }
    }

    // Get Graph integration settings (server-side only, never expose secrets)
    // Prioritize MS_GRAPH_CLIENT_SECRET env var
    const msGraphSecret = Deno.env.get('MS_GRAPH_CLIENT_SECRET');
    
    const { data: integrationSettings } = await supabase
      .from('global_integration_settings')
      .select('settings_json, is_enabled')
      .or('integration_type.eq.microsoft_graph,integration_type.eq.graph_api')
      .single();

    if (!integrationSettings?.is_enabled) {
      return corsJsonResponse({ error: 'Microsoft Graph not configured' }, req, 400);
    }

    const graphSettings = integrationSettings.settings_json as {
      tenant_id?: string;
      client_id?: string;
      client_secret?: string;
    };

    const clientSecret = msGraphSecret || graphSettings.client_secret;

    if (!graphSettings.tenant_id || !graphSettings.client_id || !clientSecret) {
      return corsJsonResponse({ error: 'Graph credentials incomplete' }, req, 400);
    }

    // Get consultant email
    const { data: consultantProfile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', consultant_user_id)
      .single();

    if (!consultantProfile?.email) {
      return corsJsonResponse({ error: 'Consultant email not found' }, req, 400);
    }

    // Get contact emails to filter
    let contactEmails: string[] = [];

    if (funnel_item_id) {
      const { data: lead } = await supabase
        .from('funnel_items')
        .select('contact_email')
        .eq('id', funnel_item_id)
        .single();
      if (lead?.contact_email) {
        contactEmails.push(lead.contact_email.toLowerCase());
      }
    }

    if (workspace_id) {
      // Get founder emails
      const { data: workspaceUsers } = await supabase
        .from('workspace_users')
        .select('user_id, role')
        .eq('workspace_id', workspace_id)
        .eq('role', 'founder')
        .eq('active', true);

      if (workspaceUsers?.length) {
        const founderIds = workspaceUsers.map((wu) => wu.user_id);
        const { data: founderProfiles } = await supabase
          .from('profiles')
          .select('email')
          .in('id', founderIds);
        
        founderProfiles?.forEach((p) => {
          if (p.email) contactEmails.push(p.email.toLowerCase());
        });
      }

      // Get startup main email
      const { data: wsData } = await supabase
        .from('workspaces')
        .select('startup_id')
        .eq('id', workspace_id)
        .single();

      if (wsData?.startup_id) {
        const { data: startup } = await supabase
          .from('startups')
          .select('main_contact_email')
          .eq('id', wsData.startup_id)
          .single();
        if (startup?.main_contact_email) {
          contactEmails.push(startup.main_contact_email.toLowerCase());
        }
      }
    }

    contactEmails = [...new Set(contactEmails)];

    if (contactEmails.length === 0) {
      return corsJsonResponse({ 
        inserted: 0, 
        skipped: 0, 
        errors: ['No contact emails found'], 
        mailbox: consultantProfile.email 
      }, req, 200);
    }

    // Get Graph access token
    const tokenUrl = `https://login.microsoftonline.com/${graphSettings.tenant_id}/oauth2/v2.0/token`;
    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: graphSettings.client_id,
        client_secret: clientSecret,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error('[sync-graph-email-history] Token error:', errorText);
      return corsJsonResponse({ error: 'Graph authentication failed' }, req, 500);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    const result: SyncResult = {
      inserted: 0,
      skipped: 0,
      errors: [],
      mailbox: consultantProfile.email,
    };

    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - lookback_days);
    const filterDate = lookbackDate.toISOString();

    // Track max occurred_at for updating last_activity_at
    let maxOccurredAt: string | null = null;

    // Fetch messages from inbox and sent folders
    const folders = ['inbox', 'sentitems'];
    
    for (const folder of folders) {
      const direction = folder === 'inbox' ? 'inbound' : 'outbound';
      const dateField = folder === 'inbox' ? 'receivedDateTime' : 'sentDateTime';
      
      try {
        // Use correct date filter field per folder
        const messagesUrl = `https://graph.microsoft.com/v1.0/users/${consultantProfile.email}/mailFolders/${folder}/messages?$select=id,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime&$filter=${dateField} ge ${filterDate}&$top=${max_messages}&$orderby=${dateField} desc`;
        
        const messagesRes = await fetch(messagesUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!messagesRes.ok) {
          result.errors.push(`Failed to fetch ${folder}: ${messagesRes.status}`);
          continue;
        }

        const messagesData = await messagesRes.json();
        const messages = messagesData.value || [];

        for (const msg of messages) {
          // Check if message involves any contact email
          const allParticipants = [
            msg.from?.emailAddress?.address,
            ...(msg.toRecipients || []).map((r: any) => r.emailAddress?.address),
            ...(msg.ccRecipients || []).map((r: any) => r.emailAddress?.address),
          ].filter(Boolean).map((e: string) => e.toLowerCase());

          const hasContact = allParticipants.some((p) => contactEmails.includes(p));
          if (!hasContact) continue;

          const occurredAt = msg.receivedDateTime || msg.sentDateTime;
          
          // Track max for last_activity_at update
          if (!maxOccurredAt || occurredAt > maxOccurredAt) {
            maxOccurredAt = occurredAt;
          }

          // Sanitize preview (max 500 chars)
          const preview = (msg.bodyPreview || '').trim().substring(0, 500);

          // Dry run mode: count but don't insert
          if (dry_run) {
            result.inserted++;
            continue;
          }

          // Insert into communication_log (the unique indexes on external_source/external_id are
          // partial, so ON CONFLICT cannot be inferred: duplicates come back as 23505 -> skipped)
          const { error } = await supabase
            .from('communication_log')
            .insert({
              workspace_id: workspace_id || null,
              funnel_item_id: funnel_item_id || null,
              activity_type: 'email',
              channel: 'email',
              direction,
              subject: (msg.subject || '').substring(0, 500),
              preview,
              from_address: msg.from?.emailAddress?.address,
              occurred_at: occurredAt,
              visibility: 'staff',
              external_source: 'ms_graph',
              external_id: msg.id,
              metadata_json: {
                to: msg.toRecipients?.map((r: any) => r.emailAddress?.address),
                cc: msg.ccRecipients?.map((r: any) => r.emailAddress?.address),
              },
            });

          if (error) {
            if (error.code === '23505') {
              result.skipped++;
            } else {
              result.errors.push(`Insert error: ${error.message}`);
            }
          } else {
            result.inserted++;
          }
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        result.errors.push(`${folder} error: ${errorMessage}`);
      }
    }

    // Update last_activity_at on funnel_items if applicable (skip in dry_run)
    if (!dry_run && funnel_item_id && maxOccurredAt) {
      await supabase
        .from('funnel_items')
        .update({ last_activity_at: maxOccurredAt })
        .eq('id', funnel_item_id)
        .lt('last_activity_at', maxOccurredAt);
    }

    // Add dry_run info to result
    if (dry_run) {
      result.dry_run = true;
      result.would_insert = result.inserted;
      result.inserted = 0;
    }

    console.log('[sync-graph-email-history] Completed', { inserted: (result as any).inserted ?? 0, skipped: (result as any).skipped ?? 0, dry_run: Boolean((result as any).dry_run) });

    // SECURITY: Never return secrets in response
    return corsJsonResponse(result, req, 200);
  } catch (err) {
    console.error('[sync-graph-email-history] Error:', err);
    const errorMessage = err instanceof Error ? err.message : String(err);
    return corsJsonResponse({ error: errorMessage }, req, 500);
  }
});
