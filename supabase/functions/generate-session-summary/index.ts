import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCorsOptions, corsJsonResponse } from '../_shared/cors.ts';

interface GenerateSummaryRequest {
  sessionId: string;
  transcript?: string;
}

interface ActionSuggestion {
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  suggestedOwner?: string;
  suggestedDueInDays?: number;
}

interface KpiPrompt {
  kpiName: string;
  reason: string;
  suggestedAction: string;
}

/**
 * Validates the request payload
 */
function validateRequest(payload: unknown): { valid: true; data: GenerateSummaryRequest } | { valid: false; error: string } {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Invalid request body' };
  }
  
  const data = payload as Record<string, unknown>;
  
  // Validate sessionId is a UUID
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!data.sessionId || typeof data.sessionId !== 'string' || !uuidRegex.test(data.sessionId)) {
    return { valid: false, error: 'Invalid session ID format' };
  }
  
  // Validate transcript if provided (max 100KB)
  if (data.transcript !== undefined) {
    if (typeof data.transcript !== 'string') {
      return { valid: false, error: 'Transcript must be a string' };
    }
    if (data.transcript.length > 100000) {
      return { valid: false, error: 'Transcript exceeds maximum length (100KB)' };
    }
  }
  
  return {
    valid: true,
    data: {
      sessionId: data.sessionId,
      transcript: data.transcript as string | undefined,
    },
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return handleCorsOptions(req);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return corsJsonResponse({ error: "No authorization header" }, req, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    if (!lovableApiKey) {
      return corsJsonResponse({ error: "AI service not configured" }, req, 500);
    }

    // Create client with user's auth to validate access
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return corsJsonResponse({ error: "Unauthorized" }, req, 401);
    }

    // Parse and validate request body
    let rawPayload: unknown;
    try {
      rawPayload = await req.json();
    } catch {
      return corsJsonResponse({ error: "Invalid JSON body" }, req, 400);
    }
    
    const validation = validateRequest(rawPayload);
    if (!validation.valid) {
      return corsJsonResponse({ error: validation.error }, req, 400);
    }
    
    const { sessionId, transcript } = validation.data;

    // Use service role to fetch session and validate access
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch session with workspace info
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("sessions")
      .select(`
        id, workspace_id, title, agenda, notes, decisions, raw_transcript,
        workspace:workspaces(
          id, stage,
          startup:startups(name)
        )
      `)
      .eq("id", sessionId)
      .single();

    if (sessionError || !session) {
      console.error("Session fetch error:", sessionError);
      return corsJsonResponse({ error: "Session not found" }, req, 404);
    }

    // Check workspace access using user's client
    const { data: hasAccess } = await supabaseUser.rpc("has_workspace_access", {
      _workspace_id: session.workspace_id,
    });

    if (!hasAccess) {
      return corsJsonResponse({ error: "Access denied to this workspace" }, req, 403);
    }

    // Prepare content for AI analysis
    let storedTranscript: string | null = session.raw_transcript ?? null;
    if (!transcript && !storedTranscript) {
      // O resumo fica em sessions.ai_summary (lido por todos os membros): só o tier 'workspace' o pode alimentar.
      const { data: tRow } = await supabaseUser
        .from("session_transcripts").select("transcript_text")
        .eq("session_id", sessionId)
        .eq("confidentiality", "workspace")
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      storedTranscript = tRow?.transcript_text ?? null;
    }
    const contentToAnalyze = transcript || storedTranscript || session.notes || session.agenda || "";
    
    if (!contentToAnalyze.trim()) {
      return corsJsonResponse({ error: "No content to analyze. Please add notes, transcript, or agenda first." }, req, 400);
    }

    const startupName = (session.workspace as any)?.startup?.name || "the startup";
    const stage = (session.workspace as any)?.stage || "unknown";

    // Call Lovable AI Gateway
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert startup mentor assistant analyzing meeting notes for ${startupName}, currently in the ${stage} stage.

Your task is to extract structured insights from meeting content. Always respond with valid JSON.

Extract:
1. A concise executive summary (2-3 paragraphs)
2. Key decisions made (array of strings)
3. Risks or concerns identified (array of objects with "risk" and "severity" fields, severity: low/medium/high)
4. Suggested action items (array of objects with "title", "description", "priority", "suggestedDueInDays" fields)
5. KPIs that should be tracked or updated (array of objects with "kpiName", "reason", "suggestedAction" fields)

Respond ONLY with this JSON structure:
{
  "summary": "string",
  "decisions": ["string"],
  "risks": [{"risk": "string", "severity": "low|medium|high"}],
  "actionSuggestions": [{"title": "string", "description": "string", "priority": "low|medium|high|urgent", "suggestedDueInDays": number}],
  "kpiPrompts": [{"kpiName": "string", "reason": "string", "suggestedAction": "string"}]
}`,
          },
          {
            role: "user",
            content: `Meeting: ${session.title}\n\nContent to analyze:\n${contentToAnalyze}`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI Gateway error:", aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return corsJsonResponse({ error: "AI rate limit exceeded. Please try again later." }, req, 429);
      }
      if (aiResponse.status === 402) {
        return corsJsonResponse({ error: "AI credits exhausted. Please add credits." }, req, 402);
      }
      
      return corsJsonResponse({ error: "AI service error" }, req, 500);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    if (!aiContent) {
      return corsJsonResponse({ error: "No response from AI" }, req, 500);
    }

    let parsedOutput;
    try {
      parsedOutput = JSON.parse(aiContent);
    } catch (e) {
      console.error("Failed to parse AI response:", aiContent);
      return corsJsonResponse({ error: "Failed to parse AI response" }, req, 500);
    }

    // Store transcript if provided
    const updateData: Record<string, any> = {
      ai_summary: parsedOutput.summary || null,
      ai_decisions: parsedOutput.decisions || [],
      ai_risks: parsedOutput.risks || [],
      ai_action_suggestions: parsedOutput.actionSuggestions || [],
      ai_kpi_prompts: parsedOutput.kpiPrompts || [],
      ai_generated_at: new Date().toISOString(),
      ai_generated_by: user.id,
    };

    if (transcript) {
      updateData.raw_transcript = transcript;
      updateData.source = "teams_import";
    }

    // Update session with AI outputs
    const { error: updateError } = await supabaseAdmin
      .from("sessions")
      .update(updateData)
      .eq("id", sessionId);

    if (updateError) {
      console.error("Failed to update session:", updateError);
      return corsJsonResponse({ error: "Failed to save AI outputs" }, req, 500);
    }

    // Log activity
    await supabaseAdmin.from("activity_log").insert({
      user_id: user.id,
      workspace_id: session.workspace_id,
      entity_type: "session",
      entity_id: sessionId,
      action: "ai_summary_generated",
      metadata: { sessionTitle: session.title },
    });

    console.log("AI summary generated for session:", sessionId);

    return corsJsonResponse({
      success: true,
      summary: parsedOutput.summary,
      decisions: parsedOutput.decisions,
      risks: parsedOutput.risks,
      actionSuggestions: parsedOutput.actionSuggestions,
      kpiPrompts: parsedOutput.kpiPrompts,
    }, req);
  } catch (error: unknown) {
    // Log full error server-side for debugging
    console.error("Error in generate-session-summary:", error instanceof Error ? error.message : error);
    // Return sanitized error to client
    return corsJsonResponse({ error: "Internal server error" }, req, 500);
  }
});
