// Question packs for the Guided Financial Plan.
// Each question is anchored to (a) an assumption key persisted in financial_assumptions,
// (b) a rubric-relevant category, (c) the canonical Excel cell it feeds (mapped in
// financial_cell_map). Values are locale-safe numeric or JSON.

export type QuestionKind = 'number' | 'percent' | 'currency' | 'integer' | 'text' | 'json';

export interface QuestionDef {
  key: string;
  labelKey: string;          // i18n key; defaultValue must be provided at usage
  defaultLabel: string;
  helpKey?: string;
  defaultHelp?: string;
  unit?: string;
  kind: QuestionKind;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  excelHint?: string;        // e.g. "Pressupostos!D11"
}

export interface QuestionPack {
  id: string;
  labelKey: string;
  defaultLabel: string;
  descriptionKey: string;
  defaultDescription: string;
  questions: QuestionDef[];
  /**
   * When present, this pack is only shown if the founder's diagnostic answer
   * for the given key matches one of the listed values. Example: SaaS unit
   * economics only runs when `revenue_model` is `subscription` or `mixed`,
   * so a bakery (one_off / transactional) skips it entirely.
   * Missing/empty ⇒ always shown.
   */
  showWhen?: Partial<Record<string, string[]>>;
}

export const DIAGNOSTIC_KEYS = [
  'activity',           // e.g. saas | services | product | marketplace | other
  'sector',
  'stage',              // ideation | validation | mvp | growth | scale
  'revenue_model',      // subscription | transactional | one_off | mixed
  'traction',           // pre_revenue | early_revenue | recurring
  'horizon_months',     // 12 | 24 | 36 | 60
  'objective',          // fundraising | operational | grant | internal
] as const;
export type DiagnosticKey = typeof DIAGNOSTIC_KEYS[number];

export const QUESTION_PACKS: QuestionPack[] = [
  {
    id: 'company',
    labelKey: 'financialPlan.pack.company',
    defaultLabel: 'Company setup',
    descriptionKey: 'financialPlan.pack.companyDesc',
    defaultDescription: 'Fiscal setup, inflation and growth defaults.',
    questions: [
      { key: 'tax.irc_rate', defaultLabel: 'Corporate tax rate (IRC)', labelKey: 'financialPlan.q.ircRate', kind: 'percent', unit: '%', excelHint: 'Pressupostos!D11', step: 0.01, min: 0, max: 100 },
      { key: 'macro.inflation_rate', defaultLabel: 'Annual inflation', labelKey: 'financialPlan.q.inflation', kind: 'percent', unit: '%', excelHint: 'Pressupostos!D18', step: 0.01, min: 0, max: 100 },
      { key: 'macro.growth_rate', defaultLabel: 'Annual growth rate', labelKey: 'financialPlan.q.growth', kind: 'percent', unit: '%', excelHint: 'Pressupostos!D19', step: 0.01, min: 0, max: 500 },
    ],
  },
  {
    id: 'revenue',
    labelKey: 'financialPlan.pack.revenue',
    defaultLabel: 'Revenue & pricing',
    descriptionKey: 'financialPlan.pack.revenueDesc',
    defaultDescription: 'Volumes, prices and growth for each revenue line.',
    questions: [
      { key: 'revenue.item1.name', defaultLabel: 'Main product / service name', labelKey: 'financialPlan.q.item1Name', kind: 'text', excelHint: 'Pressupostos!F60' },
      { key: 'revenue.item1.qty_y1', defaultLabel: 'Units sold — Year 1', labelKey: 'financialPlan.q.item1QtyY1', kind: 'integer', min: 0, excelHint: 'Pressupostos!G62' },
      { key: 'revenue.item1.price', defaultLabel: 'Unit price (€)', labelKey: 'financialPlan.q.item1Price', kind: 'currency', unit: '€', min: 0, step: 0.01, excelHint: 'Pressupostos!G63' },
      { key: 'revenue.item1.growth', defaultLabel: 'YoY growth', labelKey: 'financialPlan.q.item1Growth', kind: 'percent', unit: '%', excelHint: 'Pressupostos!G64', step: 0.01 },
    ],
  },
  {
    id: 'costs',
    labelKey: 'financialPlan.pack.costs',
    defaultLabel: 'Costs & COGS',
    descriptionKey: 'financialPlan.pack.costsDesc',
    defaultDescription: 'Direct costs (CMVMC) and gross margin drivers.',
    questions: [
      { key: 'cost.cmvmc_pct', defaultLabel: '% CMVMC / Sales', labelKey: 'financialPlan.q.cmvmc', kind: 'percent', unit: '%', excelHint: 'Pressupostos!D91', step: 0.01 },
      { key: 'cost.gross_margin_target', defaultLabel: 'Target gross margin', labelKey: 'financialPlan.q.grossMarginTarget', kind: 'percent', unit: '%', step: 0.01 },
    ],
  },
  {
    id: 'team',
    labelKey: 'financialPlan.pack.team',
    defaultLabel: 'Team & payroll',
    descriptionKey: 'financialPlan.pack.teamDesc',
    defaultDescription: 'Headcount plan and average compensation.',
    questions: [
      { key: 'team.headcount_y1', defaultLabel: 'Headcount — Year 1', labelKey: 'financialPlan.q.headcountY1', kind: 'integer', min: 0 },
      { key: 'team.avg_salary_month', defaultLabel: 'Average monthly gross salary (€)', labelKey: 'financialPlan.q.avgSalary', kind: 'currency', unit: '€', min: 0, step: 50 },
    ],
  },
  {
    id: 'capex_financing',
    labelKey: 'financialPlan.pack.capexFinancing',
    defaultLabel: 'CAPEX & financing',
    descriptionKey: 'financialPlan.pack.capexFinancingDesc',
    defaultDescription: 'Investment plan, equity raise and debt financing.',
    questions: [
      { key: 'capex.total_y1', defaultLabel: 'CAPEX — Year 1 (€)', labelKey: 'financialPlan.q.capexY1', kind: 'currency', unit: '€', min: 0, step: 100 },
      { key: 'finance.equity_raise', defaultLabel: 'Equity to raise (€)', labelKey: 'financialPlan.q.equityRaise', kind: 'currency', unit: '€', min: 0, step: 100 },
      { key: 'finance.debt', defaultLabel: 'Debt financing (€)', labelKey: 'financialPlan.q.debt', kind: 'currency', unit: '€', min: 0, step: 100 },
      { key: 'finance.debt_rate', defaultLabel: 'Debt interest rate', labelKey: 'financialPlan.q.debtRate', kind: 'percent', unit: '%', min: 0, max: 100, step: 0.01 },
    ],
  },
  {
    id: 'unit_economics',
    labelKey: 'financialPlan.pack.unitEconomics',
    defaultLabel: 'Unit economics',
    descriptionKey: 'financialPlan.pack.unitEconomicsDesc',
    defaultDescription: 'CAC, LTV, churn — SaaS founders should fill this pack.',
    showWhen: { revenue_model: ['subscription', 'mixed'] },
    questions: [
      { key: 'ue.cac', defaultLabel: 'CAC — customer acquisition cost (€)', labelKey: 'financialPlan.q.cac', kind: 'currency', unit: '€', min: 0, step: 1 },
      { key: 'ue.arpu_month', defaultLabel: 'ARPU (€ / month)', labelKey: 'financialPlan.q.arpu', kind: 'currency', unit: '€', min: 0, step: 1 },
      { key: 'ue.gross_margin_pct', defaultLabel: 'Gross margin %', labelKey: 'financialPlan.q.gmPct', kind: 'percent', unit: '%', min: 0, max: 100, step: 0.1 },
      { key: 'ue.churn_monthly_pct', defaultLabel: 'Monthly churn %', labelKey: 'financialPlan.q.churnMonthly', kind: 'percent', unit: '%', min: 0, max: 100, step: 0.1 },
    ],
  },
];

export function packById(id: string): QuestionPack | undefined {
  return QUESTION_PACKS.find(p => p.id === id);
}
