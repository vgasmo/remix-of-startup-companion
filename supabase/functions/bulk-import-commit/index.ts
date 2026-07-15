// Bulk Contract Import — commit edge function
// Processes selected rows: creates/updates startups, workspaces, contracts.
// Pricing is snapshotted from edited_json (immutability rule).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ExtractedData {
  contract_number?: string;
  signed_at?: string;
  start_date?: string;
  end_date?: string;
  status?: string;
  typology_name?: string;
  monthly_fee?: number;
  discount_percentage?: number;
  square_meters?: number;
  space_code?: string;
  startup_name?: string;
  nif?: string;
  address?: string;
  postal_code?: string;
  city?: string;
  main_contact_name?: string;
  main_contact_email?: string;
  main_contact_phone?: string;
  legal_representative_name?: string;
  legal_representative_email?: string;
  notes?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse({ error: "Missing authorization" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    if (!userData?.user) return jsonResponse({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleRow) return jsonResponse({ error: "Forbidden" }, 403);

    const body = await req.json();
    const batchId = body?.batch_id as string | undefined;
    const overwriteExisting = body?.overwrite_existing === true; // admin opt-in
    if (!batchId) return jsonResponse({ error: "batch_id required" }, 400);

    // Batch must have a programme assigned (no orphan workspaces).
    const { data: batch, error: batchErr } = await admin
      .from("bulk_import_batches")
      .select("id, program_id")
      .eq("id", batchId)
      .single();
    if (batchErr || !batch) return jsonResponse({ error: "Batch not found" }, 404);
    if (!batch.program_id) {
      return jsonResponse({
        error: "program_required",
        message: "This batch has no programme assigned. Pick a programme on the upload screen before committing.",
      }, 400);
    }
    const batchProgramId = batch.program_id as string;

    await admin.from("bulk_import_batches").update({ status: "committing" }).eq("id", batchId);

    // Fetch all selected, ready-to-commit rows
    const { data: rows, error: rowsErr } = await admin
      .from("bulk_import_rows")
      .select("*")
      .eq("batch_id", batchId)
      .eq("selected", true)
      .in("status", ["will_create", "will_update"]);

    if (rowsErr) return jsonResponse({ error: rowsErr.message }, 500);

    // Fetch typologies for matching
    const { data: typologies } = await admin
      .from("incubation_types")
      .select("id, name");
    const typologyByName = new Map<string, string>();
    (typologies || []).forEach(t => typologyByName.set(String(t.name).toLowerCase().trim(), t.id));

    let committedCount = 0;
    let failedCount = 0;
    const errors: { row_id: string; error: string }[] = [];

    for (const row of rows || []) {
      try {
        const data = (row.edited_json || row.extracted_json) as ExtractedData;
        if (!data?.startup_name?.trim()) {
          throw new Error("startup_name is required");
        }

        // 1) Resolve or create startup
        let startupId = row.matched_startup_id as string | null;
        const nif = (data.nif || "").replace(/\D/g, "").trim() || null;

        if (startupId) {
          // Update existing — by default only fill missing fields, never overwrite
          // non-null with null. Admin can opt in to overwrite via overwrite_existing.
          const { data: existing } = await admin
            .from("startups")
            .select("nif, address, main_contact_name, main_contact_email, main_contact_phone")
            .eq("id", startupId)
            .maybeSingle();
          const updates: Record<string, unknown> = {};
          const fillIfEmpty = (col: string, incoming: unknown) => {
            const current = existing ? (existing as Record<string, unknown>)[col] : null;
            const isEmpty = current === null || current === undefined || current === "";
            if (incoming && (isEmpty || overwriteExisting)) updates[col] = incoming;
          };
          fillIfEmpty("nif", nif);
          fillIfEmpty("address", data.address);
          fillIfEmpty("main_contact_name", data.main_contact_name);
          fillIfEmpty("main_contact_email", data.main_contact_email);
          fillIfEmpty("main_contact_phone", data.main_contact_phone);
          if (Object.keys(updates).length > 0) {
            await admin.from("startups").update(updates).eq("id", startupId);
          }
        } else {
          const { data: newStartup, error: createErr } = await admin
            .from("startups")
            .insert({
              name: data.startup_name.trim(),
              nif,
              address: data.address || null,
              main_contact_name: data.main_contact_name || null,
              main_contact_email: data.main_contact_email || null,
              main_contact_phone: data.main_contact_phone || null,
            })
            .select("id")
            .single();
          if (createErr || !newStartup) throw new Error(`Startup create failed: ${createErr?.message}`);
          startupId = newStartup.id;
        }

        // 2) Resolve or create workspace — programme is REQUIRED.
        let workspaceId = row.matched_workspace_id as string | null;
        if (!workspaceId) {
          const { data: newWs, error: wsErr } = await admin
            .from("workspaces")
            .insert({
              startup_id: startupId,
              program_id: batchProgramId, // never orphan
              status: "imported_unclaimed",
              needs_onboarding: false, // historical contract — already onboarded
              stage: "ideation",
            })
            .select("id")
            .single();
          if (wsErr || !newWs) throw new Error(`Workspace create failed: ${wsErr?.message}`);
          workspaceId = newWs.id;
        } else {
          // If matched workspace has no programme, attach the batch programme
          // so we never end up with orphan workspaces post-import.
          const { data: ws } = await admin
            .from("workspaces")
            .select("program_id")
            .eq("id", workspaceId)
            .maybeSingle();
          if (ws && !ws.program_id) {
            await admin.from("workspaces").update({ program_id: batchProgramId }).eq("id", workspaceId);
          }
        }

        // 3) Resolve typology
        let incubationTypeId: string | null = null;
        if (data.typology_name) {
          const key = data.typology_name.toLowerCase().trim();
          incubationTypeId = typologyByName.get(key) || null;
          // Fuzzy fallback: contains
          if (!incubationTypeId) {
            for (const [k, v] of typologyByName) {
              if (k.includes(key) || key.includes(k)) { incubationTypeId = v; break; }
            }
          }
        }

        // 4) Build pricing snapshot
        const pricingSnapshot = {
          source: "bulk_import",
          imported_at: new Date().toISOString(),
          typology_name: data.typology_name || null,
          monthly_fee: data.monthly_fee ?? null,
          discount_percentage: data.discount_percentage ?? null,
          square_meters: data.square_meters ?? null,
          currency: "EUR",
        };

        // 5) Create or update contract — idempotent on (workspace_id, contract_number)
        const contractStatus = normalizeStatus(data.status) || "active";
        const signedAt = parseDate(data.signed_at);
        const startDate = parseDate(data.start_date);
        const endDate = parseDate(data.end_date);

        // Store the canonical PRIVATE storage path. Never persist a fake public
        // URL — the contract-imports bucket is private and access is via signed URLs.
        // We mirror the same path into `document_url` so existing flows
        // (SharePoint archival, contract readiness/preview UI) keep working
        // unchanged. Both columns hold the SAME private storage path string;
        // consumers must call createSignedUrl on the appropriate bucket to read it.
        const contractPdfPath = row.pdf_path as string;
        const documentUrl = contractPdfPath; // private storage path, NOT a public URL
        // Bucket hint for downstream consumers — bulk-imported PDFs live in
        // `contract-imports`, while manually-uploaded contracts live in
        // `contract-documents`. We tag the source for clarity.
        const pdfBucket = "contract-imports";

        const contractPayload = {
          workspace_id: workspaceId,
          incubation_type_id: incubationTypeId,
          contract_number: data.contract_number || null,
          status: contractStatus,
          start_date: startDate,
          end_date: endDate,
          signed_at: signedAt,
          monthly_fee: data.monthly_fee ?? null,
          currency: "EUR",
          discount_percentage: data.discount_percentage ?? null,
          square_meters: data.square_meters ?? null,
          pricing_snapshot_json: { ...pricingSnapshot, pdf_bucket: pdfBucket },
          company_nif: nif,
          company_address: data.address || null,
          company_postal_code: data.postal_code || null,
          company_city: data.city || null,
          company_country: "Portugal",
          legal_representative_name: data.legal_representative_name || null,
          legal_representative_email: data.legal_representative_email || null,
          notes: combineNotes(data.notes, `Bulk imported from PDF: ${row.pdf_filename}`),
          contract_pdf_path: contractPdfPath,
          document_url: documentUrl,
          created_by: userData.user.id,
        };

        // Idempotency: if the same contract_number already exists for this
        // workspace, link/update instead of creating a duplicate.
        let contractId: string | null = null;
        if (data.contract_number) {
          const { data: existing } = await admin
            .from("startup_contracts")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("contract_number", data.contract_number)
            .maybeSingle();
          if (existing?.id) {
            contractId = existing.id;
            // Always refresh the PDF path; only overwrite full payload on admin opt-in
            const updatePayload = overwriteExisting
              ? contractPayload
              : { contract_pdf_path: contractPdfPath, document_url: documentUrl, pricing_snapshot_json: { ...pricingSnapshot, pdf_bucket: pdfBucket } };
            const { error: upErr } = await admin
              .from("startup_contracts")
              .update(updatePayload)
              .eq("id", contractId);
            if (upErr) throw new Error(`Contract update failed: ${upErr.message}`);
          }
        }
        if (!contractId) {
          const { data: newContract, error: cErr } = await admin
            .from("startup_contracts")
            .insert(contractPayload)
            .select("id")
            .single();
          if (cErr || !newContract) throw new Error(`Contract create failed: ${cErr?.message}`);
          contractId = newContract.id;
        }

        await admin.from("bulk_import_rows").update({
          status: "committed",
          created_contract_id: contractId,
          matched_startup_id: startupId,
          matched_workspace_id: workspaceId,
          error_message: null,
        }).eq("id", row.id);

        committedCount++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        failedCount++;
        errors.push({ row_id: row.id, error: msg });
        await admin.from("bulk_import_rows").update({
          status: "error",
          error_message: msg,
        }).eq("id", row.id);
      }
    }

    await admin.from("bulk_import_batches").update({
      status: "completed",
      committed_count: committedCount,
      failed_count: failedCount,
      completed_at: new Date().toISOString(),
    }).eq("id", batchId);

    return jsonResponse({
      success: true,
      committed: committedCount,
      failed: failedCount,
      errors,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("bulk-import-commit error:", msg);
    return jsonResponse({ error: msg }, 500);
  }
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function parseDate(s?: string): string | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

// Map the AI extractor's vocabulary to the DB CHECK vocabulary
// (startup_contracts.status allows: draft|pending_signature|active|suspended|terminated|expired).
function normalizeStatus(s?: string): string | null {
  if (!s) return null;
  const v = s.toLowerCase().trim();
  if (["draft", "rascunho"].includes(v)) return "draft";
  if (["sent", "enviado", "pending_signature", "pending", "awaiting_signature"].includes(v)) return "pending_signature";
  if (["signed", "assinado", "active", "ativo", "em vigor"].includes(v)) return "active";
  if (["suspended", "suspenso"].includes(v)) return "suspended";
  if (["terminated", "terminado", "cessado"].includes(v)) return "terminated";
  if (["expired", "expirado", "caducado"].includes(v)) return "expired";
  return "draft"; // safe fallback rather than a value the CHECK rejects
}

function combineNotes(...parts: (string | null | undefined)[]): string | null {
  const filtered = parts.filter((p) => p && String(p).trim().length > 0);
  return filtered.length ? filtered.join("\n\n---\n") : null;
}
