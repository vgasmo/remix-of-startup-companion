/**
 * Set Global Integrations - Admin-only edge function to write integration settings
 * Handles secrets server-side and never exposes them to clients
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { requireUser, createLogger, generateRequestId } from '../_shared/security.ts';

const FUNCTION_NAME = 'set-global-integrations';

interface SetIntegrationRequest {
  integration_type: string;
  settings?: Record<string, unknown>;
  settings_json?: Record<string, unknown>;
  is_enabled?: boolean;
}

Deno.serve(async (req) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);

  if (req.method === "OPTIONS") {
    return handleCorsOptions(req);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Authenticate user
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } }
    });

    const authResult = await requireUser(req, supabaseUser);
    if ('error' in authResult) {
      log.warn('Unauthorized access attempt');
      return authResult.error;
    }

    const user = authResult.user;

    // Check if user is admin (only admins can write settings)
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isAdmin = roles?.some(r => r.role === 'admin');
    if (!isAdmin) {
      log.warn('Non-admin write attempt', { userId: user.id });
      return corsJsonResponse({ error: 'Admin access required' }, req, 403);
    }

    // Parse request
    let body: SetIntegrationRequest;
    try {
      body = await req.json();
    } catch {
      return corsJsonResponse({ error: 'Invalid JSON body' }, req, 400);
    }

    if (!body.integration_type) {
      return corsJsonResponse({ error: 'integration_type required' }, req, 400);
    }

    // Validate UUID format for Graph API settings
    if (body.integration_type === 'graph_api') {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const settings = (body.settings ?? {}) as { tenant_id?: string; client_id?: string };
      if (settings.tenant_id && !uuidRegex.test(settings.tenant_id)) {
        return corsJsonResponse({ error: 'Invalid tenant_id format' }, req, 400);
      }
      if (settings.client_id && !uuidRegex.test(settings.client_id)) {
        return corsJsonResponse({ error: 'Invalid client_id format' }, req, 400);
      }
    }


    // SECURITY: Never store client_secret in database
    // Accept both 'settings' and 'settings_json' from client
    const rawSettings = body.settings ?? body.settings_json ?? {};
    const { client_secret: _removed, ...sanitizedSettings } = rawSettings;
    const finalSettings = { ...sanitizedSettings };
    
    if (_removed) {
      log.warn('Rejected attempt to store client_secret in database - use MS_GRAPH_CLIENT_SECRET env var');
    }

    // Upsert settings using service role
    const { data, error } = await supabase
      .from('global_integration_settings')
      .upsert({
        integration_type: body.integration_type,
        settings_json: finalSettings,
        is_enabled: body.is_enabled ?? true,
        created_by: user.id,
      }, { onConflict: 'integration_type' })
      .select('id, integration_type, is_enabled, created_at, updated_at')
      .single();

    if (error) {
      log.error('Failed to save settings', error);
      return corsJsonResponse({ error: 'Failed to save settings' }, req, 500);
    }

    log.info('Settings saved', { type: body.integration_type, userId: user.id });

    // Return sanitized response (no secrets)
    return corsJsonResponse({
      success: true,
      settings: {
        id: data.id,
        integration_type: data.integration_type,
        is_enabled: data.is_enabled,
        created_at: data.created_at,
        updated_at: data.updated_at,
        settings_json: {
          tenant_id: finalSettings.tenant_id,
          client_id: finalSettings.client_id,
          // NEVER return client_secret
        },
      },
    }, req);
  } catch (error) {
    log.error('Fatal error', error);
    return corsJsonResponse({ error: 'Internal error' }, req, 500);
  }
});
