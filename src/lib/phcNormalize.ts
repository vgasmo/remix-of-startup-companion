// PHC "Clientes por Tipologia" import normalisers.
//
// Kept in sync with `supabase/functions/_shared/phcImport.ts`. Every function
// here MUST be pure and deterministic so both the browser preview and the
// server-side edge functions produce identical `raw_json` / `normalized_json`
// / `row_hash` triplets — that's how idempotency is enforced.
//
// Never invent, infer, or default missing values here. Missing = null.

import { normEmail, normPhone, normCompany, extractEmailFromText } from './hubspotNormalize';

/** Portuguese NIF checksum (mod-11). Returns the 9-digit string when valid. */
export function normNifPT(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const digits = String(v).replace(/\D+/g, '');
  if (digits.length !== 9) return null;
  const first = digits[0];
  // Accept known valid prefixes: 1,2,3 individuals; 5 companies; 6 public; 8 sole traders;
  // 45 non-resident individuals; 70/71/72/74/75/77/79/90/98/99 misc. Reject 0/4/6-off-prefix.
  if (!/^[125689]/.test(first) && !/^(45|70|71|72|74|75|77|79|90|98|99)/.test(digits)) return null;
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(digits[i]) * (9 - i);
  const check = 11 - (sum % 11);
  const expected = check >= 10 ? 0 : check;
  return Number(digits[8]) === expected ? digits : null;
}

/**
 * Foreign tax identifier passthrough. Trims + uppercases + strips whitespace runs.
 * Returned string is prefixed with `foreign:` so it cannot collide with a
 * Portuguese NIF in the `nif_normalized` unique index.
 */
export function normForeignTaxId(v: unknown, countryCode: string | null): string | null {
  if (!v) return null;
  const s = String(v).trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return null;
  const cc = (countryCode ?? 'XX').toUpperCase().slice(0, 2);
  return `foreign:${cc}:${s}`;
}

/**
 * NIF resolver used by PHC ingestion. Tries PT-mode first; falls back to
 * foreign passthrough when a country other than Portugal (or unknown) is
 * declared on the PHC row.
 */
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
    // Country says PT (or unknown) but checksum fails: mark as invalid instead
    // of silently classifying as foreign — matches the spec's "flag invalid
    // but preserve original source values".
    return { normalized: null, kind: 'invalid' };
  }
  const foreign = normForeignTaxId(raw, country);
  return foreign ? { normalized: foreign, kind: 'foreign' } : { normalized: null, kind: 'invalid' };
}

/**
 * Formula-injection guard for CSV/XLSX preview + export cells. Prefixes a
 * single-quote when the cell content would be interpreted as a formula by
 * Excel / LibreOffice / Google Sheets on import.
 */
export function sanitizePreviewCell(v: unknown): unknown {
  if (typeof v !== 'string') return v;
  if (v.length === 0) return v;
  const first = v.charAt(0);
  if (first === '=' || first === '+' || first === '-' || first === '@' || first === '\t' || first === '\r') {
    return `'${v}`;
  }
  return v;
}

/** Canonical PHC row after parsing. Every field is optional. */
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

const HEADER_ALIASES: Record<keyof Omit<PhcCanonicalRow, 'nif_normalized' | 'nif_kind' | 'validation_errors'>, string[]> = {
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

/** Build a header → canonical-field map from PHC XLSX headers. */
export function buildPhcHeaderMap(headers: string[]): Record<string, keyof PhcCanonicalRow> {
  const map: Record<string, keyof PhcCanonicalRow> = {};
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const targets = Object.entries(HEADER_ALIASES) as [keyof PhcCanonicalRow, string[]][];
  for (const raw of headers) {
    const n = norm(raw);
    for (const [field, aliases] of targets) {
      if (aliases.includes(n)) { map[raw] = field; break; }
    }
  }
  return map;
}

/**
 * Parse a single raw PHC row (dict keyed by original header) into the canonical
 * shape. `raw_json` should be the *input* to this function so provenance is
 * preserved verbatim.
 */
export function parsePhcRow(
  raw: Record<string, unknown>,
  headerMap: Record<string, keyof PhcCanonicalRow>,
): PhcCanonicalRow {
  const out: Partial<PhcCanonicalRow> = {};
  for (const [header, value] of Object.entries(raw)) {
    const field = headerMap[header];
    if (!field) continue;
    (out as Record<string, unknown>)[field] = value === '' ? null : value;
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
