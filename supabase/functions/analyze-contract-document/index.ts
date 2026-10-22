import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { requireUser, generateRequestId, createLogger } from '../_shared/security.ts';

const FUNCTION_NAME = 'analyze-contract-document';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsOptions(req);

  const requestId = generateRequestId();
  const log = createLogger(FUNCTION_NAME, requestId);

  try {
    // Create a Supabase client scoped to the caller's JWT
    const supabaseAnonClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } }
    );

    const authResult = await requireUser(req, supabaseAnonClient);
    if ('error' in authResult) return authResult.error;
    const { user } = authResult;
    const userId = user.id;

    log.info('Contract document analysis requested', { userId });

    const { filePath, workspaceId } = await req.json();
    if (!filePath || typeof filePath !== 'string') {
      return corsJsonResponse({ error: 'filePath is required' }, req, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify user is staff
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const isStaff = roles?.some((r: { role: string }) => ['admin', 'consultor', 'backoffice'].includes(r.role));
    if (!isStaff) {
      return corsJsonResponse({ error: 'Forbidden' }, req, 403);
    }

    // Download the PDF from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('contract-documents')
      .download(filePath);

    if (downloadError || !fileData) {
      log.error('Failed to download file', { error: downloadError?.message });
      return corsJsonResponse({ error: 'Could not download file' }, req, 404);
    }

    // Convert PDF to base64 for AI analysis
    const arrayBuffer = await fileData.arrayBuffer();
    // RC11: conversao por blocos; o spread de um PDF de varios MB excedia o limite de argumentos
    const bytes = new Uint8Array(arrayBuffer);
    if (bytes.length > 10 * 1024 * 1024) {
      return corsJsonResponse({ error: 'File too large (max 10MB)' }, req, 413);
    }
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) {
      binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 32768)));
    }
    const base64 = btoa(binary);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return corsJsonResponse({ error: 'AI not configured' }, req, 500);
    }

    const prompt = `Analyze this contract PDF document and extract structured data.

Extract the following fields:
1. title: The contract title or type
2. startDate: The start date in YYYY-MM-DD format
3. endDate: The end date in YYYY-MM-DD format (if found)
4. monthlyFee: Monthly fee or payment amount as a number
5. parties: Array of party names involved
6. notes: Any important observations or clauses
7. key_dates: Array of key dates with {date, description, is_critical}
8. missing_info: Array of missing or unclear information with {field, severity, suggestion}
9. risk_level: Overall risk assessment (low/medium/high)
10. risk_justification: Brief explanation of risk level

Return ONLY valid JSON matching the schema.`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a contract document analyst. Extract structured data from contract PDFs. Always respond with valid JSON only.',
          },
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: { url: `data:application/pdf;base64,${base64}` },
              },
            ],
          },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'contract_extraction',
              description: 'Return extracted contract data',
              parameters: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  startDate: { type: 'string' },
                  endDate: { type: 'string' },
                  monthlyFee: { type: 'number' },
                  parties: { type: 'array', items: { type: 'string' } },
                  notes: { type: 'string' },
                  key_dates: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        date: { type: 'string' },
                        description: { type: 'string' },
                        is_critical: { type: 'boolean' },
                      },
                      required: ['date', 'description', 'is_critical'],
                      additionalProperties: false,
                    },
                  },
                  missing_info: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        field: { type: 'string' },
                        severity: { type: 'string', enum: ['low', 'medium', 'high'] },
                        suggestion: { type: 'string' },
                      },
                      required: ['field', 'severity', 'suggestion'],
                      additionalProperties: false,
                    },
                  },
                  risk_level: { type: 'string', enum: ['low', 'medium', 'high'] },
                  risk_justification: { type: 'string' },
                },
                required: ['title', 'startDate', 'monthlyFee', 'parties', 'risk_level', 'risk_justification'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'contract_extraction' } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      log.error('AI gateway error', { status: aiResponse.status, errText });
      return corsJsonResponse({ extraction: null, error: 'AI analysis failed' }, req, 200);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    let extraction = null;
    if (toolCall?.function?.arguments) {
      try {
        extraction = JSON.parse(toolCall.function.arguments);
      } catch {
        log.error('Failed to parse AI tool call arguments');
      }
    }

    if (!extraction) {
      const content = aiData.choices?.[0]?.message?.content;
      try {
        extraction = content ? JSON.parse(content) : null;
      } catch {
        log.error('Failed to parse AI content response');
      }
    }

    // Log activity
    await supabase.from('activity_log').insert({
      user_id: userId,
      action: 'contract_document_analyzed',
      entity_type: 'contract_document',
      entity_id: filePath,
      workspace_id: workspaceId || null,
      metadata: { risk_level: extraction?.risk_level, has_extraction: !!extraction },
    });

    return corsJsonResponse({ extraction }, req);
  } catch (error) {
    log.error('Failed to analyze contract document', { error: error instanceof Error ? error.message : String(error) });
    return corsJsonResponse({ error: 'Internal server error' }, req, 500);
  }
});
