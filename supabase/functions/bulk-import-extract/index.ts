// Bulk Contract Import — AI extraction edge function
// Reads a PDF from storage, asks Lovable AI (Gemini) to extract structured contract data,
// matches against existing startups by NIF then name, and updates the row.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    contract_number: { type: "string", description: "Contract number / referência (e.g. INC-2024-001)" },
    signed_at: { type: "string", description: "Signature date in YYYY-MM-DD format" },
    start_date: { type: "string", description: "Contract start date YYYY-MM-DD" },
    end_date: { type: "string", description: "Contract end date YYYY-MM-DD" },
    status: { type: "string", enum: ["draft", "sent", "signed", "active", "terminated"], description: "Current contract status" },
    typology_name: { type: "string", description: "Service typology e.g. 'Incubação Física', 'Incubação Virtual', 'Aceleração'" },
    monthly_fee: { type: "number", description: "Monthly fee in EUR" },
    discount_percentage: { type: "number" },
    square_meters: { type: "number" },
    space_code: { type: "string", description: "Space/office code if present" },
    startup_name: { type: "string", description: "Company / startup legal name" },
    nif: { type: "string", description: "Portuguese NIF (9 digits)" },
    address: { type: "string" },
    postal_code: { type: "string" },
    city: { type: "string" },
    main_contact_name: { type: "string" },
    main_contact_email: { type: "string" },
    main_contact_phone: { type: "string" },
    legal_representative_name: { type: "string" },
    legal_representative_email: { type: "string" },
    notes: { type: "string", description: "Any extra terms, observations, or special clauses" },
    confidence: { type: "number", description: "Your confidence 0-1 in this extraction" },
  },
  required: ["startup_name", "confidence"],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You are an expert contract data extractor for Startup Leiria (a Portuguese startup incubator).
You will be given a signed contract PDF (in Portuguese or English).
Extract every available field with high accuracy.
- Dates MUST be ISO format YYYY-MM-DD. If only month/year is shown, use the 1st of that month.
- NIF must be exactly 9 digits, no spaces.
- monthly_fee is the recurring monthly amount in EUR (number only, no currency symbol).
- If the contract is clearly active and signed, status="active". If signed but not yet started, "signed". If terminated, "terminated".
- typology_name should match common Startup Leiria typologies: "Incubação Física", "Incubação Virtual", "Pré-Incubação", "Aceleração", "Coworking", "Sala Privada", "Espaço Partilhado", or similar.
- confidence: 0-1 reflecting your overall certainty. Below 0.6 means staff must review carefully.
- If a field is genuinely absent from the PDF, omit it (do not invent).`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) return jsonResponse({ error: "LOVABLE_API_KEY missing" }, 500);

    // Auth check — admin only
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return jsonResponse({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: isAdminData } = await admin.rpc("is_admin", { _user_id: userData.user.id }) as { data: boolean | null };
    // Fallback: also try has_role since is_admin RPC may not be exposed
    let isAdmin = !!isAdminData;
    if (!isAdmin) {
      const { data: roleRow } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "admin")
        .maybeSingle();
      isAdmin = !!roleRow;
    }
    if (!isAdmin) return jsonResponse({ error: "Forbidden" }, 403);

    const body = await req.json();
    const rowId = body?.row_id as string | undefined;
    if (!rowId) return jsonResponse({ error: "row_id required" }, 400);

    // Fetch row
    const { data: row, error: rowErr } = await admin
      .from("bulk_import_rows")
      .select("*")
      .eq("id", rowId)
      .single();
    if (rowErr || !row) return jsonResponse({ error: "Row not found" }, 404);

    await admin.from("bulk_import_rows").update({ status: "extracting" }).eq("id", rowId);

    // Download PDF from storage
    const { data: fileData, error: dlErr } = await admin.storage
      .from("contract-imports")
      .download(row.pdf_path);

    if (dlErr || !fileData) {
      await admin.from("bulk_import_rows").update({
        status: "error",
        error_message: `Download failed: ${dlErr?.message || "unknown"}`,
      }).eq("id", rowId);
      return jsonResponse({ error: "Download failed" }, 500);
    }

    // Server-side validation: size and type. Defense-in-depth (clients already filter).
    const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB
    const detectedType = (fileData as Blob).type || "";
    const isPdfByName = String(row.pdf_filename || "").toLowerCase().endsWith(".pdf");
    if (detectedType && !detectedType.includes("pdf") && !isPdfByName) {
      await admin.from("bulk_import_rows").update({
        status: "error",
        error_message: `Unsupported file type: ${detectedType || "unknown"} (expected PDF)`,
      }).eq("id", rowId);
      return jsonResponse({ error: "Unsupported file type" }, 400);
    }
    if ((fileData as Blob).size > MAX_PDF_BYTES) {
      await admin.from("bulk_import_rows").update({
        status: "error",
        error_message: `PDF too large (${((fileData as Blob).size / 1024 / 1024).toFixed(1)} MB). Max 20 MB.`,
      }).eq("id", rowId);
      return jsonResponse({ error: "PDF too large" }, 413);
    }

    const arrayBuffer = await fileData.arrayBuffer();
    // Convert to base64 in chunks (avoid stack overflow on large files)
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunkSize = 32768;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    // Call Lovable AI Gateway with PDF inline
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: `Extract structured data from this contract PDF. Filename hint: ${row.pdf_filename}` },
              { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "save_contract_data",
              description: "Save extracted contract data",
              parameters: EXTRACTION_SCHEMA,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "save_contract_data" } },
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      const status = aiResponse.status;
      const friendly =
        status === 429 ? "AI rate limit reached, try again later" :
        status === 402 ? "AI credits exhausted, add funds in Settings → Workspace → Usage" :
        `AI gateway error ${status}`;
      await admin.from("bulk_import_rows").update({
        status: "error",
        error_message: `${friendly}: ${errText.substring(0, 300)}`,
      }).eq("id", rowId);
      return jsonResponse({ error: friendly }, status);
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      await admin.from("bulk_import_rows").update({
        status: "error",
        error_message: "AI did not return structured data",
      }).eq("id", rowId);
      return jsonResponse({ error: "AI returned no tool call" }, 500);
    }

    let extracted: Record<string, unknown>;
    try {
      extracted = JSON.parse(toolCall.function.arguments);
    } catch {
      await admin.from("bulk_import_rows").update({
        status: "error",
        error_message: "AI returned invalid JSON",
      }).eq("id", rowId);
      return jsonResponse({ error: "Invalid AI JSON" }, 500);
    }

    // Match against existing startups
    let matchedStartupId: string | null = null;
    let matchedWorkspaceId: string | null = null;
    let matchMethod: string | null = null;
    const nif = String(extracted.nif || "").replace(/\D/g, "").trim();
    const name = String(extracted.startup_name || "").trim();

    if (nif && nif.length === 9) {
      const { data: byNif } = await admin
        .from("startups")
        .select("id")
        .eq("nif", nif)
        .maybeSingle();
      if (byNif) {
        matchedStartupId = byNif.id;
        matchMethod = "nif";
      }
    }
    if (!matchedStartupId && name) {
      const { data: byName } = await admin
        .from("startups")
        .select("id")
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
      if (byName) {
        matchedStartupId = byName.id;
        matchMethod = "name";
      }
    }
    if (matchedStartupId) {
      const { data: ws } = await admin
        .from("workspaces")
        .select("id")
        .eq("startup_id", matchedStartupId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (ws) matchedWorkspaceId = ws.id;
    }

    const finalStatus = matchedStartupId ? "will_update" : "will_create";
    const confidence = typeof extracted.confidence === "number" ? extracted.confidence : null;

    await admin.from("bulk_import_rows").update({
      extracted_json: extracted,
      edited_json: extracted,
      matched_startup_id: matchedStartupId,
      matched_workspace_id: matchedWorkspaceId,
      match_method: matchMethod,
      ai_confidence: confidence,
      status: finalStatus,
      error_message: null,
    }).eq("id", rowId);

    // Bump batch counter
    // (Removed bogus admin.rpc("update_updated_at_column") — that is a trigger function, not a callable RPC.)
    const { data: batchRow } = await admin
      .from("bulk_import_rows")
      .select("batch_id")
      .eq("id", rowId)
      .single();
    if (batchRow) {
      const { count } = await admin
        .from("bulk_import_rows")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", batchRow.batch_id)
        .in("status", ["will_create", "will_update", "error", "skipped"]);
      await admin.from("bulk_import_batches").update({
        extracted_count: count || 0,
      }).eq("id", batchRow.batch_id);
    }

    return jsonResponse({ success: true, extracted, matched_startup_id: matchedStartupId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("bulk-import-extract error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
