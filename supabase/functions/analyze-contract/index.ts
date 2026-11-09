import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { requireUser, isAccountActive, checkAIRateLimit, generateRequestId, createLogger } from '../_shared/security.ts';

const FUNCTION_NAME = 'analyze-contract';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

    log.info('Contract analysis requested', { userId });

    const body = await req.json().catch(() => null);
    const contractId = body?.contractId;
    if (typeof contractId !== 'string' || !UUID_RE.test(contractId)) {
      return corsJsonResponse({ error: 'contractId (uuid) is required' }, req, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // AGENTS.md: estado da conta verificado pelo helper partilhado antes de operações com service role
    if (!(await isAccountActive(supabase, userId))) {
      return corsJsonResponse({ error: 'Forbidden' }, req, 403);
    }

    // Verify user is staff
    const { data: roles } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId);

    const isStaff = roles?.some(r => ['admin', 'consultor', 'backoffice'].includes(r.role));
    if (!isStaff) {
      return corsJsonResponse({ error: 'Forbidden' }, req, 403);
    }

    // Cada chamada gasta créditos do gateway de IA: mesmo limite das outras funções de IA
    if (!(await checkAIRateLimit(supabase, userId, null, FUNCTION_NAME, 20))) {
      return corsJsonResponse({ error: 'Rate limit exceeded. You can make up to 20 AI requests per hour.', code: 'RATE_LIMITED' }, req, 429);
    }

    // Fetch contract details
    const { data: contract, error: contractError } = await supabase
      .from('startup_contracts')
      .select(`
        *,
        workspace:workspaces(
          id,
          startup:startups(name)
        ),
        incubation_type:incubation_types(name, duration_months, base_monthly_fee)
      `)
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      return corsJsonResponse({ error: 'Contract not found' }, req, 404);
    }

    // Call Lovable AI to analyze the contract
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return corsJsonResponse({ error: 'AI not configured' }, req, 500);
    }

    const prompt = `Analyze this startup incubation/acceleration contract and extract key information.
Return a structured analysis.

Contract details:
- Startup: ${contract.workspace?.startup?.name || 'Unknown'}
- Type: ${contract.incubation_type?.name || 'N/A'}
- Start date: ${contract.start_date || 'Not set'}
- End date: ${contract.end_date || 'Not set'}
- Duration (months): ${contract.incubation_type?.duration_months || 'N/A'}
- Monthly fee: ${contract.incubation_type?.base_monthly_fee || 'N/A'}
- Status: ${contract.status || 'N/A'}
- Payment status: ${contract.payment_status || 'N/A'}
- Notes: ${contract.notes || 'None'}
- Renewal type: ${contract.renewal_type || 'N/A'}

Please provide:
1. Key dates and obligations (list up to 5)
2. Missing information or red flags (list up to 3)
3. Recommended next actions (list up to 3)
4. Risk level (low/medium/high) with brief justification

Respond in JSON format with keys: key_dates, missing_info, recommended_actions, risk_level, risk_justification`;

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You are a contract analyst assistant. Analyze contracts and extract structured information. Always respond in valid JSON.' },
          { role: 'user', content: prompt },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'contract_analysis',
              description: 'Return structured contract analysis results',
              parameters: {
                type: 'object',
                properties: {
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
                  recommended_actions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        action: { type: 'string' },
                        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
                      },
                      required: ['action', 'priority'],
                      additionalProperties: false,
                    },
                  },
                  risk_level: { type: 'string', enum: ['low', 'medium', 'high'] },
                  risk_justification: { type: 'string' },
                },
                required: ['key_dates', 'missing_info', 'recommended_actions', 'risk_level', 'risk_justification'],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: 'contract_analysis' } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return corsJsonResponse({ error: 'Rate limit exceeded. Please try again later.' }, req, 429);
      }
      if (status === 402) {
        return corsJsonResponse({ error: 'AI credits exhausted. Please add credits.' }, req, 402);
      }
      const errText = await aiResponse.text();
      log.error('AI gateway error', new Error(`status ${status}`), { errText: errText.slice(0, 500) });
      return corsJsonResponse({ error: 'AI analysis failed' }, req, 500);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    
    let analysis;
    if (toolCall?.function?.arguments) {
      try {
        analysis = JSON.parse(toolCall.function.arguments);
      } catch {
        return corsJsonResponse({ error: 'AI analysis failed' }, req, 502);
      }
    } else {
      // Fallback: try parsing content directly
      const content = aiData.choices?.[0]?.message?.content;
      try {
        analysis = JSON.parse(content);
        if (!analysis || typeof analysis !== 'object') throw new Error('not an object');
      } catch {
        analysis = {
          key_dates: [],
          missing_info: [],
          recommended_actions: [],
          risk_level: 'medium',
          risk_justification: content || 'Unable to parse AI response',
        };
      }
    }

    // Log analysis to activity log
    const { error: logErr } = await supabase.from('activity_log').insert({
      user_id: userId,
      workspace_id: contract.workspace_id ?? null,
      action: 'contract_ai_analysis',
      entity_type: 'startup_contract',
      entity_id: contractId,
      metadata: { risk_level: analysis.risk_level },
    });
    if (logErr) log.warn('activity_log insert failed', { error: logErr.message });

    return corsJsonResponse({
      analysis,
      contract_summary: {
        startup_name: contract.workspace?.startup?.name,
        type: contract.incubation_type?.name,
        status: contract.status,
        start_date: contract.start_date,
        end_date: contract.end_date,
      },
    }, req);
  } catch (error) {
    log.error('Failed to analyze contract', error);
    return corsJsonResponse({ error: 'Internal server error' }, req, 500);
  }
});
