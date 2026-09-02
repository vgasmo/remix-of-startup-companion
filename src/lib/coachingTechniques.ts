/**
 * P2: bilingual coaching techniques catalog (was hardcoded English inside
 * CoachingToolkitTab). Resolve with `getCoachingTechniques(i18n.language)`.
 */
type L = { pt: string; en: string };
type LList = { pt: string[]; en: string[] };

export type CoachingCategory = 'questions' | 'reframes' | 'exercises';

interface RawTechnique {
  id: string;
  category: CoachingCategory;
  name: L;
  description: L;
  when: LList;
  examples: LList;
  caution?: L;
}

export interface CoachingTechnique {
  id: string;
  category: CoachingCategory;
  name: string;
  description: string;
  when: string[];
  examples: string[];
  caution?: string;
}

const RAW: RawTechnique[] = [
  {
    id: 'scaling',
    category: 'questions',
    name: { pt: 'Perguntas de Escala', en: 'Scaling Questions' },
    description: {
      pt: 'Ajudam os founders a quantificar sensações subjetivas e a identificar melhorias incrementais',
      en: 'Help founders quantify subjective feelings and identify incremental improvements',
    },
    when: {
      pt: ['Founder sente-se bloqueado', 'Medir progresso', 'Definir objetivos'],
      en: ['Founder feels stuck', 'Measuring progress', 'Setting goals'],
    },
    examples: {
      pt: [
        'Numa escala de 1 a 10, quão confiante estás no teu product-market fit?',
        'O que faria esse número passar de 6 para 7?',
        'Onde estavas nesta escala há 3 meses?',
      ],
      en: [
        'On a scale of 1-10, how confident are you in your product-market fit?',
        'What would move that number from a 6 to a 7?',
        'Where were you on this scale 3 months ago?',
      ],
    },
  },
  {
    id: 'miracle',
    category: 'questions',
    name: { pt: 'Pergunta do Milagre', en: 'Miracle Question' },
    description: {
      pt: 'Contorna crenças limitadoras ao imaginar o resultado ideal',
      en: 'Bypass limiting beliefs by imagining ideal outcomes',
    },
    when: {
      pt: ['Planeamento estratégico', 'Definição de visão', 'Superar bloqueios'],
      en: ['Strategic planning', 'Vision setting', 'Overcoming blocks'],
    },
    examples: {
      pt: [
        'Se acordasses amanhã e este problema estivesse resolvido, o que seria diferente?',
        'O que notarias primeiro a dizer-te que as coisas mudaram?',
        'Quem mais notaria? O que veriam?',
      ],
      en: [
        'If you woke up tomorrow and this problem was solved, what would be different?',
        'What would you notice first that tells you things have changed?',
        'Who else would notice? What would they see?',
      ],
    },
    caution: {
      pt: 'Usar com moderação — pode parecer abstrata se abusada',
      en: 'Use sparingly - can feel abstract if overused',
    },
  },
  {
    id: 'presupposition',
    category: 'questions',
    name: { pt: 'Perguntas Pressuposicionais', en: 'Presuppositional Questions' },
    description: {
      pt: 'Perguntas que assumem resultados positivos para mudar a mentalidade',
      en: 'Questions that assume positive outcomes to shift mindset',
    },
    when: {
      pt: ['Construir confiança', 'Ultrapassar o medo', 'Planeamento de ações'],
      en: ['Building confidence', 'Moving past fear', 'Action planning'],
    },
    examples: {
      pt: [
        'Quando resolveres isto, o que farás a seguir?',
        'Depois de fechares esta ronda, como vais usar a primeira semana?',
        'Assim que tiveres product-market fit, o que se torna possível?',
      ],
      en: [
        'When you solve this, what will you do next?',
        'After you close this round, how will you spend the first week?',
        'Once you have product-market fit, what becomes possible?',
      ],
    },
  },
  {
    id: 'clean',
    category: 'questions',
    name: { pt: 'Perguntas de Linguagem Limpa', en: 'Clean Language Questions' },
    description: {
      pt: 'Perguntas sem pressupostos que deixam o founder explorar livremente',
      en: 'Questions without assumptions that let the founder explore freely',
    },
    when: {
      pt: ['Sessões de descoberta', 'Explorar emoções', 'Evitar projeção'],
      en: ['Discovery sessions', 'Exploring emotions', 'Avoiding projection'],
    },
    examples: {
      pt: [
        'Que tipo de [palavra dele] é essa?',
        'Há mais alguma coisa sobre [palavra dele]?',
        'Onde está localizada essa [sensação]?',
        'O que acontece imediatamente antes de [o problema]?',
      ],
      en: [
        'What kind of [their word] is that?',
        'Is there anything else about [their word]?',
        'Where is that [feeling] located?',
        'What happens just before [the problem]?',
      ],
    },
  },
  {
    id: 'exception',
    category: 'questions',
    name: { pt: 'Perguntas de Exceção', en: 'Exception-Finding Questions' },
    description: {
      pt: 'Encontrar momentos em que o problema não ocorreu para identificar soluções',
      en: "Find times when the problem didn't occur to identify solutions",
    },
    when: {
      pt: ['Problemas recorrentes', 'Construir sobre forças', 'Quebrar padrões'],
      en: ['Recurring issues', 'Building on strengths', 'Pattern breaking'],
    },
    examples: {
      pt: [
        'Houve algum momento em que isto não era um problema? O que era diferente?',
        'Quando é que este desafio parece mais fácil de gerir?',
        'Fala-me da tua melhor aquisição de cliente. O que a fez funcionar?',
      ],
      en: [
        "Was there ever a time when this wasn't a problem? What was different?",
        'When does this challenge feel easier to handle?',
        'Tell me about your best customer acquisition. What made it work?',
      ],
    },
  },
  {
    id: 'fear-reframe',
    category: 'reframes',
    name: { pt: 'Medo para Entusiasmo', en: 'Fear to Excitement' },
    description: {
      pt: 'Reenquadrar o medo como entusiasmo — respostas fisiologicamente idênticas',
      en: 'Reframe fear as excitement - physiologically identical responses',
    },
    when: {
      pt: ['Antes de pitches', 'Decisões importantes', 'Medo de falhar'],
      en: ['Before pitches', 'Major decisions', 'Fear of failure'],
    },
    examples: {
      pt: [
        'Esse aperto no estômago é o teu corpo a preparar-se para o máximo desempenho',
        'Medo e entusiasmo sentem-se igual. E se esta sensação significar que te importas?',
        'Sentes que está muito em jogo porque isto é importante para ti',
      ],
      en: [
        "The butterflies in your stomach - that's your body preparing for peak performance",
        'Fear and excitement feel the same. What if this feeling means you care deeply?',
        'The stakes feel high because this matters to you',
      ],
    },
  },
  {
    id: 'failure-reframe',
    category: 'reframes',
    name: { pt: 'Falha como Dados', en: 'Failure as Data' },
    description: {
      pt: 'Reenquadrar falhas como experiências que geraram informação valiosa',
      en: 'Reframe failures as experiments that generated valuable information',
    },
    when: {
      pt: ['Depois de contratempos', 'Medo de tentar', 'Perfecionismo'],
      en: ['After setbacks', 'Fear of trying', 'Perfectionism'],
    },
    examples: {
      pt: [
        'Isto não foi uma falha — foi uma experiência. O que aprendeste?',
        'Cada "não" é um passo mais perto de compreender o teu mercado',
        'Agora sabes o que não funciona. Isso são dados valiosos.',
      ],
      en: [
        "This wasn't a failure - it was an experiment. What did you learn?",
        'Every "no" is one step closer to understanding your market',
        "Now you know what doesn't work. That's valuable data.",
      ],
    },
  },
  {
    id: 'constraint-reframe',
    category: 'reframes',
    name: { pt: 'Restrição como Vantagem', en: 'Constraint as Advantage' },
    description: {
      pt: 'Transformar limitações em oportunidades criativas',
      en: 'Turn limitations into creative opportunities',
    },
    when: {
      pt: ['Recursos limitados', 'Desvantagem competitiva', 'Dúvida sobre si mesmo'],
      en: ['Limited resources', 'Competitive disadvantage', 'Self-doubt'],
    },
    examples: {
      pt: [
        'A tua equipa pequena significa decisões e pivots mais rápidos',
        'Ter menos dinheiro obriga-te a validar antes de construir',
        'Não ter experiência no setor significa que não vais cometer os erros habituais',
      ],
      en: [
        'Your small team means faster decisions and pivots',
        'Having less money forces you to validate before building',
        "Not having industry experience means you won't make the usual mistakes",
      ],
    },
  },
  {
    id: 'time-reframe',
    category: 'reframes',
    name: { pt: 'Mudança de Perspetiva Temporal', en: 'Time Perspective Shift' },
    description: {
      pt: 'Ajudar os founders a afastar-se para ver o quadro geral',
      en: 'Help founders zoom out to see the bigger picture',
    },
    when: {
      pt: ['Lutas diárias', 'Perda de motivação', 'Pensamento de curto prazo'],
      en: ['Daily struggles', 'Loss of motivation', 'Short-term thinking'],
    },
    examples: {
      pt: [
        'Dentro de 5 anos, esta decisão vai importar? O que vai importar?',
        'Que conselho te daria a versão de ti 10 anos mais velha?',
        'Isto é um obstáculo ou um muro? A maioria parece muro mas é obstáculo.',
      ],
      en: [
        'In 5 years, will this decision matter? What will?',
        'What advice would 10-years-older you give about this situation?',
        'Is this a speed bump or a wall? Most feel like walls but are bumps.',
      ],
    },
  },
  {
    id: 'premortem',
    category: 'exercises',
    name: { pt: 'Análise Pre-Mortem', en: 'Pre-Mortem Analysis' },
    description: {
      pt: 'Imaginar a falha para identificar e prevenir riscos',
      en: 'Imagine failure to identify and prevent risks',
    },
    when: {
      pt: ['Antes de lançamentos importantes', 'Decisões de investimento', 'Acordos de parceria'],
      en: ['Before major launches', 'Investment decisions', 'Partnership agreements'],
    },
    examples: {
      pt: [
        'Estamos 6 meses no futuro e esta iniciativa falhou. O que correu mal?',
        'Escreve 3 razões pelas quais esta parceria poderia correr mal',
        'Se um concorrente te copiasse amanhã, onde estarias mais vulnerável?',
      ],
      en: [
        "It's 6 months from now and this initiative failed. What went wrong?",
        'Write down 3 reasons why this partnership could go badly',
        'If a competitor copied you tomorrow, where would you be most vulnerable?',
      ],
    },
  },
  {
    id: 'devil-advocate',
    category: 'exercises',
    name: { pt: 'Advogado do Diabo', en: "Devil's Advocate" },
    description: {
      pt: 'Desafiar pressupostos defendendo a posição oposta',
      en: 'Challenge assumptions by arguing the opposite position',
    },
    when: {
      pt: ['Risco de viés de confirmação', 'Pivots importantes', 'Tese de investimento'],
      en: ['Confirmation bias risk', 'Major pivots', 'Investment thesis'],
    },
    examples: {
      pt: [
        'Deixa-me argumentar por que um cliente NÃO compraria isto...',
        'E se o oposto do teu pressuposto for verdade?',
        'Convence-me de que esta é uma má ideia',
      ],
      en: [
        'Let me argue why a customer would NOT buy this...',
        'What if the opposite of your assumption is true?',
        'Convince me why this is a bad idea',
      ],
    },
    caution: {
      pt: 'Faz sempre debriefing e volta ao modo colaborativo',
      en: 'Always debrief and return to collaborative mode',
    },
  },
  {
    id: 'empty-chair',
    category: 'exercises',
    name: { pt: 'Técnica da Cadeira Vazia', en: 'Empty Chair Technique' },
    description: {
      pt: 'Fazer role-play de conversas com stakeholders ausentes',
      en: 'Role-play conversations with absent stakeholders',
    },
    when: {
      pt: ['Preparar conversas difíceis', 'Compreender clientes', 'Conflito entre co-founders'],
      en: ['Preparing difficult conversations', 'Understanding customers', 'Co-founder conflict'],
    },
    examples: {
      pt: [
        'Imagina que o teu cliente-alvo está sentado aqui. O que diria do teu produto?',
        'Troca de lugar. Agora és o investidor. Por que dirias não?',
        'O que diria o teu co-founder que são as preocupações dele?',
      ],
      en: [
        'Imagine your target customer is sitting here. What would they say about your product?',
        "Switch seats. You're now the investor. Why would you say no?",
        'What would your co-founder say their concerns are?',
      ],
    },
  },
  {
    id: 'priority-matrix',
    category: 'exercises',
    name: { pt: 'Matriz de Prioridades 2x2', en: '2x2 Priority Matrix' },
    description: {
      pt: 'Priorizar tarefas rapidamente por impacto e esforço',
      en: 'Quickly prioritize tasks by impact and effort',
    },
    when: {
      pt: ['Demasiadas prioridades', 'Planeamento de sprint', 'Alocação de recursos'],
      en: ['Too many priorities', 'Sprint planning', 'Resource allocation'],
    },
    examples: {
      pt: [
        'Vamos mapear as tuas 10 tarefas em Impacto (alto/baixo) vs Esforço (alto/baixo)',
        'O que está no quadrante "alto impacto, baixo esforço"?',
        'Estás a gastar tempo em trabalho de "baixo impacto, alto esforço"?',
      ],
      en: [
        "Let's map your 10 tasks on Impact (high/low) vs Effort (high/low)",
        'What\'s in your "high impact, low effort" quadrant?',
        'Are you spending time on "low impact, high effort" work?',
      ],
    },
  },
  {
    id: 'ideal-week',
    category: 'exercises',
    name: { pt: 'Desenho da Semana Ideal', en: 'Ideal Week Design' },
    description: {
      pt: 'Desenhar um calendário que suporte os objetivos do founder',
      en: 'Design a calendar that supports founder goals',
    },
    when: {
      pt: ['Problemas de gestão de tempo', 'Prevenção de burnout', 'Problemas de foco'],
      en: ['Time management issues', 'Burnout prevention', 'Focus problems'],
    },
    examples: {
      pt: [
        'Bloqueia a tua semana ideal — quando fazes trabalho profundo?',
        'Compara a tua semana ideal com a semana passada. O que é diferente?',
        'Que reunião podias eliminar para ganhar 2 horas de foco?',
      ],
      en: [
        'Block out your ideal week - when do you do deep work?',
        "Compare your ideal week to last week. What's different?",
        'What one meeting could you eliminate to gain 2 hours of focus time?',
      ],
    },
  },
];

export function getCoachingTechniques(lang?: string): CoachingTechnique[] {
  const l = (lang ?? 'pt').toLowerCase().startsWith('en') ? 'en' : 'pt';
  return RAW.map((r) => ({
    id: r.id,
    category: r.category,
    name: r.name[l],
    description: r.description[l],
    when: r.when[l],
    examples: r.examples[l],
    caution: r.caution?.[l],
  }));
}
