import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  validateString,
  validateOptionalString,
  validateOptionalEmail,
  parseAndValidateBody,
  sanitizeString,
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
  // Compare against the longer length so length mismatch doesn't short-circuit timing.
  const len = Math.max(aBytes.length, bBytes.length);
  let diff = aBytes.length ^ bBytes.length;
  for (let i = 0; i < len; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
}

interface EmailWebhookPayload {
  alias?: string;
  from?: string;
  subject?: string;
  body_text?: string;
  body_html?: string;
  attachments_meta?: Array<{ name: string; size: number; type: string }>;
}

/**
 * Validate email webhook payload
 */
function validateEmailPayload(body: EmailWebhookPayload): { valid: true; data: EmailWebhookPayload } | { valid: false; error: string } {
  // Validate alias (required)
  const aliasResult = validateString(body.alias, 'alias', { required: true, maxLength: SIZE_LIMITS.ALIAS });
  if (!aliasResult.valid) {
    return { valid: false, error: aliasResult.error! };
  }

  // Validate from email
  const fromResult = validateOptionalEmail(body.from, 'from');
  if (!fromResult.valid) {
    return { valid: false, error: fromResult.error! };
  }

  // Validate subject
  const subjectResult = validateOptionalString(body.subject, 'subject', SIZE_LIMITS.SUBJECT);
  if (!subjectResult.valid) {
    return { valid: false, error: subjectResult.error! };
  }

  // Validate body_text
  const bodyTextResult = validateOptionalString(body.body_text, 'body_text', SIZE_LIMITS.EMAIL_BODY);
  if (!bodyTextResult.valid) {
    return { valid: false, error: bodyTextResult.error! };
  }

  // Validate body_html
  const bodyHtmlResult = validateOptionalString(body.body_html, 'body_html', SIZE_LIMITS.EMAIL_BODY);
  if (!bodyHtmlResult.valid) {
    return { valid: false, error: bodyHtmlResult.error! };
  }

  // Validate attachments_meta if provided
  let attachmentsMeta: Array<{ name: string; size: number; type: string }> | undefined;
  if (body.attachments_meta && Array.isArray(body.attachments_meta)) {
    if (body.attachments_meta.length > 50) {
      return { valid: false, error: 'Too many attachments (max 50)' };
    }
    attachmentsMeta = body.attachments_meta
      .slice(0, 50)
      .map(att => ({
        name: typeof att.name === 'string' ? att.name.slice(0, 255) : 'unknown',
        size: typeof att.size === 'number' ? att.size : 0,
        type: typeof att.type === 'string' ? att.type.slice(0, 100) : 'unknown',
      }));
  }

  return {
    valid: true,
    data: {
      alias: sanitizeString(aliasResult.value!, SIZE_LIMITS.ALIAS),
      from: fromResult.value,
      subject: subjectResult.value ? sanitizeString(subjectResult.value, SIZE_LIMITS.SUBJECT) : undefined,
      body_text: bodyTextResult.value ? sanitizeString(bodyTextResult.value, SIZE_LIMITS.EMAIL_BODY) : undefined,
      body_html: bodyHtmlResult.value,
      attachments_meta: attachmentsMeta,
    },
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify webhook secret with a constant-time comparison so timing attacks
    // can't progressively guess the secret. Fail closed on missing config or input.
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
    const bodyResult = await parseAndValidateBody<EmailWebhookPayload>(req, SIZE_LIMITS.JSON_PAYLOAD);
    if (!bodyResult.valid) {
      return validationErrorResponse(bodyResult.error!, corsHeaders);
    }

    // Validate all fields
    const validation = validateEmailPayload(bodyResult.value!);
    if (!validation.valid) {
      return validationErrorResponse(validation.error, corsHeaders);
    }

    const {
      alias,
      from,
      subject,
      body_text,
      body_html,
      attachments_meta,
    } = validation.data;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Received inbound email:', { alias, has_from: !!from, has_subject: !!subject });

    // Resolve workspace by alias
    const { data: emailAlias, error: aliasError } = await supabase
      .from('workspace_email_aliases')
      .select('workspace_id')
      .eq('alias', alias)
      .maybeSingle();

    if (aliasError || !emailAlias) {
      console.log('Alias not found:', alias);
      return new Response(JSON.stringify({ error: 'Unknown email alias' }), { 
        status: 404, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      });
    }

    const workspaceId = emailAlias.workspace_id;

    // Store in communication_log
    const { data: logEntry, error: logError } = await supabase
      .from('communication_log')
      .insert({
        workspace_id: workspaceId,
        channel: 'email',
        from_address: from,
        subject: subject,
        body: body_text || body_html,
        metadata_json: {
          has_attachments: !!attachments_meta?.length,
          attachments: attachments_meta,
        },
      })
      .select('id')
      .single();

    if (logError) {
      console.error('Error storing email:', logError);
      throw logError;
    }

    // Log activity
    await supabase.from('activity_log').insert({
      workspace_id: workspaceId,
      user_id: '00000000-0000-0000-0000-000000000000', // System user
      entity_type: 'communication',
      entity_id: logEntry.id,
      action: 'email_received',
      metadata: {
        has_from: !!from,
        has_subject: !!subject,
        has_attachments: !!attachments_meta?.length,
      },
    });

    console.log('Email stored successfully:', logEntry.id);

    return new Response(JSON.stringify({ 
      success: true,
      communication_id: logEntry.id,
      workspace_id: workspaceId,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    // Log full error server-side for debugging
    console.error('Inbound email error:', error);
    // Return sanitized error to client
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
