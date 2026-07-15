// census-run
// Admin-only, READ-ONLY census of the reconciliation surface.
// Never writes to funnel_items, startups, workspaces, contracts, users, or invitations.
// Persists ONE row into public.census_reports as an auditable snapshot.
//
// Body:
//   { phc_extract_object_path?: string, notes?: string }
//
// The optional phc_extract_object_path points at a CSV in the admin-only
// "phc-extracts" bucket. The census will still run without it; when present,
// the CSV is parsed to derive "authoritative active PHC customers".

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

interface Body {
  phc_extract_object_path?: string;
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

function parseCsv(text: string): ParsedPhcRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const rawHeader = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const indexByField: Record<string, number> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = rawHeader.findIndex(h => aliases.includes(h));
    if (idx >= 0) indexByField[field] = idx;
  }
  // Require the two identity-critical columns.
  if (indexByField['phc_customer_id'] === undefined && indexByField['nif'] === undefined) {
    throw new Error(`CSV missing required columns. Need at least phc_customer_id or nif. Got header: ${rawHeader.join(', ')}`);
  }
  const rows: ParsedPhcRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCsvLine(lines[i]);
    const pick = (k: keyof ParsedPhcRow): string | null => {
      const idx = indexByField[k];
      if (idx === undefined) return null;
      const v = parts[idx];
      if (v === undefined) return null;
      const trimmed = v.trim();
      return trimmed.length === 0 ? null : trimmed;
    };
    rows.push({
      phc_customer_id: pick('phc_customer_id'),
      nif: pick('nif'),
      organization_name: pick('organization_name'),
      service_name: pick('service_name'),
      status: pick('status'),
      hubspot_company_id: pick('hubspot_company_id'),
    });
  }
  return rows;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuote = false; }
      else { cur += c; }
    } else {
      if (c === '"') inQuote = true;
      else if (c === ',' || c === ';') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
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
    let phcRows: ParsedPhcRow[] = [];
    let phcParseError: string | null = null;
    if (body.phc_extract_object_path) {
      const { data: blob, error: dlErr } = await sbSvc.storage.from('phc-extracts').download(body.phc_extract_object_path);
      if (dlErr || !blob) {
        phcParseError = `failed_to_download_extract: ${dlErr?.message ?? 'no data'}`;
      } else {
        try {
          const text = await blob.text();
          phcRows = parseCsv(text);
        } catch (e) {
          phcParseError = (e as Error).message;
        }
      }
    }

    // ----- Aggregate reads (no writes) ---------------------------------
    // Phase 2: each query records into `errors[]` on failure. A non-empty
    // errors[] fails the census with 500 — never persists a silently-empty
    // snapshot (audit P0-3).
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

    // Workspaces breakdown — canonical column is `status`, not `access_status`.
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

    // Contracts / intakes / users
    const startupsTotal = await safeCount('startups', sbSvc.from('startups').select('*', { count: 'exact', head: true }));
    const contractsTotal = await safeCount('startup_contracts', sbSvc.from('startup_contracts').select('*', { count: 'exact', head: true }));
    const intakesTotal = await safeCount('contract_intakes', sbSvc.from('contract_intakes').select('*', { count: 'exact', head: true }));
    const workspaceUsersTotal = await safeCount('workspace_users', sbSvc.from('workspace_users').select('*', { count: 'exact', head: true }));
    const roomAllocsTotal = await safeCount('room_allocations', sbSvc.from('room_allocations').select('*', { count: 'exact', head: true }));
    const bulkRowsTotal = await safeCount('bulk_import_rows', sbSvc.from('bulk_import_rows').select('*', { count: 'exact', head: true }));

    // Hard-fail if any critical query errored — never persist a silent-zero snapshot.
    if (errors.length > 0) {
      return new Response(JSON.stringify({
        error: 'census_query_failed',
        errors,
      }, null, 2), { status: 500, headers: jsonHeaders });
    }

    // ----- Exception queries → CSVs ------------------------------------
    // Each exception is a row-level list operators can act on. CSVs are uploaded
    // to the admin-only `admin-exports` bucket; signed URLs are returned.
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

    // Exception 1: orphan contracts (workspace_id NULL and no funnel link)
    {
      const { data, error } = await sbSvc.from('startup_contracts')
        .select('id, contract_number, status, workspace_id, funnel_item_id, created_at')
        .is('workspace_id', null);
      if (error) exceptions['orphan_contracts'] = { row_count: 0, object_path: null, signed_url: null, error: error.message };
      else await persistException('orphan_contracts', (data ?? []) as Array<Record<string, unknown>>);
    }
    // Exception 2: unlinked contracted funnel (has phc + stage past 'contracted' but no workspace)
    {
      const { data, error } = await sbSvc.from('funnel_items')
        .select('id, phc_customer_id, organization_name, stage, linked_startup_id, linked_workspace_id')
        .not('phc_customer_id', 'is', null)
        .is('linked_workspace_id', null);
      if (error) exceptions['unlinked_contracted_funnel'] = { row_count: 0, object_path: null, signed_url: null, error: error.message };
      else await persistException('unlinked_contracted_funnel', (data ?? []) as Array<Record<string, unknown>>);
    }
    // Exception 3: duplicate PHC customer IDs (row-level)
    await persistException('duplicate_phc_customer_ids', phcDupeRows as unknown as Array<Record<string, unknown>>);
    // Exception 4: duplicate NIFs (row-level)
    await persistException('duplicate_nifs', nifDupeRows as unknown as Array<Record<string, unknown>>);
    // Exception 5: workspaces without program (potentially wrong programme)
    {
      const { data, error } = await sbSvc.from('workspaces')
        .select('id, name, status, engagement_state, archived_at')
        .is('program_id', null);
      if (error) exceptions['workspaces_without_program'] = { row_count: 0, object_path: null, signed_url: null, error: error.message };
      else await persistException('workspaces_without_program', (data ?? []) as Array<Record<string, unknown>>);
    }
    // Exception 6: startups with multiple active contracts
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

    // PHC extract derived counts
    let phcExtractCounts: Record<string, unknown> = {};
    if (phcRows.length > 0) {
      const active = phcRows.filter(r => (r.status ?? '').toLowerCase() === 'active' || (r.status ?? '').toLowerCase() === 'ativo');
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
      phc_parse_error: phcParseError,
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
      phc_parse_error: phcParseError,
    }, null, 2), { headers: jsonHeaders });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('census-run error', msg);
    return new Response(JSON.stringify({ error: 'internal_error', message: msg }), { status: 500, headers: jsonHeaders });
  }
});

