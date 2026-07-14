// Shared PHC "Clientes por Tipologia" import primitives.
//
// Deno-compatible mirror of `src/lib/phcNormalize.ts`. Both sides MUST produce
// identical `normalized_json` / `row_hash` triplets so dry-run and commit
// decisions stay idempotent when data hasn't changed.
//
// NEVER mutates data — pure read/normalize/match logic only.
//
// deno-lint-ignore-file no-explicit-any

import {
  normEmail, normPhone, normCompany, extractEmailFromText,
} from './hubspotImport.ts';

// ---- NIF (PT + foreign) -------------------------------------------------
export function normNifPT(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const digits = String(v).replace(/\D+/g, '');
  if (digits.length !== 9) return null;
  const first = digits[0];
  if (!/^[125689]/.test(first) && !/^(45|70|71|72|74|75|77|79|90|98|99)/.test(digits)) return null;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(digits[i]) * (9 - i);
  const check = 11 - (sum % 11);
  const expected = check >= 10 ? 0 : check;
  return Number(digits[8]) === expected ? digits : null;
}

export function normForeignTaxId(v: unknown, countryCode: string | null): string | null {
  if (!v) return null;
  const s = String(v).trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  const cc = (countryCode ?? 'XX').toUpperCase().slice(0, 2);
  return `foreign:${cc}:${s}`;
}

export function resolveTaxId(
  raw: unknown,
  country: string | null,
): { normalized: string | null; kind: 'pt' | 'foreign' | 'invalid' | 'empty' } {
  if (raw === null || raw === undefined || String(raw).trim() === '') {
    return { normalized: null, kind: 'empty' };
  }
  const isPT =
    !country ||
    /^(pt|portugal|portuguesa|portugu[eê]s(a)?)$/i.test(String(country).trim());
  if (isPT) {
    const pt = normNifPT(raw);
    if (pt) return { normalized: pt, kind: 'pt' };
    return { normalized: null, kind: 'invalid' };
  }
  const foreign = normForeignTaxId(raw, country);
  return foreign ? { normalized: foreign, kind: 'foreign' } : { normalized: null, kind: 'invalid' };
}

export function sanitizePreviewCell(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  if (v.length === 0) return v;
  const first = v.charAt(0);
  if (first === '=' || first === '+' || first === '-' || first === '@' || first === '\t' || first === '\r') {
    return `'${v}`;
  }
  return v;
}

// ---- Canonical row ------------------------------------------------------
export interface PhcCanonicalRow {
  phc_customer_id: string | null;
  organization_name: string | null;
  organization_short_name: string | null;
  nif_raw: string | null;
  nif_normalized: string | null;
  nif_kind: 'pt' | 'foreign' | 'invalid' | 'empty';
  country: string | null;
  phc_department: string | null;
  phc_service_hint: string | null;
  phc_building_hint: string | null;
  phc_price_list_id: string | null;
  organization_email: string | null;
  organization_phone: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_secondary_name: string | null;
  contact_secondary_email: string | null;
  validation_errors: string[];
}

const HEADER_ALIASES: Record<string, string[]> = {
  phc_customer_id:         ['n.º cliente', 'no cliente', 'nº cliente', 'numero cliente', 'phc_customer_id'],
  organization_name:       ['nome do cliente', 'nome cliente', 'organization_name'],
  organization_short_name: ['nome abreviado'],
  nif_raw:                 ['número de contribuinte', 'numero de contribuinte', 'nif', 'contribuinte'],
  country:                 ['nome do país', 'nome do pais', 'país', 'pais'],
  phc_department:          ['departamento'],
  phc_service_hint:        ['serviço', 'servico'],
  phc_building_hint:       ['edifício', 'edificio'],
  phc_price_list_id:       ['preço a usar em documentos', 'preco a usar em documentos', 'preço', 'preco'],
  organization_email:      ['e-mail', 'email'],
  organization_phone:      ['telefone do primeiro contato', 'telefone', 'telefone contato'],
  contact_name:            ['nome do primeiro contato', 'contato principal'],
  contact_email:           ['e-mail do primeiro contato', 'email do primeiro contato'],
  contact_secondary_name:  ['nome do segundo contato'],
  contact_secondary_email: ['e-mail do segundo contato', 'email do segundo contato'],
};

export function buildPhcHeaderMap(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const raw of headers) {
    const n = norm(raw);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (aliases.includes(n)) { map[raw] = field; break; }
    }
  }
  return map;
}

export function parsePhcRow(
  raw: Record<string, unknown>,
  headerMap: Record<string, string>,
): PhcCanonicalRow {
  const out: Record<string, unknown> = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = headerMap[header];
    if (!field) continue;
    out[field] = value === '' ? null : value;
  }
  const trim = (v: unknown) => (v === null || v === undefined ? null : String(v).trim() || null);

  const country = trim(out.country);
  const nifRaw = trim(out.nif_raw);
  const nif = resolveTaxId(nifRaw, country);

  const emailOrg = normEmail(out.organization_email);
  const emailContact =
    normEmail(out.contact_email) ??
    (typeof out.contact_email === 'string' ? extractEmailFromText(out.contact_email) : null);
  const emailContact2 =
    normEmail(out.contact_secondary_email) ??
    (typeof out.contact_secondary_email === 'string' ? extractEmailFromText(out.contact_secondary_email) : null);

  const errors: string[] = [];
  if (out.organization_email && !emailOrg) errors.push('invalid_organization_email');
  if (out.contact_email && !emailContact) errors.push('invalid_contact_email');
  if (out.contact_secondary_email && !emailContact2) errors.push('invalid_secondary_contact_email');
  if (nif.kind === 'invalid') errors.push('invalid_nif');
  if (!trim(out.organization_name)) errors.push('missing_organization_name');
  if (!trim(out.phc_customer_id)) errors.push('missing_phc_customer_id');

  return {
    phc_customer_id:         trim(out.phc_customer_id),
    organization_name:       normCompany(out.organization_name),
    organization_short_name: normCompany(out.organization_short_name),
    nif_raw:                 nifRaw,
    nif_normalized:          nif.normalized,
    nif_kind:                nif.kind,
    country:                 country,
    phc_department:          trim(out.phc_department),
    phc_service_hint:        trim(out.phc_service_hint),
    phc_building_hint:       trim(out.phc_building_hint),
    phc_price_list_id:       trim(out.phc_price_list_id),
    organization_email:      emailOrg,
    organization_phone:      normPhone(out.organization_phone),
    contact_name:            normCompany(out.contact_name),
    contact_email:           emailContact,
    contact_secondary_name:  normCompany(out.contact_secondary_name),
    contact_secondary_email: emailContact2,
    validation_errors:       errors,
  };
}

// ---- Matching engine (PHC) ----------------------------------------------
export type PhcMatchMethod =
  | 'phc_customer_id'
  | 'nif'
  | 'email'
  | 'name'
  | 'none'
  | 'conflict';

export interface PhcMatchResult {
  entity_type: 'funnel_item' | null;
  entity_id: string | null;
  method: PhcMatchMethod;
  confidence: number;
  candidates: number;
  snapshot_updated_at: string | null;
}

export interface PhcMatchCtx {
  supabase: any;
  program_id?: string | null;
}

export async function matchPhcRow(n: PhcCanonicalRow, ctx: PhcMatchCtx): Promise<PhcMatchResult> {
  const sb = ctx.supabase;
  const none: PhcMatchResult = {
    entity_type: null, entity_id: null, method: 'none',
    confidence: 0, candidates: 0, snapshot_updated_at: null,
  };

  // 1. phc_customer_id — deterministic (unique index on funnel_items)
  if (n.phc_customer_id) {
    const { data } = await sb.from('funnel_items')
      .select('id, updated_at')
      .eq('phc_customer_id', n.phc_customer_id)
      .maybeSingle();
    if (data) {
      return { entity_type: 'funnel_item', entity_id: data.id, method: 'phc_customer_id', confidence: 1, candidates: 1, snapshot_updated_at: data.updated_at };
    }
  }

  // 2. nif_normalized — unique when exactly one candidate
  if (n.nif_normalized) {
    const { data } = await sb.from('funnel_items')
      .select('id, updated_at')
      .eq('nif_normalized', n.nif_normalized);
    if (data && data.length === 1) {
      return { entity_type: 'funnel_item', entity_id: data[0].id, method: 'nif', confidence: 0.95, candidates: 1, snapshot_updated_at: data[0].updated_at };
    }
    if (data && data.length > 1) {
      return { ...none, method: 'conflict', candidates: data.length };
    }
  }

  // 3. organization_email — suggestion
  if (n.organization_email) {
    let q = sb.from('funnel_items').select('id, updated_at').eq('contact_email', n.organization_email);
    if (ctx.program_id) q = q.eq('program_id', ctx.program_id);
    const { data } = await q;
    if (data && data.length === 1) {
      return { entity_type: 'funnel_item', entity_id: data[0].id, method: 'email', confidence: 0.6, candidates: 1, snapshot_updated_at: data[0].updated_at };
    }
    if (data && data.length > 1) {
      return { ...none, method: 'conflict', candidates: data.length };
    }
  }

  // 4. organization_name — suggestion (never auto)
  if (n.organization_name) {
    let q = sb.from('funnel_items').select('id, updated_at').ilike('organization_name', n.organization_name);
    if (ctx.program_id) q = q.eq('program_id', ctx.program_id);
    const { data } = await q.limit(2);
    if (data && data.length === 1) {
      return { entity_type: 'funnel_item', entity_id: data[0].id, method: 'name', confidence: 0.35, candidates: 1, snapshot_updated_at: data[0].updated_at };
    }
    if (data && data.length > 1) {
      return { ...none, method: 'conflict', candidates: data.length };
    }
  }

  return none;
}

// ---- Row hash (canonical JSON of normalized row) ------------------------
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function canonicalJson(v: any): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalJson).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + canonicalJson(v[k])).join(',') + '}';
}

export async function phcRowHash(normalized: PhcCanonicalRow): Promise<string> {
  return sha256Hex(canonicalJson(normalized));
}
