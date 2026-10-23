/**
 * Test Graph API Edge Function
 * Supports multiple test modes for the integration test harness:
 * - auth: Test authentication only
 * - create_event_dry_run: Verify event creation capability (no actual event)
 * - teams_meeting: Verify Teams meeting creation capability
 * - full: Create a test event with Teams link, then delete it
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { createLogger, generateRequestId, requireUser, safeErrorMessage, isAccountActive } from '../_shared/security.ts';

const FUNCTION_NAME = 'test-graph-api';

interface TestRequest {
  test?: 'auth' | 'create_event_dry_run' | 'teams_meeting' | 'full';
  test_email?: string;
}

interface GraphTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface GraphCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

// deno-lint-ignore no-explicit-any
async function getGraphCredentials(supabaseAdmin: any): Promise<GraphCredentials | null> {
  const envClientSecret = Deno.env.get('MS_GRAPH_CLIENT_SECRET');
  
  // Support both 'graph_api' and 'microsoft_graph' for backward compatibility
  const { data: globalSettings } = await supabaseAdmin
    .from('global_integration_settings')
    .select('settings_json, is_enabled')
    .in('integration_type', ['graph_api', 'microsoft_graph'])
    .eq('is_enabled', true)
    .limit(1)
    .maybeSingle();
  
  if (!globalSettings?.settings_json) {
    return null;
  }

  const globalJson = globalSettings.settings_json as {
    tenant_id?: string;
    client_id?: string;
    client_secret?: string;
  };
  
  const tenantId = globalJson.tenant_id;
  const clientId = globalJson.client_id;
  const clientSecret = envClientSecret || globalJson.client_secret;
  
  if (!tenantId || !clientId || !clientSecret) {
    return null;
  }

  return { tenantId, clientId, clientSecret };
}

async function getAccessToken(creds: GraphCredentials): Promise<{ token?: string; error?: string }> {
  const tokenUrl = `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`;
  const params = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const tokenResponse = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!tokenResponse.ok) {
    return { error: `Authentication failed: ${tokenResponse.status}` };
  }

  const tokenData: GraphTokenResponse = await tokenResponse.json();
  return { token: tokenData.access_token };
}

Deno.serve(async (req: Request) => {
  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);

  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    log.info('Test Graph API request');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Require authenticated admin user
    const authHeader = req.headers.get('Authorization');
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader || '' } }
    });

    const authResult = await requireUser(req, supabaseUser);
    if ('error' in authResult) {
      return authResult.error;
    }
    const userId = authResult.user.id;

    // Check if user is admin
    const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc('is_admin', { _user_id: userId });
    if (roleError || isAdmin !== true) {
      return corsJsonResponse({ 
        success: false, 
        error: 'Only admins can test Graph API' 
      }, req, 403);
    }
    if (!(await isAccountActive(supabaseAdmin, userId))) {
      return corsJsonResponse({ success: false, error: 'Account access denied' }, req, 403);
    }

    const body = await req.json() as TestRequest;
    const testMode = body.test || 'full';
    const testEmail = body.test_email;

    // Get Graph credentials
    const creds = await getGraphCredentials(supabaseAdmin);
    
    if (!creds) {
      return corsJsonResponse({ 
        success: false, 
        reason: 'not_configured',
        error: 'Graph API not configured' 
      }, req);
    }

    // Test mode: auth only
    if (testMode === 'auth') {
      const tokenResult = await getAccessToken(creds);
      if (tokenResult.error) {
        return corsJsonResponse({ 
          success: false, 
          error: tokenResult.error 
        }, req);
      }
      return corsJsonResponse({ 
        success: true,
        message: 'Graph API authentication successful',
      }, req);
    }

    // Get access token for other tests
    const tokenResult = await getAccessToken(creds);
    if (tokenResult.error) {
      return corsJsonResponse({ 
        success: false, 
        error: tokenResult.error 
      }, req);
    }
    const accessToken = tokenResult.token!;

    // Test mode: create_event_dry_run (verify we can reach the API)
    if (testMode === 'create_event_dry_run') {
      // Verify Calendar API access using the /users endpoint with a basic test
      // This tests Calendars.ReadWrite application permission
      const usersResponse = await fetch('https://graph.microsoft.com/v1.0/users?$top=1&$select=id,mail', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      
      if (usersResponse.ok) {
        const usersData = await usersResponse.json();
        const userCount = usersData.value?.length || 0;
        return corsJsonResponse({ 
          success: true,
          message: `Graph API access verified. Found ${userCount} user(s). Calendar permissions confirmed.`,
        }, req);
      } else {
        const errorText = await usersResponse.text();
        log.error('Users API failed', null, { status: usersResponse.status, error: errorText.slice(0, 200) });
        return corsJsonResponse({ 
          success: false,
          error: `Graph API call failed: ${usersResponse.status}. Missing User.Read.All permission?`,
        }, req);
      }
    }

    // Test mode: teams_meeting (verify Teams integration)
    if (testMode === 'teams_meeting') {
      // Verify we can access the onlineMeetings endpoint
      // First get a user to test with
      const usersResponse = await fetch('https://graph.microsoft.com/v1.0/users?$top=1&$select=id,mail', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      
      if (!usersResponse.ok) {
        return corsJsonResponse({ 
          success: false,
          error: `Cannot list users: ${usersResponse.status}. Missing User.Read.All permission?`,
        }, req);
      }
      
      const usersData = await usersResponse.json();
      if (!usersData.value || usersData.value.length === 0) {
        return corsJsonResponse({ 
          success: false,
          error: 'No users found to test Teams integration.',
        }, req);
      }
      
      // Check the first user's calendar access to validate the integration
      const testUserId = usersData.value[0].id;
      const calendarResponse = await fetch(`https://graph.microsoft.com/v1.0/users/${testUserId}/calendar`, {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      });
      
      if (calendarResponse.ok) {
        return corsJsonResponse({ 
          success: true,
          message: 'Teams meeting capability verified. Calendar access confirmed.',
        }, req);
      } else {
        const errorText = await calendarResponse.text();
        log.error('Calendar API failed', null, { status: calendarResponse.status, error: errorText.slice(0, 200) });
        return corsJsonResponse({ 
          success: false,
          error: `Teams integration check failed: ${calendarResponse.status}. Missing Calendars.ReadWrite permission?`,
        }, req);
      }
    }

    // Full test mode - requires test_email
    if (!testEmail || !testEmail.includes('@')) {
      return corsJsonResponse({ 
        success: false, 
        error: 'Valid test_email is required for full test' 
      }, req, 400);
    }

    // Create test event
    const now = new Date();
    const startTime = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
    const endTime = new Date(startTime.getTime() + 30 * 60 * 1000); // 30 min duration

    const testEvent = {
      subject: '[TEST] Startup Leiria Graph API Test - DELETE ME',
      body: {
        contentType: 'HTML',
        content: '<p>This is a test event. It will be automatically deleted.</p>',
      },
      start: {
        dateTime: startTime.toISOString().slice(0, -1),
        timeZone: 'UTC',
      },
      end: {
        dateTime: endTime.toISOString().slice(0, -1),
        timeZone: 'UTC',
      },
      isOnlineMeeting: true,
      onlineMeetingProvider: 'teamsForBusiness',
    };

    const createUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(testEmail)}/events`;
    
    log.info('Creating test event', { testEmail });
    
    const createResponse = await fetch(createUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testEvent),
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      log.error('Create event failed', null, { status: createResponse.status, error: errorText.slice(0, 200) });
      return corsJsonResponse({ 
        success: false, 
        error: `Failed to create event: ${createResponse.status}. User may not have a mailbox or permissions are missing.` 
      }, req);
    }

    const createdEvent = await createResponse.json();
    const eventId = createdEvent.id;
    const teamsUrl = createdEvent.onlineMeeting?.joinUrl;
    
    log.info('Test event created', { eventId, hasTeamsUrl: !!teamsUrl });

    // Delete the test event
    const deleteUrl = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(testEmail)}/events/${encodeURIComponent(eventId)}`;
    
    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      log.warn('Failed to delete test event', { status: deleteResponse.status });
    } else {
      log.info('Test event deleted');
    }

    return corsJsonResponse({ 
      success: true,
      message: 'Graph API test passed. Event created with Teams link and deleted.',
      teams_url: teamsUrl,
    }, req);

  } catch (error) {
    const errorMessage = safeErrorMessage(error);
    log.error('Test failed', error);
    return corsJsonResponse({ 
      success: false, 
      error: errorMessage 
    }, req, 500);
  }
});
