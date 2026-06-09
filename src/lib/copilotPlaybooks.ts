// Mirror of the server-side playbook catalog (key/name/stage only) for client UI.
// Keep in sync with supabase/functions/_shared/playbook-catalog.ts.
// Server is source of truth for the action items themselves.

export type PlaybookStage = "ideation" | "validation" | "mvp" | "growth" | "scale" | "any";

export interface PlaybookSummary {
  key: string;
  name: string;
  stage: PlaybookStage;
  /** Extra phrases the Copilot may use; matched in addition to `name`. */
  aliases?: string[];
}

export const PLAYBOOKS: PlaybookSummary[] = [
  // Ideation
  {
    key: "problem-discovery",
    name: "Problem Discovery",
    stage: "ideation",
    aliases: ["descoberta de problema", "discovery do problema", "problem-discovery"],
  },
  {
    key: "jtbd-canvas",
    name: "JTBD Canvas",
    stage: "ideation",
    aliases: ["jobs to be done canvas", "canvas jtbd", "jobs-to-be-done"],
  },
  {
    key: "persona-one-pager",
    name: "Persona One-Pager",
    stage: "ideation",
    aliases: ["persona one pager", "one-pager de persona", "persona onepager"],
  },
  // Validation
  {
    key: "customer-interview-script",
    name: "Customer Interview Script",
    stage: "validation",
    aliases: ["guiao de entrevista", "guião de entrevista", "script de entrevista", "interview script"],
  },
  {
    key: "design-partner-agreement",
    name: "Design Partner Agreement",
    stage: "validation",
    aliases: ["design partners", "acordo de design partner"],
  },
  {
    key: "smoke-test",
    name: "Smoke Test / Landing Page",
    stage: "validation",
    aliases: ["smoke test", "landing page test", "teste de landing page"],
  },
  // MVP
  {
    key: "mvp-scope-cuts",
    name: "MVP Scope Cuts",
    stage: "mvp",
    aliases: ["scope cuts", "cortes de scope", "scope do mvp"],
  },
  {
    key: "activation-funnel",
    name: "Activation Funnel",
    stage: "mvp",
    aliases: ["funil de ativacao", "funil de ativação", "activation"],
  },
  {
    key: "first-10-customers",
    name: "First 10 Customers",
    stage: "mvp",
    aliases: ["primeiros 10 clientes", "first ten customers", "primeiros dez clientes"],
  },
  // Growth
  {
    key: "unit-economics-101",
    name: "Unit Economics 101",
    stage: "growth",
    aliases: ["unit economics", "unit economics basico", "unit economics básico"],
  },
  {
    key: "ltv-cac-deep-dive",
    name: "LTV:CAC Deep-Dive",
    stage: "growth",
    aliases: ["ltv cac deep dive", "ltv/cac deep dive", "ltv cac", "ltv/cac", "ltv:cac"],
  },
  {
    key: "channel-market-fit",
    name: "Channel-Market Fit",
    stage: "growth",
    aliases: ["channel market fit", "fit canal mercado"],
  },
  {
    key: "retention-cohorts",
    name: "Retention Cohorts",
    stage: "growth",
    aliases: ["cohorts de retencao", "cohorts de retenção", "coortes de retencao", "coortes de retenção"],
  },
  {
    key: "pricing-experiments",
    name: "Pricing Experiments",
    stage: "growth",
    aliases: ["experiencias de pricing", "experiências de pricing", "ab test de preco", "ab test de preço", "testes de pricing"],
  },
  {
    key: "sales-playbook-v1",
    name: "Sales Playbook v1",
    stage: "growth",
    aliases: ["sales playbook", "playbook de vendas", "manual de vendas"],
  },
  // Scale
  {
    key: "org-chart-hiring-plan",
    name: "Org Chart & Hiring Plan",
    stage: "scale",
    aliases: ["org chart e hiring plan", "plano de contratacoes", "plano de contratações", "hiring plan", "organograma"],
  },
  {
    key: "okrs-trimestrais",
    name: "OKRs Trimestrais",
    stage: "scale",
    aliases: ["okrs", "objectives and key results", "okr trimestral"],
  },
  {
    key: "fundraising-readiness",
    name: "Fundraising Readiness",
    stage: "scale",
    aliases: ["preparacao fundraising", "preparação fundraising", "readiness de fundraising", "prep fundraising"],
  },
  {
    key: "series-a-data-room",
    name: "Series A Data Room",
    stage: "scale",
    aliases: ["data room series a", "data room serie a", "data room série a", "dataroom series a"],
  },
  {
    key: "expansion-playbook",
    name: "Expansion Playbook",
    stage: "scale",
    aliases: ["land and expand", "playbook de expansao", "playbook de expansão", "expansao geografica", "expansão geográfica"],
  },
  {
    key: "board-management",
    name: "Board Management",
    stage: "scale",
    aliases: ["gestao de board", "gestão de board", "board pack", "board meetings"],
  },
];

const PLAYBOOK_BY_KEY = new Map(PLAYBOOKS.map((p) => [p.key, p]));

/**
 * Normalize a string for fuzzy matching:
 * - lowercase
 * - strip diacritics
 * - replace any non-alphanumeric run (punctuation, markdown, etc.) with a single space
 * - collapse whitespace, surround with spaces for word-boundary tests
 */
function normalize(input: string): string {
  if (!input) return " ";
  const stripped = input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return ` ${stripped} `;
}

/**
 * Word-boundary "contains" check on already-normalized strings.
 * Both inputs must come from `normalize()` (they're padded with spaces).
 */
function containsPhrase(haystack: string, needle: string): boolean {
  if (needle.trim().length < 3) return false;
  return haystack.includes(needle);
}

interface PhraseEntry {
  pb: PlaybookSummary;
  phrase: string;   // normalized, space-padded
  length: number;   // raw length for prioritization
}

// Pre-compute all matchable phrases (name + aliases), sorted longest-first
// so the most specific match wins (e.g. "Unit Economics 101" before "Unit Economics").
const PHRASE_INDEX: PhraseEntry[] = PLAYBOOKS.flatMap((pb) => {
  const variants = [pb.name, ...(pb.aliases ?? [])];
  return variants
    .map((v) => ({ pb, phrase: normalize(v), length: v.length }))
    .filter((e) => e.phrase.trim().length >= 3);
}).sort((a, b) => b.length - a.length);

/**
 * Detect playbook references in a copilot answer.
 * Tolerates: quotes, markdown bold/italic, accents, punctuation, casing,
 * PT/EN variations, and partial canonical names (via aliases).
 */
export function detectPlaybooks(text: string): PlaybookSummary[] {
  if (!text) return [];
  const haystack = normalize(text);
  const found = new Map<string, PlaybookSummary>();

  // Walk phrases longest-first; once a playbook is matched once, skip its other phrases.
  for (const { pb, phrase } of PHRASE_INDEX) {
    if (found.has(pb.key)) continue;
    if (containsPhrase(haystack, phrase)) {
      found.set(pb.key, pb);
    }
  }
  return Array.from(found.values());
}

export function getPlaybook(key: string): PlaybookSummary | undefined {
  return PLAYBOOK_BY_KEY.get(key);
}

// Exported for tests / debugging.
export const __test__ = { normalize, PHRASE_INDEX };
