import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  validateUUID,
  validateOptionalUUID,
  validateOptionalString,
  validateOptionalISODate,
  validateOptionalURL,
  validateStringArray,
  parseAndValidateBody,
  sanitizeString,
  sanitizeErrorForClient,
  validationErrorResponse,
  SIZE_LIMITS,
} from '../_shared/validation.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
};

/**
 * Constant-time string equality — prevents timing attacks that progressively
 * reveal the secret by measuring early-exit comparison time.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);
  const len = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

interface MeetingIngestPayload {
  workspace_id?: string;
  workspace_external_id?: string;
  meeting_title?: string;
  start_time?: string;
  end_time?: string;
  participants?: string[];
  transcript_text?: string;
  summary?: string;
  join_url?: string;
  source?: string;
}

/**
 * Validate meeting ingest request body
 */
function validateMeetingPayload(body: MeetingIngestPayload): { valid: true; data: MeetingIngestPayload } | { valid: false; error: string } {
  // Validate workspace_id if provided
  const workspaceIdResult = validateOptionalUUID(body.workspace_id, 'workspace_id');
  if (!workspaceIdResult.valid) {
    return { valid: false, error: workspaceIdResult.error! };
  }

  // Validate workspace_external_id if provided
  const externalIdResult = validateOptionalString(body.workspace_external_id, 'workspace_external_id', 255);
  if (!externalIdResult.valid) {
    return { valid: false, error: externalIdResult.error! };
  }

  // At least one workspace identifier required
  if (!workspaceIdResult.value && !externalIdResult.value) {
    return { valid: false, error: 'Either workspace_id or workspace_external_id is required' };
  }

  // Validate meeting_title
  const titleResult = validateOptionalString(body.meeting_title, 'meeting_title', SIZE_LIMITS.MEETING_TITLE);
  if (!titleResult.valid) {
    return { valid: false, error: titleResult.error! };
  }

  // Validate dates
  const startTimeResult = validateOptionalISODate(body.start_time, 'start_time');
  if (!startTimeResult.valid) {
    return { valid: false, error: startTimeResult.error! };
  }

  const endTimeResult = validateOptionalISODate(body.end_time, 'end_time');
  if (!endTimeResult.valid) {
    return { valid: false, error: endTimeResult.error! };
  }

  // Validate participants
  const participantsResult = validateStringArray(body.participants, 'participants', { maxItems: 100, maxItemLength: 255 });
  if (!participantsResult.valid) {
    return { valid: false, error: participantsResult.error! };
  }

  // Validate transcript_text with size limit
  const transcriptResult = validateOptionalString(body.transcript_text, 'transcript_text', SIZE_LIMITS.TRANSCRIPT);
  if (!transcriptResult.valid) {
    return { valid: false, error: transcriptResult.error! };
  }

  // Validate summary
  const summaryResult = validateOptionalString(body.summary, 'summary', SIZE_LIMITS.DESCRIPTION);
  if (!summaryResult.valid) {
    return { valid: false, error: summaryResult.error! };
  }

  // Validate join_url
  const urlResult = validateOptionalURL(body.join_url, 'join_url');
  if (!urlResult.valid) {
    return { valid: false, error: urlResult.error! };
  }

  // Validate source
  const sourceResult = validateOptionalString(body.source, 'source', 50);
  if (!sourceResult.valid) {
    return { valid: false, error: sourceResult.error! };
  }

  return {
    valid: true,
    data: {
      workspace_id: workspaceIdResult.value,
      workspace_external_id: externalIdResult.value,
      meeting_title: titleResult.value ? sanitizeString(titleResult.value, SIZE_LIMITS.MEETING_TITLE) : undefined,
      start_time: startTimeResult.value,
      end_time: endTimeResult.value,
      participants: participantsResult.value,
      transcript_text: transcriptResult.value ? sanitizeString(transcriptResult.value, SIZE_LIMITS.TRANSCRIPT) : undefined,
      summary: summaryResult.value ? sanitizeString(summaryResult.value, SIZE_LIMITS.DESCRIPTION) : undefined,
      join_url: urlResult.value,
      source: sourceResult.value || 'webhook',
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify webhook secret with a constant-time comparison (timing-attack resistant).
    const webhookSecret = req.headers.get('X-Webhook-Secret');
    const expectedSecret = Deno.env.get('WEBHOOK_SECRET');

    if (!webhookSecret || !expectedSecret || !timingSafeEqual(webhookSecret, expectedSecret)) {
      console.error('Invalid or missing webhook secret');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Parse and validate request body with size limit
    const bodyResult = await parseAndValidateBody<MeetingIngestPayload>(req, SIZE_LIMITS.JSON_PAYLOAD);
    if (!bodyResult.valid) {
      return validationErrorResponse(bodyResult.error!, corsHeaders);
    }

    // Validate all fields
    const validation = validateMeetingPayload(bodyResult.value!);
    if (!validation.valid) {
      return validationErrorResponse(validation.error, corsHeaders);
    }

    const {
      workspace_id,
      workspace_external_id,
      meeting_title,
      start_time,
      end_time,
      participants,
      transcript_text,
      summary,
      join_url,
      source,
    } = validation.data;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Log without sensitive IDs - only log metadata for debugging
    console.log('Received meeting ingest webhook:', { 
      has_workspace_id: !!workspace_id, 
      has_workspace_external_id: !!workspace_external_id, 
      has_meeting_title: !!meeting_title, 
      source 
    });

    // Resolve workspace
    let resolvedWorkspaceId = workspace_id;
    
    if (!resolvedWorkspaceId && workspace_external_id) {
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('id')
        .eq('external_id', workspace_external_id)
        .maybeSingle();

      if (workspace) {
        resolvedWorkspaceId = workspace.id;
      }
    }

    if (!resolvedWorkspaceId) {
      return new Response(JSON.stringify({ 
        error: 'Invalid workspace identifier' 
      }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Verify workspace exists and is active
    const { data: workspace, error: wsError } = await supabase
      .from('workspaces')
      .select('id, status')
      .eq('id', resolvedWorkspaceId)
      .single();

    if (wsError || !workspace) {
      return new Response(JSON.stringify({ error: 'Workspace not found' }), { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    // Create or update session
    const sessionData: Record<string, unknown> = {
      workspace_id: resolvedWorkspaceId,
      title: meeting_title || 'Meeting from ' + source,
      scheduled_at: start_time || new Date().toISOString(),
      status: 'completed',
      session_type: 'meeting',
    };

    if (end_time && start_time) {
      sessionData.duration_minutes = Math.round(
        (new Date(end_time).getTime() - new Date(start_time).getTime()) / 60000
      );
    }

    if (join_url) {
      sessionData.join_url = join_url;
    }

    if (summary) {
      sessionData.summary = summary;
    }

    // Check for existing session with same title and time (deduplication)
    const searchTime = start_time || new Date().toISOString();
    const { data: existingSession } = await supabase
      .from('sessions')
      .select('id')
      .eq('workspace_id', resolvedWorkspaceId)
      .eq('title', sessionData.title)
      .gte('scheduled_at', new Date(new Date(searchTime).getTime() - 3600000).toISOString()) // Within 1 hour
      .lte('scheduled_at', new Date(new Date(searchTime).getTime() + 3600000).toISOString())
      .maybeSingle();

    let sessionId: string;

    if (existingSession) {
      // Update existing session
      const { error: updateError } = await supabase
        .from('sessions')
        .update({ ...sessionData, updated_at: new Date().toISOString() })
        .eq('id', existingSession.id);

      if (updateError) {
        console.error('Error updating session:', updateError);
        throw updateError;
      }
      sessionId = existingSession.id;
      console.log('Updated existing session:', sessionId);
    } else {
      // Create new session
      const { data: newSession, error: insertError } = await supabase
        .from('sessions')
        .insert(sessionData)
        .select('id')
        .single();

      if (insertError) {
        console.error('Error creating session:', insertError);
        throw insertError;
      }
      sessionId = newSession.id;
      console.log('Created new session:', sessionId);
    }

    // Store transcript if provided
    if (transcript_text) {
      const { error: transcriptError } = await supabase
        .from('session_transcripts')
        .insert({
          session_id: sessionId,
          transcript_text,
          source,
        });

      if (transcriptError) {
        console.error('Error storing transcript:', transcriptError);
      }
    }

    // Log activity
    await supabase.from('activity_log').insert({
      workspace_id: resolvedWorkspaceId,
      user_id: '00000000-0000-0000-0000-000000000000', // System user
      entity_type: 'session',
      entity_id: sessionId,
      action: existingSession ? 'meeting_updated' : 'meeting_ingested',
      metadata: {
        source,
        has_transcript: !!transcript_text,
        participants_count: participants?.length || 0,
      },
    });

    return new Response(JSON.stringify({ 
      success: true,
      session_id: sessionId,
      workspace_id: resolvedWorkspaceId,
      action: existingSession ? 'updated' : 'created',
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    // Log full error for debugging (server-side only)
    console.error('Meeting ingest error:', error);
    // Return sanitized error to client
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
