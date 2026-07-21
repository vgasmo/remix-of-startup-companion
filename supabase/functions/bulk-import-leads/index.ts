/**
 * bulk-import-leads — server-side CSV import for CRM leads
 *
 * Two phases:
 *   mode='stage'  → parse CSV server-side (quoted-field aware), validate rows,
 *                   dedupe by row_hash, insert into crm_lead_import_rows,
 *                   return preview + batch_id.
 *   mode='commit' → apply staged rows (idempotent per (batch_id, row_hash))
 *                   into funnel_items; skip already-committed rows.
 *
 * Only admins and consultors can invoke.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.1";
import { handleCorsOptions, corsJsonResponse } from "../_shared/cors.ts";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_ROWS = 5000;

interface ParsedRow {
  row_index: number;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  organization_name: string;
  source: string;
  notes: string;
  deal_value: number | null;
}

/** RFC 4180-style CSV line splitter with quoted-field support. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ""; i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ""; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim().length > 0));
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function pickColumn(headers: string[], candidates: string[]): number {
  const norm = headers.map((h) => h.trim().toLowerCase().replace(/^["']|["']$/g, ""));
  for (const c of candidates) {
    const idx = norm.indexOf(c);
    if (idx >= 0) return idx;
  }
  return -1;
}

async function assertStaff(sbUser: ReturnType<typeof createClient>, sbSvc: ReturnType<typeof createClient>) {
  const { data: userData } = await sbUser.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { ok: false as const, status: 401, error: "unauthorized" };
  const { data: roles } = await sbSvc.from("user_roles").select("role").eq("user_id", uid);
  const isStaff = (roles ?? []).some((r: { role: string }) => r.role === "admin" || r.role === "consultor");
  if (!isStaff) return { ok: false as const, status: 403, error: "forbidden" };
  return { ok: true as const, uid };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return handleCorsOptions(req);

  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth) return corsJsonResponse({ error: "unauthorized" }, req, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sbUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const sbSvc = createClient(url, svcKey);

    const staff = await assertStaff(sbUser, sbSvc);
    if (!staff.ok) return corsJsonResponse({ error: staff.error }, req, staff.status);

    const body = await req.json().catch(() => ({}));
    const mode: "stage" | "commit" = body?.mode === "commit" ? "commit" : "stage";

    if (mode === "stage") {
      const csvText: string = typeof body?.csv_text === "string" ? body.csv_text : "";
      const filename: string | null = typeof body?.filename === "string" ? body.filename.slice(0, 200) : null;
      if (!csvText || csvText.length > 5_000_000) {
        return corsJsonResponse({ error: "csv_text required (max 5MB)" }, req, 400);
      }
      const table = parseCsv(csvText);
      if (table.length < 2) return corsJsonResponse({ error: "CSV empty or missing header" }, req, 400);
      const headers = table[0];
      const nameIdx = pickColumn(headers, ["name", "nome", "contact_name", "nome completo"]);
      const emailIdx = pickColumn(headers, ["email", "contact_email", "e-mail"]);
      const phoneIdx = pickColumn(headers, ["phone", "telefone", "contact_phone", "tel"]);
      const orgIdx = pickColumn(headers, ["organization", "empresa", "startup", "organization_name", "organização", "organizacao"]);
      const sourceIdx = pickColumn(headers, ["source", "origem", "fonte"]);
      const notesIdx = pickColumn(headers, ["notes", "notas", "observações", "observacoes"]);
      const valueIdx = pickColumn(headers, ["deal_value", "valor", "value"]);

      if (nameIdx < 0 && emailIdx < 0) {
        return corsJsonResponse({ error: "CSV requires a 'name' or 'email' column" }, req, 400);
      }

      const dataRows = table.slice(1, 1 + MAX_ROWS);
      const seenEmails = new Set<string>();
      const parsed: Array<ParsedRow & { valid: boolean; error: string | null; row_hash: string }> = [];

      for (let i = 0; i < dataRows.length; i++) {
        const cols = dataRows[i];
        const get = (idx: number) => (idx >= 0 && idx < cols.length ? cols[idx].trim() : "");
        const name = get(nameIdx);
        const email = get(emailIdx).toLowerCase();
        const phone = get(phoneIdx);
        const organization = get(orgIdx);
        const source = get(sourceIdx);
        const notes = get(notesIdx);
        const rawValue = get(valueIdx).replace(/[€$\s]/g, "").replace(",", ".");
        const value = rawValue ? Number(rawValue) : null;

        const hasIdentity = !!(name || email);
        const emailValid = !email || EMAIL_REGEX.test(email);
        const isDuplicate = !!email && seenEmails.has(email);
        const valid = hasIdentity && emailValid && !isDuplicate;
        let error: string | null = null;
        if (!hasIdentity) error = "Missing name or email";
        else if (!emailValid) error = "Invalid email";
        else if (isDuplicate) error = "Duplicate email in file";
        if (email) seenEmails.add(email);

        const row_hash = await sha256Hex([name, email, phone, organization, source, notes, value ?? ""].join("|"));
        parsed.push({
          row_index: i,
          contact_name: name,
          contact_email: email,
          contact_phone: phone,
          organization_name: organization,
          source,
          notes,
          deal_value: value !== null && !Number.isNaN(value) ? value : null,
          valid,
          error,
          row_hash,
        });
      }

      const validCount = parsed.filter((r) => r.valid).length;
      const invalidCount = parsed.length - validCount;

      const { data: batch, error: batchErr } = await sbSvc
        .from("crm_lead_import_batches")
        .insert({
          created_by: staff.uid,
          source_filename: filename,
          total_rows: parsed.length,
          valid_rows: validCount,
          invalid_rows: invalidCount,
          status: "staged",
        })
        .select("id")
        .single();
      if (batchErr) throw batchErr;

      const batchId = batch.id as string;

      // Chunk inserts to keep payload sane
      const chunkSize = 500;
      for (let i = 0; i < parsed.length; i += chunkSize) {
        const chunk = parsed.slice(i, i + chunkSize).map((r) => ({
          batch_id: batchId,
          row_index: r.row_index,
          row_hash: r.row_hash,
          contact_name: r.contact_name || null,
          contact_email: r.contact_email || null,
          contact_phone: r.contact_phone || null,
          organization_name: r.organization_name || null,
          source: r.source || null,
          notes: r.notes || null,
          deal_value: r.deal_value,
          valid: r.valid,
          error: r.error,
        }));
        const { error: insErr } = await sbSvc.from("crm_lead_import_rows").insert(chunk);
        if (insErr) throw insErr;
      }

      // Return preview (first 100 rows to keep response bounded)
      const { data: preview } = await sbSvc
        .from("crm_lead_import_rows")
        .select("id, row_index, contact_name, contact_email, organization_name, deal_value, valid, error")
        .eq("batch_id", batchId)
        .order("row_index", { ascending: true })
        .limit(100);

      return corsJsonResponse({
        mode: "stage",
        batch_id: batchId,
        total_rows: parsed.length,
        valid_rows: validCount,
        invalid_rows: invalidCount,
        preview: preview ?? [],
      }, req);
    }

    // ===== COMMIT =====
    const batchId: string = String(body?.batch_id ?? "");
    if (!batchId) return corsJsonResponse({ error: "batch_id required" }, req, 400);
    const authorizedIds: string[] | null = Array.isArray(body?.authorized_row_ids) && body.authorized_row_ids.length > 0
      ? body.authorized_row_ids.map((v: unknown) => String(v))
      : null;

    const { data: batch, error: batchFetchErr } = await sbSvc
      .from("crm_lead_import_batches")
      .select("id, status, created_by")
      .eq("id", batchId)
      .single();
    if (batchFetchErr || !batch) return corsJsonResponse({ error: "batch not found" }, req, 404);
    if (batch.status !== "staged") return corsJsonResponse({ error: `batch not in staged state (${batch.status})` }, req, 409);

    await sbSvc.from("crm_lead_import_batches").update({ status: "committing" }).eq("id", batchId);

    let q = sbSvc.from("crm_lead_import_rows")
      .select("id, contact_name, contact_email, contact_phone, organization_name, source, notes, deal_value, valid, committed_funnel_item_id")
      .eq("batch_id", batchId)
      .eq("valid", true)
      .is("committed_funnel_item_id", null);
    if (authorizedIds) q = q.in("id", authorizedIds);

    const { data: rows, error: rowsErr } = await q;
    if (rowsErr) throw rowsErr;

    let committed = 0;
    const errors: Array<{ row_id: string; error: string }> = [];

    for (const row of rows ?? []) {
      const payload = {
        contact_name: row.contact_name,
        contact_email: row.contact_email,
        contact_phone: row.contact_phone,
        organization_name: row.organization_name,
        source: row.source ?? "csv_import",
        notes: row.notes,
        deal_value: row.deal_value,
        stage: "new",
        type: "lead",
        owner_consultant_id: batch.created_by,
      };
      const { data: inserted, error: insErr } = await sbSvc
        .from("funnel_items")
        .insert(payload)
        .select("id")
        .single();
      if (insErr) { errors.push({ row_id: row.id, error: insErr.message }); continue; }
      await sbSvc.from("crm_lead_import_rows")
        .update({ committed_funnel_item_id: inserted.id })
        .eq("id", row.id);
      committed++;
    }

    await sbSvc.from("crm_lead_import_batches")
      .update({
        status: errors.length > 0 && committed === 0 ? "failed" : "committed",
        committed_rows: committed,
        committed_at: new Date().toISOString(),
      })
      .eq("id", batchId);

    return corsJsonResponse({
      mode: "commit",
      batch_id: batchId,
      committed,
      errors,
    }, req);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("bulk-import-leads error:", msg);
    return corsJsonResponse({ error: msg }, req, 500);
  }
});
