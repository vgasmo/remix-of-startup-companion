import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';
import { timingSafeEqual } from '../_shared/security.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    // Auth: cron OR authenticated user
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedCron = Deno.env.get('CRON_SECRET');
    const isCron = !!cronSecret && !!expectedCron && timingSafeEqual(cronSecret, expectedCron);

    const authHeader = req.headers.get('Authorization');
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    let userId: string | null = null;
    if (!isCron) {
      if (!authHeader) {
        return corsJsonResponse({ error: 'Authorization required' }, req, 401);
      }
      const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
      if (userError || !user) {
        return corsJsonResponse({ error: 'Invalid token' }, req, 401);
      }
      userId = user.id;
    }

    const { session_id } = await req.json();
    if (!session_id) {
      return corsJsonResponse({ error: 'session_id is required' }, req, 400);
    }

    // Get session with workspace access check
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sessions')
      .select('id, workspace_id, title, notes, agenda')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return corsJsonResponse({ error: 'Session not found' }, req, 404);
    }

    if (!isCron && userId) {
      const { data: hasAccess } = await supabaseAdmin.rpc('has_workspace_access', {
        _user_id: userId,
        _workspace_id: session.workspace_id
      });
      if (!hasAccess) {
        return corsJsonResponse({ error: 'Access denied' }, req, 403);
      }
    }

    // Get transcript if available
    const { data: transcript } = await supabaseAdmin
      .from('session_transcripts')
      .select('transcript_text')
      .eq('session_id', session_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const contentToAnalyze = transcript?.transcript_text || session.notes || session.agenda || '';

    if (!contentToAnalyze || contentToAnalyze.length < 50) {
      return corsJsonResponse({ error: 'Insufficient content to analyze' }, req, 400);
    }

    // Check rate limit (skip for cron invocations)
    if (!isCron && userId) {
      const { data: canProceed } = await supabaseAdmin.rpc('check_ai_rate_limit', {
        _user_id: userId,
        _workspace_id: session.workspace_id,
        _function_name: 'generate-session-artifacts',
        _max_requests: 10
      });

      if (!canProceed) {
        return corsJsonResponse({ error: 'Rate limit exceeded. Please try again later.' }, req, 429);
      }
    }

    let artifacts = {
      summary: '',
      decisions: [] as string[],
      action_items: [] as Array<{ title: string; owner?: string; due_date?: string }>,
      risks: [] as string[],
      next_steps: [] as string[],
    };

    // Call AI API
    if (lovableApiKey) {
      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${lovableApiKey}`,
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'system',
                content: `You are a meeting analyst for a startup incubator. Extract structured insights from meeting content.
                
Return a JSON object with:
- summary: 2-3 sentence executive summary
- decisions: array of decisions made
- action_items: array of {title, owner (if mentioned), due_date (if mentioned, in YYYY-MM-DD format)}
- risks: any concerns or risks discussed
- next_steps: agreed next steps

Be concise and actionable. Focus on startup progress, mentor advice, and founder commitments.`
              },
              {
                role: 'user',
                content: `Analyze this meeting content and extract structured insights:\n\n${contentToAnalyze.substring(0, 8000)}`
              }
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' }
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const content = aiData.choices?.[0]?.message?.content;
          if (content) {
            try {
              artifacts = JSON.parse(content);
            } catch {
              console.error('Failed to parse AI response as JSON');
            }
          }
        }
      } catch (aiError) {
        console.error('AI API error:', aiError);
      }
    }

    // Update session with summary
    if (artifacts.summary) {
      await supabaseAdmin
        .from('sessions')
        .update({ 
          summary: artifacts.summary,
          updated_at: new Date().toISOString()
        })
        .eq('id', session_id);
    }

    // Create action items
    const createdActions = [];
    for (const item of artifacts.action_items) {
      const { data: action, error: actionError } = await supabaseAdmin
        .from('action_items')
        .insert({
          workspace_id: session.workspace_id,
          session_id: session_id,
          title: item.title,
          due_date: item.due_date || null,
          status: 'pending',
          created_by: userId,
        })
        .select('id, title')
        .single();

      if (!actionError && action) {
        createdActions.push(action);
      }
    }

    // Log activity
    await supabaseAdmin.from('activity_log').insert({
      workspace_id: session.workspace_id,
      user_id: userId,
      entity_type: 'session',
      entity_id: session_id,
      action: 'artifacts_generated',
      metadata: {
        summary_length: artifacts.summary.length,
        decisions_count: artifacts.decisions.length,
        actions_created: createdActions.length,
        risks_count: artifacts.risks.length,
      },
    });

    return corsJsonResponse({
      success: true,
      artifacts: {
        summary: artifacts.summary,
        decisions: artifacts.decisions,
        risks: artifacts.risks,
        next_steps: artifacts.next_steps,
      },
      actions_created: createdActions,
    }, req);

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Generate session artifacts error:', errorMessage);
    return corsJsonResponse({ error: 'Internal server error' }, req, 500);
  }
});
