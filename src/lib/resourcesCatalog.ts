export type ResourceType = 'external' | 'internal';

export type ResourceRole = 'founder' | 'mentor' | 'staff';

export type ResourceStage = 'ideation' | 'pre_seed' | 'seed' | 'scale';

export type ResourceCategory =
  | 'product'
  | 'market'
  | 'gtm'
  | 'finance'
  | 'fundraising'
  | 'legal'
  | 'ops'
  | 'team'
  | 'privacy'
  | 'metrics';

export type ResourceItem = {
  id: string;
  type: ResourceType;
  title_pt: string;
  title_en: string;
  desc_pt: string;
  desc_en: string;
  url: string;
  category: ResourceCategory;
  tags: string[];
  stages: ResourceStage[];
  roles: ResourceRole[];
};

export const RESOURCES_CATALOG: ResourceItem[] = [
  // --- INTERNAL (3) ---
  {
    id: 'internal-help',
    type: 'internal',
    title_pt: 'Glossário & FAQ',
    title_en: 'Glossary & FAQ',
    desc_pt: 'Conceitos essenciais, respostas rápidas e troubleshooting.',
    desc_en: 'Essential concepts, quick answers, and troubleshooting.',
    url: '/help',
    category: 'ops',
    tags: ['help', 'faq', 'glossary'],
    stages: ['ideation', 'pre_seed', 'seed', 'scale'],
    roles: ['founder', 'mentor', 'staff'],
  },
  {
    id: 'internal-mentors',
    type: 'internal',
    title_pt: 'Mentoria',
    title_en: 'Mentoring',
    desc_pt: 'Pedir mentoria, acompanhar pedidos e gerir sessões atribuídas.',
    desc_en: 'Request mentoring, track requests, and manage assigned sessions.',
    url: '/mentors',
    category: 'ops',
    tags: ['mentoring', 'sessions'],
    stages: ['ideation', 'pre_seed', 'seed', 'scale'],
    roles: ['founder', 'mentor', 'staff'],
  },
  {
    id: 'internal-documents',
    type: 'internal',
    title_pt: 'Repositório de Documentos',
    title_en: 'Documents Repository',
    desc_pt: 'Uploads, versões e estado (submetido/aprovado) num só sítio.',
    desc_en: 'Uploads, versions, and status (submitted/approved) in one place.',
    url: '/documents',
    category: 'ops',
    tags: ['documents', 'versions'],
    stages: ['ideation', 'pre_seed', 'seed', 'scale'],
    roles: ['founder', 'staff'],
  },
  // --- EXTERNAL (20) ---
  {
    id: 'yc-seed-deck',
    type: 'external',
    title_pt: 'YC — Como construir um pitch deck de Seed',
    title_en: 'YC — How to Build Your Seed Round Pitch Deck',
    desc_pt: 'Estrutura recomendada para contar a história e mostrar clareza de execução na fase seed.',
    desc_en: 'Recommended structure to tell the story and show execution clarity at seed stage.',
    url: 'https://www.ycombinator.com/library/2u-how-to-build-your-seed-round-pitch-deck',
    category: 'fundraising',
    tags: ['pitch', 'deck', 'seed'],
    stages: ['pre_seed', 'seed'],
    roles: ['founder', 'staff', 'mentor'],
  },
  {
    id: 'sequoia-pitch-guide',
    type: 'external',
    title_pt: 'Sequoia — Guia de pitching ("Writing a Business Plan")',
    title_en: 'Sequoia — Pitching Guide ("Writing a Business Plan")',
    desc_pt: 'Framework clássico para estruturar propósito, problema, solução, mercado, concorrência e finanças.',
    desc_en: 'Classic framework for purpose, problem, solution, market, competition, and financials.',
    url: 'https://sequoiacap.com/article/writing-a-business-plan/',
    category: 'fundraising',
    tags: ['pitch', 'narrative', 'market-size'],
    stages: ['pre_seed', 'seed'],
    roles: ['founder', 'mentor', 'staff'],
  },
  {
    id: 'strategyzer-bmc',
    type: 'external',
    title_pt: 'Business Model Canvas (Strategyzer)',
    title_en: 'Business Model Canvas (Strategyzer)',
    desc_pt: 'Ferramenta visual para mapear modelo de negócio: segmentos, proposta de valor, canais e receita.',
    desc_en: 'Visual tool to map business model: segments, value proposition, channels, and revenue.',
    url: 'https://www.strategyzer.com/library/the-business-model-canvas',
    category: 'product',
    tags: ['canvas', 'business-model', 'strategy'],
    stages: ['ideation', 'pre_seed'],
    roles: ['founder', 'mentor', 'staff'],
  },
  {
    id: 'yc-library',
    type: 'external',
    title_pt: 'YC Startup Library (coleção completa)',
    title_en: 'YC Startup Library (full collection)',
    desc_pt: 'Biblioteca aberta de artigos, vídeos e guias para todas as fases de uma startup.',
    desc_en: 'Open library of articles, videos, and guides for all startup stages.',
    url: 'https://www.ycombinator.com/library',
    category: 'ops',
    tags: ['library', 'collection', 'startup'],
    stages: ['ideation', 'pre_seed', 'seed', 'scale'],
    roles: ['founder', 'mentor', 'staff'],
  },
  {
    id: 'yc-how-to-pitch',
    type: 'external',
    title_pt: 'YC — Como apresentar a tua empresa',
    title_en: 'YC — How to Pitch Your Company',
    desc_pt: 'Técnicas para comunicar ideia, tração e visão em 2–3 minutos de forma convincente.',
    desc_en: 'Techniques to communicate idea, traction, and vision in 2–3 minutes convincingly.',
    url: 'https://www.ycombinator.com/library/4b-how-to-pitch-your-company',
    category: 'fundraising',
    tags: ['pitch', 'presentation', 'storytelling'],
    stages: ['pre_seed', 'seed'],
    roles: ['founder', 'mentor', 'staff'],
  },
  {
    id: 'yc-talk-to-users',
    type: 'external',
    title_pt: 'YC — Como falar com utilizadores',
    title_en: 'YC — How to Talk to Users',
    desc_pt: 'Guia prático para entrevistas: o que perguntar, como interpretar e como evitar "viés de confirmação".',
    desc_en: 'Practical interview guide: what to ask, how to interpret, and how to avoid confirmation bias.',
    url: 'https://www.ycombinator.com/library/Iq-how-to-talk-to-users',
    category: 'market',
    tags: ['discovery', 'interviews', 'validation'],
    stages: ['ideation', 'pre_seed'],
    roles: ['founder', 'staff', 'mentor'],
  },
  {
    id: 'guide-tam-sam-som',
    type: 'internal',
    title_pt: 'Dimensionamento de mercado (TAM/SAM/SOM)',
    title_en: 'Market Sizing (TAM/SAM/SOM)',
    desc_pt: 'Guia e template para estimar o tamanho do mercado de forma credível e apresentável.',
    desc_en: 'Guide and template to estimate market size credibly and presentably.',
    url: '/resources/guide/guide-tam-sam-som',
    category: 'market',
    tags: ['market-size', 'tam', 'strategy'],
    stages: ['ideation', 'pre_seed', 'seed'],
    roles: ['founder', 'mentor', 'staff'],
  },
  {
    id: 'guide-gtm-checklist',
    type: 'internal',
    title_pt: 'Checklist de go-to-market',
    title_en: 'Go-to-Market Checklist',
    desc_pt: 'Passos essenciais para lançar produto: posicionamento, canais, pricing e primeiras métricas.',
    desc_en: 'Essential steps to launch: positioning, channels, pricing, and first metrics.',
    url: '/resources/guide/guide-gtm-checklist',
    category: 'gtm',
    tags: ['gtm', 'launch', 'checklist'],
    stages: ['pre_seed', 'seed'],
    roles: ['founder', 'staff'],
  },
  {
    id: 'guide-pricing-frameworks',
    type: 'internal',
    title_pt: 'Frameworks de pricing (baseado em valor)',
    title_en: 'Pricing Frameworks (value-based)',
    desc_pt: 'Como definir preços: abordagem por valor percebido, benchmarks e testes iterativos.',
    desc_en: 'How to set prices: perceived value approach, benchmarks, and iterative testing.',
    url: '/resources/guide/guide-pricing-frameworks',
    category: 'gtm',
    tags: ['pricing', 'packaging', 'value'],
    stages: ['pre_seed', 'seed', 'scale'],
    roles: ['founder', 'staff', 'mentor'],
  },
  {
    id: 'guide-cac-ltv',
    type: 'internal',
    title_pt: 'CAC/LTV — Guia rápido',
    title_en: 'CAC/LTV Cheat Sheet',
    desc_pt: 'Fórmulas, benchmarks e boas práticas para medir custo de aquisição e valor ao longo do tempo.',
    desc_en: 'Formulas, benchmarks, and best practices to measure acquisition cost and lifetime value.',
    url: '/resources/guide/guide-cac-ltv',
    category: 'metrics',
    tags: ['cac', 'ltv', 'unit-economics'],
    stages: ['pre_seed', 'seed', 'scale'],
    roles: ['founder', 'staff', 'mentor'],
  },
  {
    id: 'guide-investor-update',
    type: 'internal',
    title_pt: 'Template de update para investidores',
    title_en: 'Investor Update Template',
    desc_pt: 'Estrutura mensal para comunicar métricas, progressos, pedidos e próximos passos a investidores.',
    desc_en: 'Monthly structure to communicate metrics, progress, asks, and next steps to investors.',
    url: '/resources/guide/guide-investor-update',
    category: 'fundraising',
    tags: ['investors', 'update', 'communication'],
    stages: ['seed', 'scale'],
    roles: ['founder', 'staff'],
  },
  {
    id: 'guide-cap-table',
    type: 'internal',
    title_pt: 'Cap table — O essencial',
    title_en: 'Cap Table Basics',
    desc_pt: 'Como estruturar a tabela de capitalização, vesting, diluição e impacto em rondas futuras.',
    desc_en: 'How to structure the cap table, vesting, dilution, and impact on future rounds.',
    url: '/resources/guide/guide-cap-table',
    category: 'finance',
    tags: ['cap-table', 'equity', 'vesting'],
    stages: ['pre_seed', 'seed', 'scale'],
    roles: ['founder', 'staff', 'mentor'],
  },
  {
    id: 'guide-term-sheet',
    type: 'internal',
    title_pt: 'Term sheet — O essencial',
    title_en: 'Term Sheet Basics',
    desc_pt: 'Cláusulas típicas de um term sheet, trade-offs e o que negociar com confiança.',
    desc_en: 'Typical term sheet clauses, trade-offs, and what to negotiate with confidence.',
    url: '/resources/guide/guide-term-sheet',
    category: 'legal',
    tags: ['term-sheet', 'negotiation', 'legal'],
    stages: ['seed', 'scale'],
    roles: ['founder', 'mentor', 'staff'],
  },
  {
    id: 'guide-dataroom-checklist',
    type: 'internal',
    title_pt: 'Checklist de Dataroom',
    title_en: 'Dataroom Checklist',
    desc_pt: 'Lista de documentos essenciais para um dataroom de investimento: deck, financeiro, legal, métricas.',
    desc_en: 'Essential document list for an investment dataroom: deck, financials, legal, metrics.',
    url: '/resources/guide/guide-dataroom-checklist',
    category: 'fundraising',
    tags: ['dataroom', 'due-diligence', 'checklist'],
    stages: ['seed', 'scale'],
    roles: ['founder', 'staff'],
  },
  {
    id: 'guide-okrs-vs-kpis',
    type: 'internal',
    title_pt: 'OKRs vs KPIs — Quando usar cada um',
    title_en: 'OKRs vs KPIs — When to Use Each',
    desc_pt: 'Diferenças práticas, exemplos concretos e como combinar ambos no dia-a-dia da startup.',
    desc_en: 'Practical differences, concrete examples, and how to combine both in daily startup life.',
    url: '/resources/guide/guide-okrs-vs-kpis',
    category: 'metrics',
    tags: ['okrs', 'kpis', 'execution'],
    stages: ['ideation', 'pre_seed', 'seed', 'scale'],
    roles: ['founder', 'staff', 'mentor'],
  },
  {
    id: 'guide-experiment-design',
    type: 'internal',
    title_pt: 'Template de design de experiências',
    title_en: 'Experiment Design Template',
    desc_pt: 'Estrutura para validar hipóteses: definir teste, métricas de sucesso e critérios de decisão.',
    desc_en: 'Structure to validate hypotheses: define test, success metrics, and decision criteria.',
    url: '/resources/guide/guide-experiment-design',
    category: 'product',
    tags: ['experiments', 'validation', 'lean'],
    stages: ['ideation', 'pre_seed', 'seed'],
    roles: ['founder', 'mentor', 'staff'],
  },
  {
    id: 'guide-sales-pipeline',
    type: 'internal',
    title_pt: 'Etapas de um pipeline de vendas',
    title_en: 'Sales Pipeline Stages',
    desc_pt: 'Guia para definir fases de venda, métricas de conversão e gestão do funil comercial.',
    desc_en: 'Guide to define sales phases, conversion metrics, and commercial funnel management.',
    url: '/resources/guide/guide-sales-pipeline',
    category: 'gtm',
    tags: ['sales', 'pipeline', 'conversion'],
    stages: ['pre_seed', 'seed', 'scale'],
    roles: ['founder', 'staff'],
  },
  {
    id: 'guide-product-roadmap',
    type: 'internal',
    title_pt: 'Template de roadmap de produto',
    title_en: 'Product Roadmap Template',
    desc_pt: 'Como priorizar funcionalidades, comunicar a visão e gerir expectativas internas e externas.',
    desc_en: 'How to prioritize features, communicate vision, and manage internal and external expectations.',
    url: '/resources/guide/guide-product-roadmap',
    category: 'product',
    tags: ['roadmap', 'prioritization', 'planning'],
    stages: ['pre_seed', 'seed', 'scale'],
    roles: ['founder', 'staff', 'mentor'],
  },
  {
    id: 'guide-fundraising-readiness',
    type: 'internal',
    title_pt: 'Preparação para investimento — Checklist',
    title_en: 'Fundraising Readiness Checklist',
    desc_pt: 'O que ter pronto antes de iniciar uma ronda: métricas, deck, dataroom, narrativa e referências.',
    desc_en: 'What to have ready before starting a round: metrics, deck, dataroom, narrative, and references.',
    url: '/resources/guide/guide-fundraising-readiness',
    category: 'fundraising',
    tags: ['fundraising', 'readiness', 'checklist'],
    stages: ['pre_seed', 'seed', 'scale'],
    roles: ['founder', 'staff', 'mentor'],
  },
  {
    id: 'guide-privacy-startups',
    type: 'internal',
    title_pt: 'Privacidade e conformidade para startups (básico)',
    title_en: 'Privacy & Compliance for Startups (basics)',
    desc_pt: 'Primeiros passos em RGPD, política de privacidade, consentimento e segurança de dados para early-stage.',
    desc_en: 'First steps in GDPR, privacy policy, consent, and data security for early-stage startups.',
    url: '/resources/guide/guide-privacy-startups',
    category: 'privacy',
    tags: ['gdpr', 'privacy', 'compliance'],
    stages: ['ideation', 'pre_seed', 'seed', 'scale'],
    roles: ['founder', 'staff'],
  },
  // --- TEAM / EQUIPA ---
  {
    id: 'ext-team-hiring-guide',
    type: 'external',
    title_pt: 'Como contratar os primeiros colaboradores',
    title_en: 'How to hire your first employees',
    desc_pt: 'Guia prático para recrutamento em early-stage: perfis, cultura, compensação e erros comuns.',
    desc_en: 'Practical guide to early-stage hiring: profiles, culture, compensation, and common mistakes.',
    url: 'https://www.ycombinator.com/library/8h-how-to-hire',
    category: 'team',
    tags: ['hiring', 'team', 'culture', 'hr'],
    stages: ['pre_seed', 'seed', 'scale'],
    roles: ['founder', 'staff'],
  },
  {
    id: 'ext-team-cofounder',
    type: 'external',
    title_pt: 'Escolher e gerir co-fundadores',
    title_en: 'Choosing and managing co-founders',
    desc_pt: 'Como alinhar expectativas, dividir responsabilidades e resolver conflitos entre fundadores.',
    desc_en: 'How to align expectations, split responsibilities, and resolve founder conflicts.',
    url: 'https://www.ycombinator.com/library/5z-co-founder-matching',
    category: 'team',
    tags: ['cofounder', 'team', 'leadership'],
    stages: ['ideation', 'pre_seed', 'seed'],
    roles: ['founder'],
  },
  {
    id: 'ext-team-culture',
    type: 'external',
    title_pt: 'Construir cultura de equipa desde o dia 1',
    title_en: 'Building team culture from day one',
    desc_pt: 'Práticas para criar valores, rituais e comunicação eficaz em equipas pequenas.',
    desc_en: 'Practices for creating values, rituals, and effective communication in small teams.',
    url: 'https://review.firstround.com/how-to-build-culture',
    category: 'team',
    tags: ['culture', 'team', 'values', 'communication'],
    stages: ['ideation', 'pre_seed', 'seed', 'scale'],
    roles: ['founder', 'staff'],
  },
];

// ── Category labels (i18n) ──
export const CATEGORY_LABELS: Record<string, { pt: string; en: string }> = {
  product: { pt: 'Produto', en: 'Product' },
  market: { pt: 'Mercado', en: 'Market' },
  gtm: { pt: 'Vendas & GTM', en: 'Sales & GTM' },
  finance: { pt: 'Finanças', en: 'Finance' },
  fundraising: { pt: 'Investimento', en: 'Fundraising' },
  legal: { pt: 'Legal', en: 'Legal' },
  ops: { pt: 'Operações', en: 'Operations' },
  team: { pt: 'Equipa', en: 'Team' },
  privacy: { pt: 'Privacidade', en: 'Privacy' },
  metrics: { pt: 'Métricas', en: 'Metrics' },
};

/**
 * Resource stage keys. Labels live in i18n (`resources.stageLabels.<key>`) so
 * there is a single translation mechanism — no parallel bilingual maps.
 */
export const RESOURCE_STAGE_KEYS = ['ideation', 'pre_seed', 'seed', 'scale'] as const;
export type ResourceStageKey = (typeof RESOURCE_STAGE_KEYS)[number];

export const ROLE_LABELS: Record<string, { pt: string; en: string }> = {
  founder: { pt: 'Founder', en: 'Founder' },
  mentor: { pt: 'Mentor', en: 'Mentor' },
  staff: { pt: 'Staff', en: 'Staff' },
};

// ── localStorage helpers ──
const FAVS_KEY = 'sl_resources_favs';
const RECENTS_KEY = 'sl_resources_recents';
const MAX_RECENTS = 10;

export function getFavorites(): string[] {
  try {
    return JSON.parse(localStorage.getItem(FAVS_KEY) || '[]');
  } catch { return []; }
}

export function toggleFavorite(id: string): string[] {
  const favs = getFavorites();
  const idx = favs.indexOf(id);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.push(id);
  localStorage.setItem(FAVS_KEY, JSON.stringify(favs));
  return favs;
}

export function getRecents(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
  } catch { return []; }
}

export function addRecent(id: string): void {
  const recents = getRecents().filter(r => r !== id);
  recents.unshift(id);
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents.slice(0, MAX_RECENTS)));
}
