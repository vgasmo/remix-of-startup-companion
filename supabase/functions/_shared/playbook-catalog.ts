// Shared catalog of playbooks the Copilot can apply to a workspace.
// Mirrors the prose library in copilot-chat/index.ts (one-pager).
// Each playbook → 1 milestone + N action items (with offset_days from "now").

export type PlaybookAction = {
  title: string;
  description?: string;
  offset_days?: number; // days from creation; default 14
  priority?: "low" | "medium" | "high" | "urgent";
};

export type Playbook = {
  key: string;
  name: string;          // canonical name as referenced in copilot answers
  stage: "ideation" | "validation" | "mvp" | "growth" | "scale" | "any";
  milestone_title: string;
  description: string;
  actions: PlaybookAction[];
};

export const PLAYBOOK_CATALOG = {
  // ── IDEATION ─────────────────────────────────────────────
  "problem-discovery": {
    key: "problem-discovery",
    name: "Problem Discovery",
    stage: "ideation",
    milestone_title: "Problem Discovery",
    description: "Validar que existe um problema real, doloroso e frequente.",
    actions: [
      { title: "Mapear 3 hipóteses de problema", offset_days: 3, priority: "high" },
      { title: "Identificar 10 pessoas afetadas para entrevistar", offset_days: 5 },
      { title: "Conduzir 10 entrevistas exploratórias (sem mencionar solução)", offset_days: 14, priority: "high" },
      { title: "Quantificar dor (1-10) e frequência por entrevistado", offset_days: 16 },
      { title: "Escrever one-pager de síntese do problema", offset_days: 21 },
    ],
  },
  "jtbd-canvas": {
    key: "jtbd-canvas",
    name: "JTBD Canvas",
    stage: "ideation",
    milestone_title: "JTBD Canvas",
    description: "Articular o trabalho (job) que o cliente quer realizar.",
    actions: [
      { title: "Preencher template JTBD: 'Quando…, quero…, para…'", offset_days: 3, priority: "high" },
      { title: "Listar soluções atuais e respetivas frustrações", offset_days: 5 },
      { title: "Validar JTBD com 5 entrevistas adicionais", offset_days: 14 },
    ],
  },
  "persona-one-pager": {
    key: "persona-one-pager",
    name: "Persona One-Pager",
    stage: "ideation",
    milestone_title: "Persona One-Pager",
    description: "Documento de uma página com persona, contexto e willingness-to-pay.",
    actions: [
      { title: "Definir demografia e contexto da persona", offset_days: 3 },
      { title: "Listar triggers e alternativas atuais", offset_days: 5 },
      { title: "Estimar willingness-to-pay inicial", offset_days: 7 },
    ],
  },

  // ── VALIDATION ───────────────────────────────────────────
  "customer-interview-script": {
    key: "customer-interview-script",
    name: "Customer Interview Script",
    stage: "validation",
    milestone_title: "Customer Interview Script",
    description: "Guião de entrevista focado em comportamento passado, não em opiniões.",
    actions: [
      { title: "Escrever guião com 5 secções (contexto, problema, custo, mockup, pricing)", offset_days: 3, priority: "high" },
      { title: "Testar guião com 2 entrevistas piloto", offset_days: 7 },
      { title: "Conduzir 10 entrevistas seguindo o guião", offset_days: 21, priority: "high" },
      { title: "Compilar insights e padrões", offset_days: 24 },
    ],
  },
  "design-partner-agreement": {
    key: "design-partner-agreement",
    name: "Design Partner Agreement",
    stage: "validation",
    milestone_title: "Design Partners — 3 a 5",
    description: "Onboarding de design partners com feedback semanal estruturado.",
    actions: [
      { title: "Redigir acordo leve (acesso vs. feedback)", offset_days: 5 },
      { title: "Fechar 3-5 design partners", offset_days: 21, priority: "high" },
      { title: "Estabelecer ritual semanal de feedback", offset_days: 28 },
    ],
  },
  "smoke-test": {
    key: "smoke-test",
    name: "Smoke Test / Landing Page",
    stage: "validation",
    milestone_title: "Smoke Test",
    description: "Landing page + CTA para medir interesse real.",
    actions: [
      { title: "Definir proposta de valor e CTA", offset_days: 3 },
      { title: "Publicar landing page", offset_days: 7 },
      { title: "Direcionar 200 visitantes (orgânico/ads)", offset_days: 14 },
      { title: "Medir CTR e conversão (threshold >15%)", offset_days: 17 },
    ],
  },

  // ── MVP ──────────────────────────────────────────────────
  "mvp-scope-cuts": {
    key: "mvp-scope-cuts",
    name: "MVP Scope Cuts",
    stage: "mvp",
    milestone_title: "MVP Scope — 1 user, 1 use case, 1 plataforma",
    description: "Cortar 80% das features para ter um MVP focado e enviável.",
    actions: [
      { title: "Listar todas as features candidatas", offset_days: 2 },
      { title: "Aplicar regra 1-1-1 e cortar 80%", offset_days: 4, priority: "high" },
      { title: "Validar scope com 2 design partners", offset_days: 7 },
    ],
  },
  "activation-funnel": {
    key: "activation-funnel",
    name: "Activation Funnel",
    stage: "mvp",
    milestone_title: "Activation Funnel",
    description: "Definir o 'aha moment' e medir a jornada até lá.",
    actions: [
      { title: "Definir o 'aha moment' da experiência", offset_days: 3, priority: "high" },
      { title: "Instrumentar eventos: Sign-up, Setup, Primeiro valor", offset_days: 10 },
      { title: "Medir conversão por etapa", offset_days: 17 },
      { title: "Identificar e otimizar a etapa com maior drop", offset_days: 28 },
    ],
  },
  "first-10-customers": {
    key: "first-10-customers",
    name: "First 10 Customers",
    stage: "mvp",
    milestone_title: "First 10 Customers",
    description: "Aquisição manual e não escalável dos primeiros 10 clientes.",
    actions: [
      { title: "Lista de 100 prospects (LinkedIn, eventos, rede)", offset_days: 5 },
      { title: "Outbound manual: 50 emails personalizados", offset_days: 14, priority: "high" },
      { title: "Onboarding 1-on-1 com cada cliente", offset_days: 28 },
      { title: "Entrevista pós-onboarding com cada cliente", offset_days: 35 },
    ],
  },

  // ── GROWTH ───────────────────────────────────────────────
  "unit-economics-101": {
    key: "unit-economics-101",
    name: "Unit Economics 101",
    stage: "growth",
    milestone_title: "Unit Economics — baseline",
    description: "Calcular CAC, LTV, Gross Margin e Payback Period.",
    actions: [
      { title: "Calcular CAC por canal (paid, organic, referral)", offset_days: 7, priority: "high" },
      { title: "Calcular LTV (ARPU × GM ÷ Churn)", offset_days: 10, priority: "high" },
      { title: "Calcular Gross Margin e Payback Period", offset_days: 14 },
      { title: "Inserir métricas em /workspace?tab=kpis", offset_days: 17 },
      { title: "Definir targets: LTV:CAC ≥3, Payback <12m", offset_days: 21 },
    ],
  },
  "ltv-cac-deep-dive": {
    key: "ltv-cac-deep-dive",
    name: "LTV:CAC Deep-Dive",
    stage: "growth",
    milestone_title: "LTV:CAC Deep-Dive",
    description: "Segmentar LTV:CAC por canal e persona; identificar canal vencedor.",
    actions: [
      { title: "Segmentar CAC e LTV por canal", offset_days: 7, priority: "high" },
      { title: "Segmentar por persona/ICP", offset_days: 10 },
      { title: "Identificar canal com melhor ratio", offset_days: 14, priority: "high" },
      { title: "Plano para duplicar investimento no top canal", offset_days: 21 },
    ],
  },
  "channel-market-fit": {
    key: "channel-market-fit",
    name: "Channel-Market Fit",
    stage: "growth",
    milestone_title: "Channel-Market Fit",
    description: "Testar 3-5 canais de aquisição em paralelo durante 60 dias.",
    actions: [
      { title: "Selecionar 3-5 canais a testar (paid, content, outbound, partnerships, comunidade)", offset_days: 5 },
      { title: "Definir budget e KPIs por canal", offset_days: 10 },
      { title: "Executar testes durante 30 dias", offset_days: 40, priority: "high" },
      { title: "Concentrar 80% no top 1-2 canais", offset_days: 60 },
    ],
  },
  "retention-cohorts": {
    key: "retention-cohorts",
    name: "Retention Cohorts",
    stage: "growth",
    milestone_title: "Retention Cohorts",
    description: "Tabela mensal de retenção por cohort para detetar product-market fit.",
    actions: [
      { title: "Definir 'utilizador ativo' (DAU/WAU/MAU)", offset_days: 5 },
      { title: "Construir tabela cohort mensal", offset_days: 14, priority: "high" },
      { title: "Identificar mês onde a curva estabiliza", offset_days: 21 },
      { title: "Plano de ações se a curva não estabilizar (problema de produto)", offset_days: 28 },
    ],
  },
  "pricing-experiments": {
    key: "pricing-experiments",
    name: "Pricing Experiments",
    stage: "growth",
    milestone_title: "Pricing Experiments",
    description: "A/B test de preço para encontrar willingness-to-pay real.",
    actions: [
      { title: "Definir hipótese de preço e segmento", offset_days: 5 },
      { title: "Configurar A/B test (variant +20%)", offset_days: 10 },
      { title: "Recolher dados durante 30 dias", offset_days: 40, priority: "high" },
      { title: "Decidir manter aumento se conversão cair <20%", offset_days: 45 },
    ],
  },
  "sales-playbook-v1": {
    key: "sales-playbook-v1",
    name: "Sales Playbook v1",
    stage: "growth",
    milestone_title: "Sales Playbook v1",
    description: "Manual de vendas: ICP, scripts, qualificação e win/loss.",
    actions: [
      { title: "Documentar ICP detalhado", offset_days: 7, priority: "high" },
      { title: "Escrever scripts de discovery e demo", offset_days: 14 },
      { title: "Adotar framework de qualificação (BANT ou MEDDIC)", offset_days: 21 },
      { title: "Definir pipeline stages e definitions of done", offset_days: 28 },
      { title: "Agendar primeiro win/loss review mensal", offset_days: 35 },
    ],
  },

  // ── SCALE ────────────────────────────────────────────────
  "org-chart-hiring-plan": {
    key: "org-chart-hiring-plan",
    name: "Org Chart & Hiring Plan",
    stage: "scale",
    milestone_title: "Org Chart & Hiring Plan 12-18 meses",
    description: "Mapear funções críticas e sequência de contratações.",
    actions: [
      { title: "Mapear org chart atual e desejado a 18 meses", offset_days: 7, priority: "high" },
      { title: "Priorizar próximas 5 contratações", offset_days: 14 },
      { title: "Job descriptions com plano 30/60/90", offset_days: 28 },
      { title: "Definir pipeline de recrutamento por função", offset_days: 35 },
    ],
  },
  "okrs-trimestrais": {
    key: "okrs-trimestrais",
    name: "OKRs Trimestrais",
    stage: "scale",
    milestone_title: "OKRs do Trimestre",
    description: "3-5 Objetivos + 3 KRs cada, com review semanal de confidence.",
    actions: [
      { title: "Definir 3-5 Objetivos para o trimestre", offset_days: 7, priority: "high" },
      { title: "Definir 3 Key Results mensuráveis por Objetivo", offset_days: 10 },
      { title: "Partilhar OKRs com toda a equipa", offset_days: 14 },
      { title: "Configurar review semanal de confidence (0-1)", offset_days: 17 },
    ],
  },
  "fundraising-readiness": {
    key: "fundraising-readiness",
    name: "Fundraising Readiness",
    stage: "scale",
    milestone_title: "Fundraising Readiness",
    description: "Preparação completa para captação ativa.",
    actions: [
      { title: "Pitch deck 10-12 slides (problem→ask)", offset_days: 14, priority: "high" },
      { title: "Modelo financeiro 3 anos", offset_days: 21, priority: "high" },
      { title: "Data room v1 (cap table, contratos, métricas)", offset_days: 28 },
      { title: "Lista 50 investidores (tier 1/2/3)", offset_days: 35 },
      { title: "Confirmar 6+ meses de runway antes de começar", offset_days: 40 },
    ],
  },
  "series-a-data-room": {
    key: "series-a-data-room",
    name: "Series A Data Room",
    stage: "scale",
    milestone_title: "Series A Data Room",
    description: "Estrutura padrão de data room para due diligence Série A.",
    actions: [
      { title: "01_Corporate: estatutos, cap table, atas", offset_days: 7 },
      { title: "02_Financials: P&L, balanço, modelo", offset_days: 14 },
      { title: "03_Commercial: contratos, pipeline, MRR", offset_days: 21 },
      { title: "04_Product: roadmap e arquitetura", offset_days: 28 },
      { title: "05_Team: orgchart, equity, contratos", offset_days: 32 },
      { title: "06_Legal: IP, GDPR, compliance", offset_days: 38 },
      { title: "07_Metrics: KPIs e cohorts", offset_days: 42 },
    ],
  },
  "expansion-playbook": {
    key: "expansion-playbook",
    name: "Expansion Playbook",
    stage: "scale",
    milestone_title: "Expansion (Land & Expand)",
    description: "Plano de expansão via upsell, cross-sell e geografia.",
    actions: [
      { title: "Identificar oportunidades de upsell na base", offset_days: 14, priority: "high" },
      { title: "Lançar 1 módulo de cross-sell", offset_days: 35 },
      { title: "Selecionar próximo mercado geográfico", offset_days: 45 },
      { title: "Fechar 3 design partners no novo mercado", offset_days: 75 },
    ],
  },
  "board-management": {
    key: "board-management",
    name: "Board Management",
    stage: "scale",
    milestone_title: "Board Management — cadência mensal",
    description: "Pacote mensal de board e cadência trimestral de reuniões.",
    actions: [
      { title: "Template de board pack (KPIs, cash, wins/losses, ask)", offset_days: 7 },
      { title: "Primeiro board pack mensal enviado", offset_days: 21, priority: "high" },
      { title: "Agendar reuniões trimestrais formais", offset_days: 28 },
    ],
  },
} as const satisfies Record<string, Playbook>;

export type PlaybookKey = keyof typeof PLAYBOOK_CATALOG;

// Exposed list (key + name + stage) for client menus / detection
export const PLAYBOOK_INDEX = Object.values(PLAYBOOK_CATALOG).map((p) => ({
  key: p.key,
  name: p.name,
  stage: p.stage,
}));
