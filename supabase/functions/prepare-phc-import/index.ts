// prepare-phc-import
// Staff-only. Parses uploaded CSV or XLSX PHC "Clientes por Tipologia" export,
// normalises rows, runs deterministic matching, and persists a job + rows.
// NEVER writes to funnel_items, startups, workspaces, contracts, users,
// invitations, notifications, or automations. Dry-run scaffolding only.
//
// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { parseCsv, parseXlsx } from '../_shared/spreadsheetParse.ts';
import { fileSha256 } from '../_shared/hubspotImport.ts';
import {
  buildPhcHeaderMap, parsePhcRow, matchPhcRow, phcRowHash,
} from '../_shared/phcImport.ts';

interface PrepareBody {
  filename: string;
  content_base64: string;
  mime_type?: string;
  program_id?: string | null;
  sheet_name?: string;
  config?: Record<string, unknown>;
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

    const { data: roles } = await sbSvc.from('user_roles').select('role').eq('user_id', uid);
    const isStaff = (roles ?? []).some((r: any) => r.role === 'admin' || r.role === 'backoffice');
    if (!isStaff) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: jsonHeaders });

    const body = await req.json() as PrepareBody;
    if (!body?.filename || !body?.content_base64) {
      return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: jsonHeaders });
    }

    const bin = Uint8Array.from(atob(body.content_base64), c => c.charCodeAt(0));
    if (bin.byteLength > 15 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: 'file_too_large', limit: '15MB' }), { status: 400, headers: jsonHeaders });
    }
    const file_hash = await fileSha256(bin);
    const ext = body.filename.toLowerCase().split('.').pop() ?? '';
    if (!['csv', 'xlsx', 'xlsm'].includes(ext)) {
      return new Response(JSON.stringify({ error: 'unsupported_extension', ext }), { status: 400, headers: jsonHeaders });
    }

    let headers: string[] = [];
    let rows: Record<string, string>[] = [];
    let sheets: string[] = [];
    if (ext === 'csv') {
      const decoded = new TextDecoder('utf-8').decode(bin);
      const p = parseCsv(decoded);
      headers = p.headers; rows = p.rows;
    } else {
      if (!(bin[0] === 0x50 && bin[1] === 0x4B)) {
        return new Response(JSON.stringify({ error: 'invalid_xlsx_magic' }), { status: 400, headers: jsonHeaders });
      }
      const p = await parseXlsx(bin, body.sheet_name);
      headers = p.headers; rows = p.rows; sheets = p.sheets;
    }

    if (rows.length === 0) {
      return new Response(JSON.stringify({ error: 'empty_file' }), { status: 400, headers: jsonHeaders });
    }
    if (rows.length > 5000) {
      return new Response(JSON.stringify({ error: 'too_many_rows', limit: 5000, count: rows.length }), { status: 400, headers: jsonHeaders });
    }

    const headerMap = buildPhcHeaderMap(headers);
    const mappedFields = new Set(Object.values(headerMap));
    const requiredFields = ['phc_customer_id', 'organization_name'];
    const missingRequired = requiredFields.filter(f => !mappedFields.has(f));
    if (missingRequired.length > 0) {
      return new Response(JSON.stringify({ error: 'missing_required_headers', missing: missingRequired, detected_headers: headers }), { status: 400, headers: jsonHeaders });
    }

    // Create job — strict CRM-only, no side effects allowed
    const { data: job, error: jobErr } = await sbSvc.from('data_import_jobs').insert({
      source: 'phc',
      filename: body.filename,
      file_hash,
      status: 'prepared',
      config_json: {
        program_id: body.program_id ?? null,
        header_map: headerMap,
        detected_headers: headers,
        available_sheets: sheets,
        crm_only: true,
        create_startups: false,
        create_workspaces: false,
        create_contract_proposals: false,
        create_users: false,
        create_invitations: false,
        ...body.config,
      },
      created_by: uid,
      prepared_at: new Date().toISOString(),
    }).select().single();
    if (jobErr || !job) throw jobErr ?? new Error('job_insert_failed');

    const counts = { insert: 0, update: 0, conflict: 0, invalid: 0, suggested: 0 };
    const toInsert: any[] = [];
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const normalized = parsePhcRow(raw, headerMap);
      const errors = normalized.validation_errors;
      let action: string;
      let match: any = { entity_type: null, entity_id: null, method: 'none', confidence: 0, candidates: 0, snapshot_updated_at: null };
      if (errors.length > 0) {
        action = 'invalid'; counts.invalid++;
      } else {
        match = await matchPhcRow(normalized, { supabase: sbSvc, program_id: body.program_id ?? null });
        if (match.method === 'conflict') { action = 'conflict'; counts.conflict++; }
        else if (match.entity_id && (match.method === 'phc_customer_id' || match.method === 'nif')) {
          action = 'update'; counts.update++;
        } else if (match.entity_id) {
          action = 'suggested'; counts.suggested++;
        } else {
          action = 'insert'; counts.insert++;
        }
      }
      const hash = await phcRowHash(normalized);
      toInsert.push({
        job_id: job.id,
        row_number: i + 1,
        raw_json: raw,
        normalized_json: normalized,
        row_hash: hash,
        proposed_action: action,
        match_entity_type: match.entity_type,
        match_entity_id: match.entity_id,
        match_method: match.method,
        match_confidence: match.confidence,
        match_snapshot_updated_at: match.snapshot_updated_at,
        validation_errors_json: errors,
        approval_state: 'pending',
        approve_toggles_json: { crm: true, startup: false, workspace: false, contract_proposal: false },
      });
    }

    const CHUNK = 500;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { error } = await sbSvc.from('data_import_rows').insert(chunk);
      if (error) throw error;
    }

    await sbSvc.from('data_import_jobs').update({ counts_json: counts }).eq('id', job.id);

    return new Response(JSON.stringify({
      success: true,
      job_id: job.id,
      counts,
      total_rows: rows.length,
      detected_headers: headers,
      header_map: headerMap,
      available_sheets: sheets,
    }), { headers: jsonHeaders });
  } catch (e: any) {
    console.error('prepare-phc-import error', e?.message ?? e);
    return new Response(JSON.stringify({ error: 'internal_error', message: e?.message ?? String(e) }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
