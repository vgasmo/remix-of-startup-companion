/**
 * Get Global Integrations - Admin-only edge function to read integration settings
 * Returns sanitized settings (no secrets) to prevent client_secret exposure
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { requireUser, createLogger, generateRequestId, denyIfAccountInactive } from '../_shared/security.ts';

const FUNCTION_NAME = 'get-global-integrations';

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

    // Check if user is staff
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isStaff = roles?.some(r => r.role === 'admin' || r.role === 'consultor');
    if (!isStaff) {
      log.warn('Non-staff access attempt', { userId: user.id });
      return corsJsonResponse({ error: 'Access denied' }, req, 403);
    }
    const inactive = await denyIfAccountInactive(req, supabase, user.id);
    if (inactive) return inactive;

    // Parse request body
    let body: { integration_type?: string } = {};
    try {
      body = await req.json();
    } catch {
      // No body is fine
    }

    // Fetch integration settings
    let query = supabase
      .from('global_integration_settings')
      .select('id, integration_type, is_enabled, created_at, updated_at, settings_json');

    if (body.integration_type) {
      query = query.eq('integration_type', body.integration_type);
    }

    const { data: settings, error } = await query;

    if (error) {
      log.error('Failed to fetch settings', error);
      return corsJsonResponse({ error: 'Failed to fetch settings' }, req, 500);
    }

    // CRITICAL: Sanitize settings - NEVER return client_secret
    const sanitizedSettings = settings?.map(setting => {
      const sanitizedJson = { ...setting.settings_json } as Record<string, unknown>;
      delete sanitizedJson.client_secret;
      
      return {
        id: setting.id,
        integration_type: setting.integration_type,
        is_enabled: setting.is_enabled,
        created_at: setting.created_at,
        updated_at: setting.updated_at,
        settings_json: sanitizedJson,
      };
    }) || [];

    log.info('Returned sanitized settings', { count: sanitizedSettings.length });

    return corsJsonResponse({ settings: sanitizedSettings }, req);
  } catch (error) {
    log.error('Fatal error', error);
    return corsJsonResponse({ error: 'Internal error' }, req, 500);
  }
});
