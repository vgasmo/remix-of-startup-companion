import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';

interface RecapRequest {
  funnel_item_id?: string;
  workspace_id?: string;
  language?: 'pt' | 'en';
  max_items?: number;
}

interface RecapOutput {
  summary: string;
  key_points: string[];
  open_loops: string[];
  risks: string[];
  next_best_actions: string[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      return corsJsonResponse({ error: 'LOVABLE_API_KEY is not configured' }, req, 500);
    }

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
      console.error('[generate-relationship-recap] Auth error:', authError);
      return corsJsonResponse({ error: 'Unauthorized' }, req, 401);
    }

    // Service client for privileged operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check feature flag
    const { data: flag } = await supabase
      .from('feature_flags')
      .select('enabled')
      .eq('key', 'crm_ai_recap')
      .is('program_id', null)
      .single();

    if (!flag?.enabled) {
      return corsJsonResponse({ error: 'Feature disabled' }, req, 403);
    }

    const body: RecapRequest = await req.json();
    const { funnel_item_id, workspace_id, language = 'pt', max_items = 100 } = body;

    if (!funnel_item_id && !workspace_id) {
      return corsJsonResponse({ error: 'funnel_item_id or workspace_id required' }, req, 400);
    }

    // Access check: workspace access for founders, staff for funnel
    if (workspace_id) {
      const { data: hasAccess } = await supabase.rpc('has_workspace_access', {
        _user_id: user.id,
        _workspace_id: workspace_id,
      });
      
      if (!hasAccess) {
        return corsJsonResponse({ error: 'Workspace access denied' }, req, 403);
      }
    }

    // Staff check for funnel access
    if (funnel_item_id) {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      const isStaff = roles?.some((r) => r.role === 'admin' || r.role === 'consultor');
      if (!isStaff) {
        return corsJsonResponse({ error: 'Funnel access denied' }, req, 403);
      }
    }

    // Gather activities
    let activities: any[] = [];

    // Communication log entries
    const commQuery = supabase
      .from('communication_log')
      .select('*')
      .order('occurred_at', { ascending: false })
      .limit(max_items);

    if (workspace_id) {
      commQuery.eq('workspace_id', workspace_id);
    } else if (funnel_item_id) {
      commQuery.eq('funnel_item_id', funnel_item_id);
    }

    const { data: commLogs } = await commQuery;
    if (commLogs) {
      activities.push(...commLogs.map((c) => ({
        type: c.activity_type,
        date: c.occurred_at,
        subject: c.subject,
        preview: c.preview || c.body?.substring(0, 300),
        direction: c.direction,
      })));
    }

    // Session notes if workspace
    if (workspace_id) {
      const { data: sessions } = await supabase
        .from('sessions')
        .select('id, title, scheduled_at, notes, ai_summary')
        .eq('workspace_id', workspace_id)
        .order('scheduled_at', { ascending: false })
        .limit(10);

      if (sessions) {
        activities.push(...sessions.map((s) => ({
          type: 'meeting',
          date: s.scheduled_at,
          subject: s.title,
          preview: s.ai_summary || s.notes?.substring(0, 300),
        })));
      }
    }

    // Sort by date
    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    activities = activities.slice(0, max_items);

    if (activities.length === 0) {
      const emptyRecap = {
        summary: language === 'pt' ? 'Sem interações registadas.' : 'No interactions recorded.',
        key_points: [],
        open_loops: [],
        risks: [],
        next_best_actions: [],
        items_analyzed: 0,
      };
      return corsJsonResponse(emptyRecap, req, 200);
    }

    // Get context for the lead/workspace
    let contextName = '';
    if (funnel_item_id) {
      const { data: lead } = await supabase
        .from('funnel_items')
        .select('contact_name, organization_name, stage')
        .eq('id', funnel_item_id)
        .single();
      if (lead) {
        contextName = lead.organization_name || lead.contact_name || 'Lead';
      }
    } else if (workspace_id) {
      const { data: workspace } = await supabase
        .from('workspaces')
        .select('startups(name)')
        .eq('id', workspace_id)
        .single();
      if (workspace?.startups) {
        contextName = (workspace.startups as any).name || 'Startup';
      }
    }

    const systemPrompt = language === 'pt' 
      ? `És um assistente de CRM para consultores de startups. Analisa o histórico de interações com "${contextName}" e gera um resumo estruturado. Responde SEMPRE em português de Portugal.`
      : `You are a CRM assistant for startup consultants. Analyze the interaction history with "${contextName}" and generate a structured summary. Always respond in English.`;

    const userPrompt = language === 'pt'
      ? `Analisa estas ${activities.length} interações e gera:
1. Um parágrafo resumo (máx 100 palavras)
2. 3-5 pontos-chave da relação
3. 1-3 "open loops" (temas pendentes/promessas)
4. 0-2 riscos identificados
5. 2-3 próximas ações recomendadas

Interações (mais recentes primeiro):
${activities.map((a, i) => `${i + 1}. [${a.type}] ${a.date}: ${a.subject || ''} - ${a.preview || ''}`).join('\n')}`
      : `Analyze these ${activities.length} interactions and generate:
1. A summary paragraph (max 100 words)
2. 3-5 key relationship points
3. 1-3 open loops (pending topics/promises)
4. 0-2 identified risks
5. 2-3 recommended next actions

Interactions (most recent first):
${activities.map((a, i) => `${i + 1}. [${a.type}] ${a.date}: ${a.subject || ''} - ${a.preview || ''}`).join('\n')}`;

    console.log('[generate-relationship-recap] Calling Lovable AI Gateway');

    // Call Lovable AI Gateway with tool calling for structured output
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'provide_relationship_recap',
              description: 'Provide structured relationship recap for the lead/startup',
              parameters: {
                type: 'object',
                properties: {
                  summary: { type: 'string', description: 'Brief summary paragraph' },
                  key_points: { type: 'array', items: { type: 'string' }, description: 'Key relationship points' },
                  open_loops: { type: 'array', items: { type: 'string' }, description: 'Pending topics or promises' },
                  risks: { type: 'array', items: { type: 'string' }, description: 'Identified risks' },
                  next_best_actions: { type: 'array', items: { type: 'string' }, description: 'Recommended next actions' }
                },
                required: ['summary', 'key_points', 'open_loops', 'risks', 'next_best_actions'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'provide_relationship_recap' } }
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return corsJsonResponse({ error: 'Rate limit exceeded. Please try again later.' }, req, 429);
      }
      if (aiResponse.status === 402) {
        return corsJsonResponse({ error: 'AI credits exhausted. Please add credits.' }, req, 402);
      }
      const errorText = await aiResponse.text();
      console.error('[generate-relationship-recap] AI gateway error:', aiResponse.status, errorText);
      return corsJsonResponse({ error: 'AI generation failed' }, req, 500);
    }

    const aiData = await aiResponse.json();
    
    // Extract recap from tool call
    let recap: RecapOutput;
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      try {
        recap = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        console.error('[generate-relationship-recap] Failed to parse tool call:', e);
        recap = {
          summary: language === 'pt' ? 'Não foi possível gerar resumo.' : 'Could not generate summary.',
          key_points: [],
          open_loops: [],
          risks: [],
          next_best_actions: [],
        };
      }
    } else {
      // Fallback: try to parse from content
      const content = aiData.choices?.[0]?.message?.content || '';
      try {
        const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/) || [null, content];
        recap = JSON.parse(jsonMatch[1] || content);
      } catch (e) {
        console.error('[generate-relationship-recap] Failed to parse content:', e);
        recap = {
          summary: content || (language === 'pt' ? 'Resumo não disponível.' : 'Summary not available.'),
          key_points: [],
          open_loops: [],
          risks: [],
          next_best_actions: [],
        };
      }
    }

    // Store recap — use delete + insert since partial unique indexes
    // don't work with Supabase JS upsert's onConflict parameter
    const recapRow = {
      summary: recap.summary || '',
      key_points: recap.key_points || [],
      open_loops: recap.open_loops || [],
      risks: recap.risks || [],
      next_best_actions: recap.next_best_actions || [],
      items_analyzed: activities.length,
      generated_at: new Date().toISOString(),
      generated_by: user.id,
      language,
    };

    if (workspace_id) {
      // Delete existing recap for this workspace+language
      await supabase
        .from('relationship_recaps')
        .delete()
        .eq('workspace_id', workspace_id)
        .eq('language', language);
      
      const { error: insertErr } = await supabase
        .from('relationship_recaps')
        .insert({ ...recapRow, workspace_id, funnel_item_id: null });
      
      if (insertErr) {
        console.error('[generate-relationship-recap] Insert error (workspace):', insertErr);
      }
    } else if (funnel_item_id) {
      // Delete existing recap for this funnel_item+language
      await supabase
        .from('relationship_recaps')
        .delete()
        .eq('funnel_item_id', funnel_item_id)
        .eq('language', language);
      
      const { error: insertErr } = await supabase
        .from('relationship_recaps')
        .insert({ ...recapRow, workspace_id: null, funnel_item_id });
      
      if (insertErr) {
        console.error('[generate-relationship-recap] Insert error (funnel):', insertErr);
      }
    }

    console.log('[generate-relationship-recap] Complete for:', funnel_item_id || workspace_id);

    return corsJsonResponse({
      ...recap,
      items_analyzed: activities.length,
    }, req, 200);
  } catch (err) {
    console.error('[generate-relationship-recap] Error:', err);
    return corsJsonResponse({ error: 'An unexpected error occurred. Please try again.' }, req, 500);
  }
});
