// Smart Import: extract structured workspace data from a pitch deck / business plan PDF.
// - Accepts base64 PDF (max ~15MB)
// - Extracts text with `unpdf` (Deno-compatible)
// - Calls Lovable AI Gateway with tool calling for structured output
// - Returns JSON; NO database writes (review-and-approve happens client-side)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_PDF_BYTES = 15 * 1024 * 1024; // 15MB
const MAX_TEXT_CHARS = 60_000; // cap context sent to LLM

function base64ToUint8(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.split(",")[1] : b64;
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnon, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const fileBase64: string | undefined = body.file_base64;
    const fileName: string | undefined = body.file_name;
    const language: string = body.language === "en" ? "en" : "pt";

    if (!fileBase64) {
      return new Response(JSON.stringify({ error: "file_base64 is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pdfBytes = base64ToUint8(fileBase64);
    if (pdfBytes.length > MAX_PDF_BYTES) {
      return new Response(JSON.stringify({ error: "PDF too large (max 15MB)" }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Extract text from PDF
    let extracted = "";
    let pageCount = 0;
    try {
      const pdf = await getDocumentProxy(pdfBytes);
      pageCount = pdf.numPages;
      const result = await extractText(pdf, { mergePages: true });
      extracted = (typeof result.text === "string" ? result.text : (result.text || []).join("\n\n")).trim();
    } catch (e) {
      console.error("PDF parse failed:", e);
      return new Response(JSON.stringify({ error: "Could not parse PDF. Make sure it is a text-based (not scanned image) PDF." }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!extracted || extracted.length < 80) {
      return new Response(JSON.stringify({
        error: "No text found in this PDF. It may be a scanned image — please upload a text-based PDF.",
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (extracted.length > MAX_TEXT_CHARS) {
      extracted = extracted.slice(0, MAX_TEXT_CHARS) + "\n\n[...truncated]";
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lang = language === "en" ? "English" : "Portuguese (PT-PT)";

    const systemPrompt = `You are an expert startup analyst. Extract structured information from a pitch deck or business plan PDF for an incubator workspace. Return ONLY data that is explicitly stated or strongly implied. Do NOT invent information. If a field is unknown, omit it entirely. All free-text values (descriptions, notes, sectors) must be written in ${lang}.

Stage mapping (pick the closest, only if clearly indicated):
- ideation: idea phase, no product
- validation: discovery / customer interviews, no MVP
- mvp: MVP built, early users
- growth: paying customers, growing revenue
- scale: profitable / scaling

KPI conventions: monthly periods. Use ISO YYYY-MM-01 for period_month. Common KPIs to extract when mentioned: MRR (€), ARR (€), Active Users (count), Paying Customers (count), Monthly Revenue (€), CAC (€), LTV (€), Churn Rate (%), Burn Rate (€), Runway (months).

Every extracted item must include a short verbatim "evidence" snippet (max 180 chars) from the document supporting it.`;

    const userPrompt = `Document: ${fileName || "uploaded.pdf"} (${pageCount} pages)

--- BEGIN DOCUMENT TEXT ---
${extracted}
--- END DOCUMENT TEXT ---

Call the function 'extract_workspace_data' with everything you can confidently extract.`;

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_workspace_data",
              description: "Return structured startup workspace data extracted from the document.",
              parameters: {
                type: "object",
                properties: {
                  startup: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      description: { type: "string", description: "1–3 sentence summary of what the startup does" },
                      website: { type: "string" },
                      sector: { type: "string", description: "Industry/sector (e.g. healthtech, fintech)" },
                      founded_date: { type: "string", description: "ISO date YYYY-MM-DD if known" },
                      stage: { type: "string", enum: ["ideation", "validation", "mvp", "growth", "scale"] },
                      address: { type: "string" },
                      nif: { type: "string", description: "Portuguese tax ID if mentioned" },
                      main_contact_name: { type: "string" },
                      main_contact_email: { type: "string" },
                      main_contact_phone: { type: "string" },
                      evidence: { type: "string" },
                    },
                  },
                  team_members: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        full_name: { type: "string" },
                        title: { type: "string", description: "e.g. CEO, CTO, Co-founder" },
                        email: { type: "string" },
                        linkedin_url: { type: "string" },
                        is_founder: { type: "boolean" },
                        evidence: { type: "string" },
                      },
                      required: ["full_name"],
                    },
                  },
                  funding_rounds: {
                    type: "array",
                    description: "Money raised or actively being raised. Only include if explicitly stated.",
                    items: {
                      type: "object",
                      properties: {
                        round_type: { type: "string", description: "e.g. pre-seed, seed, series-a, grant, bootstrap, angel" },
                        raised_amount: { type: "number", description: "Total raised in EUR (convert if needed)" },
                        target_amount: { type: "number", description: "Amount currently being raised in EUR" },
                        valuation: { type: "number", description: "Valuation in EUR" },
                        status: { type: "string", enum: ["planning", "open", "closed"] },
                        announced_at: { type: "string", description: "ISO YYYY-MM-DD" },
                        notes: { type: "string" },
                        evidence: { type: "string" },
                      },
                      required: ["round_type"],
                    },
                  },
                  kpis: {
                    type: "array",
                    description: "Latest known metric values. Only include numbers explicitly stated.",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Standardized KPI name (e.g. MRR, Active Users)" },
                        value: { type: "number" },
                        unit: { type: "string", description: "EUR, USD, %, count, months" },
                        period_month: { type: "string", description: "ISO YYYY-MM-01 for the month this value refers to" },
                        notes: { type: "string" },
                        evidence: { type: "string" },
                      },
                      required: ["name", "value"],
                    },
                  },
                  notes: { type: "string", description: "Optional general notes about uncertainty or things worth a human review." },
                },
                required: ["startup"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_workspace_data" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI extraction failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    let extraction: any = null;
    if (toolCall?.function?.arguments) {
      try { extraction = JSON.parse(toolCall.function.arguments); } catch (e) {
        console.error("tool args parse failed", e);
      }
    }
    if (!extraction) {
      return new Response(JSON.stringify({ error: "Could not extract structured data from this document." }), {
        status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      extraction,
      meta: { page_count: pageCount, text_chars: extracted.length, file_name: fileName || null },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("smart-import-pdf error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
