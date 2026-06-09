// Mirror of the server-side playbook catalog (key/name/stage only) for client UI.
// Keep in sync with supabase/functions/_shared/playbook-catalog.ts.
// Server is source of truth for the action items themselves.

export type PlaybookStage = "ideation" | "validation" | "mvp" | "growth" | "scale" | "any";

export interface PlaybookSummary {
  key: string;
  name: string;
  stage: PlaybookStage;
}

export const PLAYBOOKS: PlaybookSummary[] = [
  // Ideation
  { key: "problem-discovery", name: "Problem Discovery", stage: "ideation" },
  { key: "jtbd-canvas", name: "JTBD Canvas", stage: "ideation" },
  { key: "persona-one-pager", name: "Persona One-Pager", stage: "ideation" },
  // Validation
  { key: "customer-interview-script", name: "Customer Interview Script", stage: "validation" },
  { key: "design-partner-agreement", name: "Design Partner Agreement", stage: "validation" },
  { key: "smoke-test", name: "Smoke Test / Landing Page", stage: "validation" },
  // MVP
  { key: "mvp-scope-cuts", name: "MVP Scope Cuts", stage: "mvp" },
  { key: "activation-funnel", name: "Activation Funnel", stage: "mvp" },
  { key: "first-10-customers", name: "First 10 Customers", stage: "mvp" },
  // Growth
  { key: "unit-economics-101", name: "Unit Economics 101", stage: "growth" },
  { key: "ltv-cac-deep-dive", name: "LTV:CAC Deep-Dive", stage: "growth" },
  { key: "channel-market-fit", name: "Channel-Market Fit", stage: "growth" },
  { key: "retention-cohorts", name: "Retention Cohorts", stage: "growth" },
  { key: "pricing-experiments", name: "Pricing Experiments", stage: "growth" },
  { key: "sales-playbook-v1", name: "Sales Playbook v1", stage: "growth" },
  // Scale
  { key: "org-chart-hiring-plan", name: "Org Chart & Hiring Plan", stage: "scale" },
  { key: "okrs-trimestrais", name: "OKRs Trimestrais", stage: "scale" },
  { key: "fundraising-readiness", name: "Fundraising Readiness", stage: "scale" },
  { key: "series-a-data-room", name: "Series A Data Room", stage: "scale" },
  { key: "expansion-playbook", name: "Expansion Playbook", stage: "scale" },
  { key: "board-management", name: "Board Management", stage: "scale" },
];

const PLAYBOOK_BY_KEY = new Map(PLAYBOOKS.map((p) => [p.key, p]));

/**
 * Detect playbook references in a copilot answer.
 * Matches either the canonical name (case-insensitive) or quoted variants.
 */
export function detectPlaybooks(text: string): PlaybookSummary[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const found = new Map<string, PlaybookSummary>();
  for (const pb of PLAYBOOKS) {
    const needle = pb.name.toLowerCase();
    if (lower.includes(needle)) {
      found.set(pb.key, pb);
    }
  }
  return Array.from(found.values());
}

export function getPlaybook(key: string): PlaybookSummary | undefined {
  return PLAYBOOK_BY_KEY.get(key);
}
