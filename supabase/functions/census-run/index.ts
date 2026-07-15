// census-run
// Admin-only, READ-ONLY census of the reconciliation surface.
// Never writes to funnel_items, startups, workspaces, contracts, users, or invitations.
// Persists ONE row into public.census_reports as an auditable snapshot.
//
// Body:
//   { phc_extract_object_path?: string, phc_active_only?: boolean, notes?: string }
//
// Release-hardening Phase 4:
//   - State-machine CSV parser: BOM strip, CRLF, quoted commas/semicolons/newlines, escaped quotes.
//   - Delimiter auto-detect (single delimiter per file: comma or semicolon).
//   - PHC parse error → run fails, no snapshot persisted (no more silent ok:true).
//   - `unlinked_contracted_funnel` filters canonical `contracted` stage (not "has phc_customer_id").
//   - Every aggregate/exception query error still hard-fails the run.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

interface Body {
  phc_extract_object_path?: string;
  phc_active_only?: boolean;
  notes?: string;
}

interface ParsedPhcRow {
  phc_customer_id: string | null;
  nif: string | null;
  organization_name: string | null;
  service_name: string | null;
  status: string | null;
  hubspot_company_id: string | null;
}

const HEADER_ALIASES: Record<keyof ParsedPhcRow, string[]> = {
  phc_customer_id: ['phc_customer_id', 'customer_id', 'codigo', 'code', 'phc_id'],
  nif: ['nif', 'vat', 'tax_id', 'nif_number'],
  organization_name: ['organization_name', 'organization', 'name', 'nome', 'company', 'company_name'],
  service_name: ['service_name', 'service', 'servico', 'serviço', 'phc_service', 'phc_service_hint'],
  status: ['status', 'estado', 'state', 'active_status'],
  hubspot_company_id: ['hubspot_company_id', 'hubspot_id', 'hs_company_id'],
};

// --- State-machine CSV parser -----------------------------------------------
// Handles BOM, CRLF/LF/CR line endings, quoted fields with embedded commas,
// semicolons, newlines, and RFC-4180 escaped quotes ("").
// Single delimiter per file — auto-detected on the header line.

function stripBOM(s: string): string {
  return s.length > 0 && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function detectDelimiter(headerLine: string): ',' | ';' {
  // Ignore delimiters inside quoted spans when detecting.
  let commas = 0, semis = 0, inQuote = false;
  for (let i = 0; i < headerLine.length; i++) {
    const c = headerLine.charCodeAt(i);
    if (c === 34 /* " */) {
      if (inQuote && headerLine.charCodeAt(i + 1) === 34) { i++; continue; }
      inQuote = !inQuote; continue;
    }
    if (inQuote) continue;
    if (c === 44) commas++;
    else if (c === 59) semis++;
  }
  return semis > commas ? ';' : ',';
}

function parseCsvRows(text: string): string[][] {
  const src = stripBOM(text);
  // Find the header line (first \n or end of string, respecting quotes).
  let headerEnd = -1;
  {
    let inQuote = false;
    for (let i = 0; i < src.length; i++) {
      const c = src.charCodeAt(i);
      if (c === 34) {
        if (inQuote && src.charCodeAt(i + 1) === 34) { i++; continue; }
        inQuote = !inQuote; continue;
      }
      if (!inQuote && (c === 10 || c === 13)) { headerEnd = i; break; }
    }
  }
  const headerLine = headerEnd === -1 ? src : src.slice(0, headerEnd);
  const delim = detectDelimiter(headerLine);

  const rows: string[][] = [];
  let cur = '';
  let field: string[] = [];
  let inQuote = false;
  const flushField = () => { field.push(cur); cur = ''; };
  const flushRow = () => {
    // Skip fully empty lines (produced by CRLF at EOF etc.)
    if (field.length === 1 && field[0] === '') { field = []; return; }
    rows.push(field);
    field = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuote) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cur += '"'; i++; }
        else { inQuote = false; }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') { inQuote = true; continue; }
    if (ch === delim) { flushField(); continue; }
    if (ch === '\r') {
      flushField(); flushRow();
      if (src[i + 1] === '\n') i++;
      continue;
    }
    if (ch === '\n') { flushField(); flushRow(); continue; }
    cur += ch;
  }
  // Trailing field / row
  if (cur.length > 0 || field.length > 0) { flushField(); flushRow(); }
  if (inQuote) throw new Error('csv_unterminated_quote');
  return rows;
}

function parseCsv(text: string, opts: { activeOnly: boolean }): ParsedPhcRow[] {
  const rows = parseCsvRows(text);
  if (rows.length === 0) throw new Error('csv_empty');
  const header = rows[0].map(h => h.trim().toLowerCase());
  const indexByField: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = header.findIndex(h => aliases.includes(h));
    if (idx >= 0) indexByField[field] = idx;
  }
  if (indexByField['phc_customer_id'] === undefined && indexByField['nif'] === undefined) {
    throw new Error(`csv_missing_identity_columns: header=${header.join(', ')}`);
  }
  // If not activeOnly and no status column, we still parse but flag later.
  const hasStatusCol = indexByField['status'] !== undefined;
  if (!opts.activeOnly && !hasStatusCol) {
    throw new Error('csv_missing_status_column_required_when_not_active_only');
  }

  const out: ParsedPhcRow[] = [];
  for (let r = 1; r < rows.length; r++) {
    const parts = rows[r];
    const pick = (k: keyof ParsedPhcRow): string | null => {
      const idx = indexByField[k];
      if (idx === undefined) return null;
      const v = parts[idx];
      if (v === undefined) return null;
      const t = v.trim();
      return t.length === 0 ? null : t;
    };
    // Skip rows with no identifying data at all.
    const row: ParsedPhcRow = {
      phc_customer_id: pick('phc_customer_id'),
      nif: pick('nif'),
      organization_name: pick('organization_name'),
      service_name: pick('service_name'),
      status: pick('status') ?? (opts.activeOnly ? 'active' : null),
      hubspot_company_id: pick('hubspot_company_id'),
    };
    if (!row.phc_customer_id && !row.nif && !row.organization_name) continue;
    out.push(row);
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return handleCorsOptions(req);
  const cors = getCorsHeaders(req);
  const jsonHeaders = { ...cors, 'Content-Type': 'application/json' };

  try {
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });

    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sbUser = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const sbSvc = createClient(url, svc);

    const { data: userData } = await sbUser.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: jsonHeaders });

    const { data: adminCheck } = await sbSvc.rpc('has_role', { _user_id: uid, _role: 'admin' });
    if (!adminCheck) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: jsonHeaders });

    const body = (await req.json().catch(() => ({}))) as Body;

    // ----- Parse PHC extract if provided -------------------------------
    // Fail-closed: any download or parse error aborts the run before writes.
    let phcRows: ParsedPhcRow[] = [];
    if (body.phc_extract_object_path) {
      const { data: blob, error: dlErr } = await sbSvc.storage.from('phc-extracts').download(body.phc_extract_object_path);
      if (dlErr || !blob) {
        return new Response(JSON.stringify({
          error: 'phc_extract_failed',
          errors: [{ source: 'phc_extract.download', message: dlErr?.message ?? 'no data' }],
        }, null, 2), { status: 500, headers: jsonHeaders });
      }
      try {
        const text = await blob.text();
        phcRows = parseCsv(text, { activeOnly: body.phc_active_only === true });
      } catch (e) {
        return new Response(JSON.stringify({
          error: 'phc_extract_parse_failed',
          errors: [{ source: 'phc_extract.parse', message: (e as Error).message }],
        }, null, 2), { status: 500, headers: jsonHeaders });
      }
    }

    // ----- Aggregate reads (no writes) ---------------------------------
    const errors: Array<{ source: string; message: string }> = [];
    async function safeCount(source: string, q: Promise<{ count: number | null; error: unknown }>): Promise<number | null> {
      const { count, error } = await q;
      if (error) { errors.push({ source, message: (error as { message?: string }).message ?? 'unknown_error' }); return null; }
      return count ?? 0;
    }

    const funnelTotal = await safeCount('funnel_items.total',
      sbSvc.from('funnel_items').select('*', { count: 'exact', head: true }));
    const funnelWithPhc = await safeCount('funnel_items.with_phc',
      sbSvc.from('funnel_items').select('*', { count: 'exact', head: true }).not('phc_customer_id', 'is', null));
    const funnelLinkedStartup = await safeCount('funnel_items.linked_startup',
      sbSvc.from('funnel_items').select('*', { count: 'exact', head: true }).not('linked_startup_id', 'is', null));
    const funnelLinkedWorkspace = await safeCount('funnel_items.linked_workspace',
      sbSvc.from('funnel_items').select('*', { count: 'exact', head: true }).not('linked_workspace_id', 'is', null));

    // Duplicates inside funnel_items
    let phcDupeRows: Array<{ phc_customer_id: string; n: number }> = [];
    {
      const { data, error } = await sbSvc
        .from('funnel_items').select('id, phc_customer_id, organization_name').not('phc_customer_id', 'is', null);
      if (error) errors.push({ source: 'funnel_items.phc_dupes', message: error.message });
      else {
        const counts = new Map<string, number>();
        for (const r of ((data ?? []) as Array<{ phc_customer_id: string }>)) counts.set(r.phc_customer_id, (counts.get(r.phc_customer_id) ?? 0) + 1);
        phcDupeRows = Array.from(counts.entries()).filter(([, n]) => n > 1).map(([phc_customer_id, n]) => ({ phc_customer_id, n }));
      }
    }
    let nifDupeRows: Array<{ nif_normalized: string; n: number }> = [];
    {
      const { data, error } = await sbSvc.from('funnel_items').select('nif_normalized').not('nif_normalized', 'is', null);
      if (error) errors.push({ source: 'funnel_items.nif_dupes', message: error.message });
      else {
        const nifCounts = new Map<string, number>();
        for (const r of ((data ?? []) as Array<{ nif_normalized: string }>)) nifCounts.set(r.nif_normalized, (nifCounts.get(r.nif_normalized) ?? 0) + 1);
        nifDupeRows = Array.from(nifCounts.entries()).filter(([, n]) => n > 1).map(([nif_normalized, n]) => ({ nif_normalized, n }));
      }
    }
    let hsDupeRows: Array<{ hubspot_company_id: string; n: number }> = [];
    {
      const { data, error } = await sbSvc.from('funnel_items').select('hubspot_company_id').not('hubspot_company_id', 'is', null);
      if (error) errors.push({ source: 'funnel_items.hs_dupes', message: error.message });
      else {
        const hsCounts = new Map<string, number>();
        for (const r of ((data ?? []) as Array<{ hubspot_company_id: string }>)) hsCounts.set(r.hubspot_company_id, (hsCounts.get(r.hubspot_company_id) ?? 0) + 1);
        hsDupeRows = Array.from(hsCounts.entries()).filter(([, n]) => n > 1).map(([hubspot_company_id, n]) => ({ hubspot_company_id, n }));
      }
    }

    // Service breakdown from funnel_items.metadata_json
    const svcCounts = new Map<string, number>();
    {
      const { data, error } = await sbSvc.from('funnel_items').select('metadata_json').not('phc_customer_id', 'is', null);
      if (error) errors.push({ source: 'funnel_items.service_breakdown', message: error.message });
      else {
        for (const r of ((data ?? []) as Array<{ metadata_json: Record<string, unknown> | null }>)) {
          const m = r.metadata_json ?? {};
          const raw = (m['phc_service_hint'] ?? m['phc_service'] ?? m['service_hint'] ?? m['service_name'] ?? '') as string;
          const key = raw ? String(raw).trim() : '(unset)';
          svcCounts.set(key, (svcCounts.get(key) ?? 0) + 1);
        }
      }
    }

    // Programme map coverage
    const unmappedServices: Array<{ service: string; count: number }> = [];
    {
      const { data, error } = await sbSvc.from('service_programme_map').select('service_name, service_classification, programme_id');
      if (error) errors.push({ source: 'service_programme_map', message: error.message });
      else {
        const knownServices = new Set((data ?? []).map(r => (r as { service_name: string }).service_name.trim().toLowerCase()));
        for (const [svc, count] of svcCounts.entries()) {
          if (svc !== '(unset)' && !knownServices.has(svc.toLowerCase())) unmappedServices.push({ service: svc, count });
        }
      }
    }

    // Workspaces breakdown
    const wsByStatus = new Map<string, number>();
    const wsByEngagement = new Map<string, number>();
    let wsWithoutProgram = 0;
    let wsArchived = 0;
    let wsCount = 0;
    {
      const { data, error } = await sbSvc.from('workspaces').select('id, name, status, program_id, engagement_state, archived_at');
      if (error) errors.push({ source: 'workspaces', message: error.message });
      else {
        wsCount = (data ?? []).length;
        for (const r of ((data ?? []) as Array<{ status: string | null; program_id: string | null; engagement_state: string | null; archived_at: string | null }>)) {
          const k = r.status ?? '(null)';
          wsByStatus.set(k, (wsByStatus.get(k) ?? 0) + 1);
          const e = r.engagement_state ?? '(null)';
          wsByEngagement.set(e, (wsByEngagement.get(e) ?? 0) + 1);
          if (!r.program_id) wsWithoutProgram++;
          if (r.archived_at) wsArchived++;
        }
      }
    }

    const startupsTotal = await safeCount('startups', sbSvc.from('startups').select('*', { count: 'exact', head: true }));
    const contractsTotal = await safeCount('startup_contracts', sbSvc.from('startup_contracts').select('*', { count: 'exact', head: true }));
    const intakesTotal = await safeCount('contract_intakes', sbSvc.from('contract_intakes').select('*', { count: 'exact', head: true }));
    const workspaceUsersTotal = await safeCount('workspace_users', sbSvc.from('workspace_users').select('*', { count: 'exact', head: true }));
    const roomAllocsTotal = await safeCount('room_allocations', sbSvc.from('room_allocations').select('*', { count: 'exact', head: true }));
    const bulkRowsTotal = await safeCount('bulk_import_rows', sbSvc.from('bulk_import_rows').select('*', { count: 'exact', head: true }));

    if (errors.length > 0) {
      return new Response(JSON.stringify({
        error: 'census_query_failed',
        errors,
      }, null, 2), { status: 500, headers: jsonHeaders });
    }

    // ----- Exception queries → CSVs ------------------------------------
    const exceptions: Record<string, { row_count: number; object_path: string | null; signed_url: string | null; error: string | null }> = {};
    const bucketId = 'admin-exports';
    const runStamp = new Date().toISOString().replace(/[:.]/g, '-');

    function toCsv(rows: Array<Record<string, unknown>>): string {
      if (rows.length === 0) return '';
      const cols = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
      const esc = (v: unknown) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
      };
      return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
    }
    async function persistException(name: string, rows: Array<Record<string, unknown>>) {
      const path = `census/${runStamp}/${name}.csv`;
      const csv = toCsv(rows);
      if (rows.length === 0) { exceptions[name] = { row_count: 0, object_path: null, signed_url: null, error: null }; return; }
      const { error: upErr } = await sbSvc.storage.from(bucketId).upload(path, new Blob([csv], { type: 'text/csv' }), { upsert: true, contentType: 'text/csv' });
      if (upErr) { exceptions[name] = { row_count: rows.length, object_path: null, signed_url: null, error: upErr.message }; return; }
      const { data: sig } = await sbSvc.storage.from(bucketId).createSignedUrl(path, 3600);
      exceptions[name] = { row_count: rows.length, object_path: path, signed_url: sig?.signedUrl ?? null, error: null };
    }

    // Exception 1: orphan contracts
    {
      const { data, error } = await sbSvc.from('startup_contracts')
        .select('id, contract_number, status, workspace_id, funnel_item_id, created_at')
        .is('workspace_id', null);
      if (error) exceptions['orphan_contracts'] = { row_count: 0, object_path: null, signed_url: null, error: error.message };
      else await persistException('orphan_contracts', (data ?? []) as Array<Record<string, unknown>>);
    }
    // Exception 2: unlinked contracted funnel — canonical `contracted` stage, missing workspace link.
    {
      const { data, error } = await sbSvc.from('funnel_items')
        .select('id, phc_customer_id, organization_name, stage, linked_startup_id, linked_workspace_id')
        .eq('stage', 'contracted')
        .is('linked_workspace_id', null);
      if (error) exceptions['unlinked_contracted_funnel'] = { row_count: 0, object_path: null, signed_url: null, error: error.message };
      else await persistException('unlinked_contracted_funnel', (data ?? []) as Array<Record<string, unknown>>);
    }
    // Exception 3-4: duplicates
    await persistException('duplicate_phc_customer_ids', phcDupeRows as unknown as Array<Record<string, unknown>>);
    await persistException('duplicate_nifs', nifDupeRows as unknown as Array<Record<string, unknown>>);
    // Exception 5: workspaces without program
    {
      const { data, error } = await sbSvc.from('workspaces')
        .select('id, name, status, engagement_state, archived_at')
        .is('program_id', null);
      if (error) exceptions['workspaces_without_program'] = { row_count: 0, object_path: null, signed_url: null, error: error.message };
      else await persistException('workspaces_without_program', (data ?? []) as Array<Record<string, unknown>>);
    }
    // Exception 6: multiple active contracts
    {
      const { data, error } = await sbSvc.from('startup_contracts')
        .select('id, workspace_id, status')
        .in('status', ['active', 'sent', 'signed']);
      if (error) exceptions['multiple_active_contracts'] = { row_count: 0, object_path: null, signed_url: null, error: error.message };
      else {
        const byWs = new Map<string, Array<Record<string, unknown>>>();
        for (const r of ((data ?? []) as Array<{ id: string; workspace_id: string | null; status: string }>)) {
          if (!r.workspace_id) continue;
          const arr = byWs.get(r.workspace_id) ?? []; arr.push(r); byWs.set(r.workspace_id, arr);
        }
        const dupes: Array<Record<string, unknown>> = [];
        for (const [ws, arr] of byWs.entries()) if (arr.length > 1) for (const row of arr) dupes.push({ workspace_id: ws, ...row });
        await persistException('multiple_active_contracts', dupes);
      }
    }

    // Any exception upload error → also fail the run.
    const uploadErrors = Object.entries(exceptions)
      .filter(([, v]) => v.error !== null)
      .map(([k, v]) => ({ source: `exception.${k}`, message: v.error! }));
    if (uploadErrors.length > 0) {
      return new Response(JSON.stringify({ error: 'exception_upload_failed', errors: uploadErrors }, null, 2), {
        status: 500, headers: jsonHeaders,
      });
    }

    // PHC extract derived counts
    let phcExtractCounts: Record<string, unknown> = {};
    if (phcRows.length > 0) {
      const active = phcRows.filter(r => {
        const s = (r.status ?? '').toLowerCase();
        return s === 'active' || s === 'ativo';
      });
      const svcInExtract = new Map<string, number>();
      for (const r of active) {
        const k = (r.service_name ?? '(unset)').trim();
        svcInExtract.set(k, (svcInExtract.get(k) ?? 0) + 1);
      }
      phcExtractCounts = {
        total_rows: phcRows.length,
        active_rows: active.length,
        distinct_customer_ids: new Set(phcRows.map(r => r.phc_customer_id).filter(Boolean)).size,
        by_service: Object.fromEntries(svcInExtract.entries()),
      };
    }

    const totals = {
      funnel_items: funnelTotal ?? 0,
      funnel_items_with_phc: funnelWithPhc ?? 0,
      funnel_items_linked_startup: funnelLinkedStartup ?? 0,
      funnel_items_linked_workspace: funnelLinkedWorkspace ?? 0,
      startups: startupsTotal ?? 0,
      workspaces: wsCount,
      workspaces_without_program: wsWithoutProgram,
      startup_contracts: contractsTotal ?? 0,
      contract_intakes: intakesTotal ?? 0,
      workspace_users: workspaceUsersTotal ?? 0,
      room_allocations: roomAllocsTotal ?? 0,
      bulk_import_rows: bulkRowsTotal ?? 0,
    };

    const duplicates = {
      phc_customer_id: phcDupeRows,
      nif_normalized: nifDupeRows,
      hubspot_company_id: hsDupeRows,
    };

    const service_breakdown = {
      counts: Object.fromEntries(svcCounts.entries()),
      unmapped_services: unmappedServices,
    };

    const workspace_breakdown = {
      by_status: Object.fromEntries(wsByStatus.entries()),
      by_engagement_state: Object.fromEntries(wsByEngagement.entries()),
      without_program: wsWithoutProgram,
      archived: wsArchived,
    };

    const raw = {
      phc_extract: phcExtractCounts,
      phc_parse_error: null,
      exceptions,
    };

    const { data: inserted, error: insErr } = await sbSvc
      .from('census_reports')
      .insert({
        generated_by: uid,
        phc_extract_object_path: body.phc_extract_object_path ?? null,
        totals,
        duplicates,
        service_breakdown,
        workspace_breakdown,
        raw,
        notes: body.notes ?? null,
      })
      .select('id, generated_at')
      .single();

    if (insErr) throw insErr;

    return new Response(JSON.stringify({
      ok: true,
      census_id: inserted?.id,
      generated_at: inserted?.generated_at,
      totals,
      duplicates_summary: {
        phc_customer_id: phcDupeRows.length,
        nif_normalized: nifDupeRows.length,
        hubspot_company_id: hsDupeRows.length,
      },
      service_breakdown,
      workspace_breakdown,
      exceptions,
      phc_extract: phcExtractCounts,
      phc_parse_error: null,
    }, null, 2), { headers: jsonHeaders });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('census-run error', msg);
    return new Response(JSON.stringify({ error: 'internal_error', message: msg }), { status: 500, headers: jsonHeaders });
  }
});
