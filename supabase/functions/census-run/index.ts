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
    // funnel_items totals
    const { count: funnelTotal } = await sbSvc.from('funnel_items').select('*', { count: 'exact', head: true });
    const { count: funnelWithPhc } = await sbSvc.from('funnel_items').select('*', { count: 'exact', head: true }).not('phc_customer_id', 'is', null);
    const { count: funnelLinkedStartup } = await sbSvc.from('funnel_items').select('*', { count: 'exact', head: true }).not('linked_startup_id', 'is', null);
    const { count: funnelLinkedWorkspace } = await sbSvc.from('funnel_items').select('*', { count: 'exact', head: true }).not('linked_workspace_id', 'is', null);

    // Duplicate PHC customer IDs inside funnel_items
    const { data: phcDupes } = await sbSvc
      .rpc('census_phc_customer_duplicates')
      .maybeSingle()
      .then(r => r, () => ({ data: null }));
    // Fallback: inline query if RPC missing
    let phcDupeRows: Array<{ phc_customer_id: string; n: number }> = [];
    if (!phcDupes) {
      const { data } = await sbSvc
        .from('funnel_items')
        .select('phc_customer_id')
        .not('phc_customer_id', 'is', null);
      const counts = new Map<string, number>();
      for (const r of ((data ?? []) as Array<{ phc_customer_id: string }>)) {
        counts.set(r.phc_customer_id, (counts.get(r.phc_customer_id) ?? 0) + 1);
      }
      phcDupeRows = Array.from(counts.entries())
        .filter(([, n]) => n > 1)
        .map(([phc_customer_id, n]) => ({ phc_customer_id, n }));
    }

    // Duplicate NIFs
    const { data: nifRows } = await sbSvc
      .from('funnel_items')
      .select('nif_normalized')
      .not('nif_normalized', 'is', null);
    const nifCounts = new Map<string, number>();
    for (const r of ((nifRows ?? []) as Array<{ nif_normalized: string }>)) {
      nifCounts.set(r.nif_normalized, (nifCounts.get(r.nif_normalized) ?? 0) + 1);
    }
    const nifDupeRows = Array.from(nifCounts.entries())
      .filter(([, n]) => n > 1)
      .map(([nif_normalized, n]) => ({ nif_normalized, n }));

    // Duplicate HubSpot company IDs
    const { data: hsRows } = await sbSvc
      .from('funnel_items')
      .select('hubspot_company_id')
      .not('hubspot_company_id', 'is', null);
    const hsCounts = new Map<string, number>();
    for (const r of ((hsRows ?? []) as Array<{ hubspot_company_id: string }>)) {
      hsCounts.set(r.hubspot_company_id, (hsCounts.get(r.hubspot_company_id) ?? 0) + 1);
    }
    const hsDupeRows = Array.from(hsCounts.entries())
      .filter(([, n]) => n > 1)
      .map(([hubspot_company_id, n]) => ({ hubspot_company_id, n }));

    // Service breakdown from funnel_items.metadata_json
    const { data: svcRows } = await sbSvc
      .from('funnel_items')
      .select('metadata_json')
      .not('phc_customer_id', 'is', null);
    const svcCounts = new Map<string, number>();
    for (const r of ((svcRows ?? []) as Array<{ metadata_json: Record<string, unknown> | null }>)) {
      const m = r.metadata_json ?? {};
      const raw = (m['phc_service_hint'] ?? m['phc_service'] ?? m['service_hint'] ?? m['service_name'] ?? '') as string;
      const key = raw ? String(raw).trim() : '(unset)';
      svcCounts.set(key, (svcCounts.get(key) ?? 0) + 1);
    }

    // Programme map coverage
    const { data: mapRows } = await sbSvc.from('service_programme_map').select('service_name, service_classification, programme_id');
    const knownServices = new Set((mapRows ?? []).map(r => (r as { service_name: string }).service_name.trim().toLowerCase()));
    const unmappedServices: Array<{ service: string; count: number }> = [];
    for (const [svc, count] of svcCounts.entries()) {
      if (svc !== '(unset)' && !knownServices.has(svc.toLowerCase())) unmappedServices.push({ service: svc, count });
    }

    // Workspaces breakdown
    const { data: wsRows } = await sbSvc.from('workspaces').select('access_status, program_id');
    const wsByStatus = new Map<string, number>();
    let wsWithoutProgram = 0;
    for (const r of ((wsRows ?? []) as Array<{ access_status: string | null; program_id: string | null }>)) {
      const k = r.access_status ?? '(null)';
      wsByStatus.set(k, (wsByStatus.get(k) ?? 0) + 1);
      if (!r.program_id) wsWithoutProgram++;
    }

    // Contracts / intakes / users
    const { count: startupsTotal } = await sbSvc.from('startups').select('*', { count: 'exact', head: true });
    const { count: contractsTotal } = await sbSvc.from('startup_contracts').select('*', { count: 'exact', head: true });
    const { count: intakesTotal } = await sbSvc.from('contract_intakes').select('*', { count: 'exact', head: true });
    const { count: workspaceUsersTotal } = await sbSvc.from('workspace_users').select('*', { count: 'exact', head: true });
    const { count: roomAllocsTotal } = await sbSvc.from('room_allocations').select('*', { count: 'exact', head: true });
    const { count: bulkRowsTotal } = await sbSvc.from('bulk_import_rows').select('*', { count: 'exact', head: true });

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
      workspaces: (wsRows ?? []).length,
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
      by_access_status: Object.fromEntries(wsByStatus.entries()),
      without_program: wsWithoutProgram,
    };

    const raw = {
      phc_extract: phcExtractCounts,
      phc_parse_error: phcParseError,
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
      phc_extract: phcExtractCounts,
      phc_parse_error: phcParseError,
    }, null, 2), { headers: jsonHeaders });
  } catch (e) {
    const msg = (e as Error).message;
    console.error('census-run error', msg);
    return new Response(JSON.stringify({ error: 'internal_error', message: msg }), { status: 500, headers: jsonHeaders });
  }
});
