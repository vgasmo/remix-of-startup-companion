// Client mirror of pure normalization helpers used by the HubSpot importer
// edge functions. Kept in sync manually so we can unit-test with Vitest and
// reuse in the UI where helpful. Do not add logic here without mirroring it
// in `supabase/functions/_shared/hubspotImport.ts`.

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

export const DEFAULT_STAGE_MAP: Record<string, string> = {
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
