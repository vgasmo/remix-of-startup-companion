// prepare-hubspot-import
// Staff-only. Parses uploaded CSV or XLSX, normalizes rows, runs canonical
// matching engine, and persists a job + rows. NEVER writes to funnel_items,
// startups, workspaces, or startup_contracts.

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import {
  autoMapHeaders, normalizeRow, validateRow, matchRow, rowHash, fileSha256,
  NormalizedRow, MatchResult,
} from '../_shared/hubspotImport.ts';

interface PrepareBody {
  filename: string;
  content_base64: string;
  mime_type: string;
  program_id?: string | null;
  column_mapping?: Record<string, string | null>;
  stage_map?: Record<string, string>;
  config?: Record<string, unknown>;
  sheet_name?: string;
}

// --- CSV parser -----------------------------------------------------------
function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  // Trim BOM
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ',' || c === ';') { record.push(field); field = ''; }
      else if (c === '\n') { record.push(field); rows.push(record); record = []; field = ''; }
      else if (c === '\r') { /* skip */ }
      else field += c;
    }
  }
  if (field.length || record.length) { record.push(field); rows.push(record); }
  const headers = (rows.shift() ?? []).map(h => h.trim());
  const out: Record<string, string>[] = [];
  for (const r of rows) {
    if (r.every(v => !v || !v.trim())) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    out.push(obj);
  }
  return { headers, rows: out };
}

// --- Minimal XLSX parser via JSZip -----------------------------------------
async function parseXlsx(bytes: Uint8Array, sheetName?: string): Promise<{ headers: string[]; rows: Record<string, string>[]; sheets: string[] }> {
  const JSZipMod: any = await import('https://esm.sh/jszip@3.10.1');
  const JSZip = JSZipMod.default ?? JSZipMod;
  const zip = await JSZip.loadAsync(bytes);

  const parseXml = (s: string) => {
    // Very small XML walker sufficient for xl/*.xml. We only need to pull
    // shared strings and rows/cells.
    return s;
  };

  // Shared strings
  const sstFile = zip.file('xl/sharedStrings.xml');
  const shared: string[] = [];
  if (sstFile) {
    const xml = parseXml(await sstFile.async('string'));
    // <si> either <t>text</t> or <r><t>text</t></r> chunks, or <is><t>...
    const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
    const tRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let m: RegExpExecArray | null;
    while ((m = siRe.exec(xml))) {
      let combined = '';
      let tm: RegExpExecArray | null;
      const inner = m[1];
      while ((tm = tRe.exec(inner))) combined += tm[1];
      shared.push(decodeXmlEntities(combined));
    }
  }

  // Workbook: list sheets in order
  const wbFile = zip.file('xl/workbook.xml');
  const wbXml = wbFile ? await wbFile.async('string') : '';
  const sheetRe = /<sheet\b[^>]*name="([^"]+)"[^>]*(?:r:id|sheetId)="[^"]*"[^>]*\/>/g;
  const sheets: string[] = [];
  let sm: RegExpExecArray | null;
  while ((sm = sheetRe.exec(wbXml))) sheets.push(sm[1]);

  // Sheet relationships (r:id -> target path)
  const relFile = zip.file('xl/_rels/workbook.xml.rels');
  const relMap = new Map<string, string>();
  if (relFile) {
    const relXml = await relFile.async('string');
    const relRe = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g;
    let rm: RegExpExecArray | null;
    while ((rm = relRe.exec(relXml))) relMap.set(rm[1], rm[2]);
  }

  // Pick sheet
  const idx = sheetName ? Math.max(0, sheets.indexOf(sheetName)) : 0;
  const sheetPath = `xl/worksheets/sheet${idx + 1}.xml`;
  const sheetFile = zip.file(sheetPath);
  if (!sheetFile) throw new Error(`sheet_not_found:${sheetPath}`);
  const sheetXml = await sheetFile.async('string');

  const cellRefColumn = (ref: string) => ref.replace(/\d+/g, '');
  const colIndex = (col: string) => {
    let n = 0;
    for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  };

  // Rows
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g;
  const attr = (s: string, k: string) => { const m = s.match(new RegExp(`\\b${k}="([^"]*)"`)); return m ? m[1] : null; };

  const rowsRaw: string[][] = [];
  let rm2: RegExpExecArray | null;
  while ((rm2 = rowRe.exec(sheetXml))) {
    const rowInner = rm2[1];
    const cells: string[] = [];
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rowInner))) {
      const attrs = cm[1] ?? cm[3] ?? '';
      const body = cm[2] ?? '';
      const ref = attr(attrs, 'r') ?? '';
      const type = attr(attrs, 't');
      const col = ref ? colIndex(cellRefColumn(ref)) : cells.length;
      let value = '';
      if (type === 's') {
        const vm = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        if (vm) value = shared[parseInt(vm[1], 10)] ?? '';
      } else if (type === 'inlineStr' || type === 'str') {
        const tm2 = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
        value = tm2 ? decodeXmlEntities(tm2[1]) : '';
      } else if (type === 'b') {
        const vm = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        value = vm ? (vm[1] === '1' ? 'TRUE' : 'FALSE') : '';
      } else {
        const vm = body.match(/<v[^>]*>([\s\S]*?)<\/v>/);
        value = vm ? decodeXmlEntities(vm[1]) : '';
      }
      while (cells.length < col) cells.push('');
      cells[col] = value;
    }
    rowsRaw.push(cells);
  }

  const headers = (rowsRaw.shift() ?? []).map(h => (h ?? '').trim());
  const rows: Record<string, string>[] = [];
  for (const r of rowsRaw) {
    if (!r.some(v => v && v.trim())) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (r[i] ?? '').trim(); });
    rows.push(obj);
  }
  return { headers, rows, sheets };
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&amp;/g, '&');
}

// --- Handler --------------------------------------------------------------
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

    // Role check: admin or backoffice
    const { data: roles } = await sbSvc.from('user_roles').select('role').eq('user_id', uid);
    const isStaff = (roles ?? []).some((r: any) => r.role === 'admin' || r.role === 'backoffice');
    if (!isStaff) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: jsonHeaders });

    const body = await req.json() as PrepareBody;
    if (!body?.filename || !body?.content_base64) {
      return new Response(JSON.stringify({ error: 'invalid_input' }), { status: 400, headers: jsonHeaders });
    }

    // Decode
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
      // Magic bytes: XLSX must start with PK\x03\x04
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

    const mapping = { ...autoMapHeaders(headers), ...(body.column_mapping ?? {}) };

    // Create job
    const { data: job, error: jobErr } = await sbSvc.from('data_import_jobs').insert({
      source: 'hubspot',
      filename: body.filename,
      file_hash,
      status: 'prepared',
      config_json: {
        program_id: body.program_id ?? null,
        column_mapping: mapping,
        stage_map: body.stage_map ?? {},
        detected_headers: headers,
        available_sheets: sheets,
        create_startups: false,
        create_workspaces: false,
        create_contract_proposals: false,
        ...body.config,
      },
      created_by: uid,
      prepared_at: new Date().toISOString(),
    }).select().single();
    if (jobErr || !job) throw jobErr ?? new Error('job_insert_failed');

    // Match + persist rows
    const counts = { insert: 0, update: 0, conflict: 0, invalid: 0 };
    const toInsert: any[] = [];
    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const normalized = normalizeRow(raw, mapping, body.stage_map ?? {});
      const errors = validateRow(normalized);
      let action: string;
      let match: MatchResult = { entity_type: null, entity_id: null, method: 'none', confidence: 0, candidates: 0, snapshot_updated_at: null };
      if (errors.length > 0) {
        action = 'invalid'; counts.invalid++;
      } else {
        match = await matchRow(normalized, { supabase: sbSvc, program_id: body.program_id ?? null });
        if (match.method === 'conflict') { action = 'conflict'; counts.conflict++; }
        else if (match.entity_id) { action = 'update'; counts.update++; }
        else { action = 'insert'; counts.insert++; }
      }
      const hash = await rowHash(normalized);
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

    // Batch-insert rows in chunks
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
      column_mapping: mapping,
      available_sheets: sheets,
    }), { headers: jsonHeaders });
  } catch (e: any) {
    console.error('prepare-hubspot-import error', e?.message ?? e);
    return new Response(JSON.stringify({ error: 'internal_error', message: e?.message ?? String(e) }), {
      status: 500, headers: jsonHeaders,
    });
  }
});
