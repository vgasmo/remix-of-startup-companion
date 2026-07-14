// Shared HubSpot import primitives: header aliases, normalization, matching
// engine and row-hash helpers. Used by both `prepare-hubspot-import` and
// `commit-hubspot-import` so dry-run counts equal commit decisions when data
// hasn't changed. NEVER mutates data — pure read/normalize/match logic only.

// deno-lint-ignore-file no-explicit-any

// ---- Header aliases -------------------------------------------------------
export const HEADER_ALIASES: Record<string, string[]> = {
  organization_name: ['Company name', 'Empresa', 'Organization', 'Nome da empresa', 'company_name', 'organization_name'],
  contact_name: ['Contact', 'Contact name', 'Nome do contacto', 'contact_name', 'Nome'],
  contact_email: ['Email', 'E-mail', 'email', 'contact_email', 'Email Final', 'email_final'],
  phone: ['Phone', 'Telefone', 'Contact phone', 'phone', 'contact_phone'],
  nif: ['NIF', 'VAT', 'Tax ID', 'NIF/VAT', 'vat', 'nif'],
  deal_id: ['Deal ID', 'deal_id', 'ID do negócio', 'HubSpot Deal ID', 'Record ID'],
  contact_id: ['Contact ID', 'contact_id', 'ID do contacto', 'HubSpot Contact ID'],
  company_id: ['Company ID', 'company_id', 'ID da empresa', 'HubSpot Company ID'],
  deal_stage: ['Deal Stage', 'Etapa', 'Estágio', 'Stage', 'deal_stage'],
  owner_name: ['Deal Owner', 'Owner', 'Consultor', 'owner_name'],
  owner_email: ['Owner Email', 'Deal Owner Email', 'owner_email'],
  owner_id: ['Owner ID', 'HubSpot Owner ID', 'owner_id'],
  sector: ['Sector', 'Setor', 'Sector/Industry', 'sector', 'industry'],
  building: ['Building', 'Edifício', 'Space', 'Espaço', 'building', 'edificio'],
  service: ['Service', 'Serviço', 'Complementary Service', 'service'],
  activity_description: ['Activity', 'Description', 'Descrição', 'activity_description', 'activity'],
};

export function findHeaderKey(headers: string[], internal: string): string | null {
  const aliases = HEADER_ALIASES[internal] ?? [];
  const lc = headers.map(h => h.trim().toLowerCase());
  for (const a of aliases) {
    const i = lc.indexOf(a.toLowerCase());
    if (i >= 0) return headers[i];
  }
  return null;
}

export function autoMapHeaders(headers: string[]): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  for (const key of Object.keys(HEADER_ALIASES)) map[key] = findHeaderKey(headers, key);
  return map;
}

// ---- Normalizers ---------------------------------------------------------
export function normEmail(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
}

export function normNif(v: unknown): string | null {
  if (!v) return null;
  const digits = String(v).replace(/\D+/g, '');
  return digits.length >= 8 ? digits : null;
}

export function normPhone(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).replace(/[^\d+]/g, '');
  return s.length >= 7 ? s : null;
}

export function normCompany(v: unknown): string | null {
  if (!v) return null;
  const s = String(v).trim().replace(/\s+/g, ' ');
  return s || null;
}

export function normHubspotId(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  return /^[0-9A-Za-z_-]+$/.test(s) ? s : null;
}

export function extractEmailFromText(text: string): string | null {
  const m = text?.match?.(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? normEmail(m[0]) : null;
}

// ---- Stage mapping (configurable) ----------------------------------------
export const DEFAULT_STAGE_MAP: Record<string, string> = {
  // ONLY safe, deterministic mappings. Tier A/B/C stay in review.
  'won': 'contracted',
  'ganho': 'contracted',
  'closed won': 'contracted',
  'closedwon': 'contracted',
  'lost': 'lost',
  'perdido': 'lost',
  'closed lost': 'lost',
  'closedlost': 'lost',
  'discovery': 'discovery',
  'qualification': 'qualified',
  'qualified': 'qualified',
  'meeting': 'meeting',
  'proposal': 'proposal',
  'proposta': 'proposal',
  'negotiation': 'negotiation',
  'negociação': 'negotiation',
};

export function mapStage(hs: string | null | undefined, custom: Record<string, string> = {}): string | null {
  if (!hs) return null;
  const s = String(hs).toLowerCase().trim();
  return custom[s] ?? DEFAULT_STAGE_MAP[s] ?? null;
}

// ---- Row hash ------------------------------------------------------------
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

export async function rowHash(normalized: any): Promise<string> {
  return sha256Hex(canonicalJson(normalized));
}

// ---- Normalization from raw row -----------------------------------------
export interface NormalizedRow {
  organization_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  phone: string | null;
  nif: string | null;
  deal_id: string | null;
  contact_id: string | null;
  company_id: string | null;
  deal_stage: string | null;
  resolved_stage: string | null;
  owner_name: string | null;
  owner_email: string | null;
  owner_id: string | null;
  sector: string | null;
  building: string | null;
  service: string | null;
  activity_description: string | null;
}

function get(raw: Record<string, unknown>, mapping: Record<string, string | null>, key: string): string | null {
  const col = mapping[key];
  if (!col) return null;
  const v = raw[col];
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

export function normalizeRow(
  raw: Record<string, unknown>,
  mapping: Record<string, string | null>,
  stageMap: Record<string, string> = {},
): NormalizedRow {
  const contactRaw = get(raw, mapping, 'contact_name');
  let email = normEmail(get(raw, mapping, 'contact_email'));
  if (!email && contactRaw) email = extractEmailFromText(contactRaw);
  const stageRaw = get(raw, mapping, 'deal_stage');
  return {
    organization_name: normCompany(get(raw, mapping, 'organization_name')),
    contact_name: contactRaw,
    contact_email: email,
    phone: normPhone(get(raw, mapping, 'phone')),
    nif: normNif(get(raw, mapping, 'nif')),
    deal_id: normHubspotId(get(raw, mapping, 'deal_id')),
    contact_id: normHubspotId(get(raw, mapping, 'contact_id')),
    company_id: normHubspotId(get(raw, mapping, 'company_id')),
    deal_stage: stageRaw,
    resolved_stage: mapStage(stageRaw, stageMap),
    owner_name: get(raw, mapping, 'owner_name'),
    owner_email: normEmail(get(raw, mapping, 'owner_email')),
    owner_id: normHubspotId(get(raw, mapping, 'owner_id')),
    sector: get(raw, mapping, 'sector'),
    building: get(raw, mapping, 'building'),
    service: get(raw, mapping, 'service'),
    activity_description: get(raw, mapping, 'activity_description'),
  };
}

// ---- Validation ----------------------------------------------------------
export function validateRow(n: NormalizedRow): string[] {
  const errs: string[] = [];
  if (!n.organization_name && !n.contact_email && !n.deal_id && !n.company_id) {
    errs.push('missing_identifier');
  }
  return errs;
}

// ---- Matching engine -----------------------------------------------------
export type MatchMethod =
  | 'hubspot_deal_id'
  | 'hubspot_company_id'
  | 'nif'
  | 'email'
  | 'name'
  | 'none'
  | 'conflict';

export interface MatchResult {
  entity_type: 'funnel_item' | null;
  entity_id: string | null;
  method: MatchMethod;
  confidence: number; // 0..1
  candidates: number;
  snapshot_updated_at: string | null;
}

export interface MatchCtx {
  supabase: any; // SupabaseClient
  program_id?: string | null;
}

export async function matchRow(n: NormalizedRow, ctx: MatchCtx): Promise<MatchResult> {
  const sb = ctx.supabase;
  const noMatch: MatchResult = {
    entity_type: null, entity_id: null, method: 'none',
    confidence: 0, candidates: 0, snapshot_updated_at: null,
  };

  // 1. Deal ID via external_entity_refs (deterministic, cross-program)
  if (n.deal_id) {
    const { data } = await sb.from('external_entity_refs')
      .select('internal_entity_type, internal_entity_id')
      .eq('provider', 'hubspot').eq('object_type', 'deal').eq('external_id', n.deal_id)
      .maybeSingle();
    if (data?.internal_entity_id && data.internal_entity_type === 'funnel_item') {
      const { data: fi } = await sb.from('funnel_items').select('id, updated_at').eq('id', data.internal_entity_id).maybeSingle();
      if (fi) return { entity_type: 'funnel_item', entity_id: fi.id, method: 'hubspot_deal_id', confidence: 1, candidates: 1, snapshot_updated_at: fi.updated_at };
    }
  }

  // 2. Company ID via external_entity_refs + program filter (if provided)
  if (n.company_id) {
    const { data: refs } = await sb.from('external_entity_refs')
      .select('internal_entity_id')
      .eq('provider','hubspot').eq('object_type','company').eq('external_id', n.company_id);
    const ids = (refs ?? []).map((r: any) => r.internal_entity_id);
    if (ids.length > 0) {
      let q = sb.from('funnel_items').select('id, updated_at, program_id').in('id', ids);
      if (ctx.program_id) q = q.eq('program_id', ctx.program_id);
      const { data: rows } = await q;
      if (rows && rows.length === 1) return { entity_type: 'funnel_item', entity_id: rows[0].id, method: 'hubspot_company_id', confidence: 0.95, candidates: 1, snapshot_updated_at: rows[0].updated_at };
      if (rows && rows.length > 1) return { ...noMatch, method: 'conflict', candidates: rows.length };
    }
  }

  // 3. NIF + program (stored in funnel_items.metadata_json->>'nif')
  if (n.nif) {
    let q = sb.from('funnel_items').select('id, updated_at').eq('metadata_json->>nif', n.nif);
    if (ctx.program_id) q = q.eq('program_id', ctx.program_id);
    const { data } = await q;
    if (data && data.length === 1) return { entity_type: 'funnel_item', entity_id: data[0].id, method: 'nif', confidence: 0.9, candidates: 1, snapshot_updated_at: data[0].updated_at };
    if (data && data.length > 1) return { ...noMatch, method: 'conflict', candidates: data.length };
  }

  // 4. Email + program (lower confidence)
  if (n.contact_email) {
    let q = sb.from('funnel_items').select('id, updated_at').eq('contact_email', n.contact_email);
    if (ctx.program_id) q = q.eq('program_id', ctx.program_id);
    const { data } = await q;
    if (data && data.length === 1) return { entity_type: 'funnel_item', entity_id: data[0].id, method: 'email', confidence: 0.7, candidates: 1, snapshot_updated_at: data[0].updated_at };
    if (data && data.length > 1) return { ...noMatch, method: 'conflict', candidates: data.length };
  }

  // 5. Company name — suggestion only (never auto)
  if (n.organization_name) {
    let q = sb.from('funnel_items').select('id, updated_at').ilike('organization_name', n.organization_name);
    if (ctx.program_id) q = q.eq('program_id', ctx.program_id);
    const { data } = await q.limit(2);
    if (data && data.length === 1) return { entity_type: 'funnel_item', entity_id: data[0].id, method: 'name', confidence: 0.4, candidates: 1, snapshot_updated_at: data[0].updated_at };
    if (data && data.length > 1) return { ...noMatch, method: 'conflict', candidates: data.length };
  }

  return noMatch;
}

// ---- File hash (SHA-256 of Uint8Array) -----------------------------------
export async function fileSha256(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
