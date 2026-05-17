import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MessageSquare,
  Target,
  Lightbulb,
  ArrowRight,
  Copy,
  Clock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Brain,
  Compass,
  Scale,
  Rocket,
  Users,
  TrendingUp,
  AlertTriangle,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Bi = { en: string; pt: string };
type BiList = { en: string[]; pt: string[] };

interface FrameworkStage {
  name: Bi;
  duration: string;
  questions: BiList;
  objectives: BiList;
}

interface SessionFramework {
  id: string;
  title: Bi;
  purpose: Bi;
  duration: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  stages: FrameworkStage[];
  bestFor: BiList;
  outcomes: BiList;
  tips: BiList;
}

const pick = <T extends string | string[]>(lang: string, v: { en: T; pt: T }): T =>
  (lang?.toLowerCase().startsWith('pt') ? v.pt : v.en);

const FRAMEWORKS: SessionFramework[] = [
  {
    id: 'discovery',
    title: { en: 'Discovery Session', pt: 'Sessão de Descoberta' },
    purpose: {
      en: 'Understand the startup context, challenges, and immediate needs',
      pt: 'Compreender o contexto da startup, desafios e necessidades imediatas',
    },
    duration: '45-60 min',
    icon: Compass,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    bestFor: {
      en: ['First meeting with founder', 'New workspace onboarding', 'Quarterly review'],
      pt: ['Primeira reunião com o founder', 'Onboarding de novo workspace', 'Revisão trimestral'],
    },
    outcomes: {
      en: ['Clear problem definition', 'Prioritized focus areas', 'Next session agenda'],
      pt: ['Definição clara do problema', 'Áreas de foco priorizadas', 'Agenda da próxima sessão'],
    },
    tips: {
      en: [
        'Let the founder speak 70% of the time',
        'Take notes on emotions, not just facts',
        'Identify the "job behind the job"',
      ],
      pt: [
        'Deixe o founder falar 70% do tempo',
        'Anote emoções, não apenas factos',
        'Identifique o "trabalho por trás do trabalho"',
      ],
    },
    stages: [
      {
        name: { en: 'Context Setting', pt: 'Enquadramento de Contexto' },
        duration: '10 min',
        questions: {
          en: [
            'Walk me through your week — what consumed most of your energy?',
            'What does success look like for you in the next 90 days?',
            'What keeps you up at night about this business?',
          ],
          pt: [
            'Conte-me a sua semana — o que consumiu mais energia?',
            'O que é sucesso para si nos próximos 90 dias?',
            'O que o tira do sono neste negócio?',
          ],
        },
        objectives: {
          en: ['Build rapport', 'Understand current state', 'Surface top-of-mind concerns'],
          pt: ['Criar rapport', 'Compreender o estado atual', 'Fazer emergir preocupações principais'],
        },
      },
      {
        name: { en: 'Deep Dive', pt: 'Análise Aprofundada' },
        duration: '25 min',
        questions: {
          en: [
            'Tell me about your most challenging customer interaction recently',
            'What assumptions are you most uncertain about?',
            'If you had unlimited resources, what would you build first?',
          ],
          pt: [
            'Fale-me da interação com cliente mais desafiante recentemente',
            'Sobre que pressupostos tem mais incerteza?',
            'Se tivesse recursos ilimitados, o que construiria primeiro?',
          ],
        },
        objectives: {
          en: ['Uncover root causes', 'Identify patterns', 'Challenge assumptions'],
          pt: ['Descobrir causas raiz', 'Identificar padrões', 'Questionar pressupostos'],
        },
      },
      {
        name: { en: 'Action Planning', pt: 'Plano de Ação' },
        duration: '15 min',
        questions: {
          en: [
            'Of everything we discussed, what feels most urgent?',
            'What one thing could we focus on that would unlock others?',
            'What support do you need from me?',
          ],
          pt: [
            'De tudo o que falámos, o que parece mais urgente?',
            'Em que único ponto focar para desbloquear os outros?',
            'Que apoio precisa de mim?',
          ],
        },
        objectives: {
          en: ['Prioritize actions', 'Assign ownership', 'Schedule follow-up'],
          pt: ['Priorizar ações', 'Atribuir responsáveis', 'Agendar follow-up'],
        },
      },
    ],
  },
  {
    id: 'problem-solving',
    title: { en: 'Problem-Solving Workshop', pt: 'Workshop de Resolução de Problemas' },
    purpose: {
      en: 'Work through a specific challenge using structured thinking',
      pt: 'Trabalhar um desafio específico com pensamento estruturado',
    },
    duration: '60-90 min',
    icon: Brain,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    bestFor: {
      en: ['Strategic decisions', 'Technical architecture', 'Pricing strategy'],
      pt: ['Decisões estratégicas', 'Arquitetura técnica', 'Estratégia de pricing'],
    },
    outcomes: {
      en: ['Decision framework', 'Risk assessment', 'Implementation roadmap'],
      pt: ['Framework de decisão', 'Avaliação de risco', 'Roadmap de implementação'],
    },
    tips: {
      en: [
        'Use whiteboarding or visual tools',
        'Encourage "stupid" questions',
        'Document alternatives considered',
      ],
      pt: [
        'Use quadro branco ou ferramentas visuais',
        'Incentive perguntas "óbvias"',
        'Documente as alternativas consideradas',
      ],
    },
    stages: [
      {
        name: { en: 'Problem Definition', pt: 'Definição do Problema' },
        duration: '15 min',
        questions: {
          en: [
            'State the problem in one sentence',
            'Who is affected and how severely?',
            'What have you already tried?',
          ],
          pt: [
            'Defina o problema numa frase',
            'Quem é afetado e com que gravidade?',
            'O que já tentou?',
          ],
        },
        objectives: {
          en: ['Align on problem scope', 'Identify stakeholders', 'Review past attempts'],
          pt: ['Alinhar âmbito do problema', 'Identificar stakeholders', 'Rever tentativas anteriores'],
        },
      },
      {
        name: { en: 'Root Cause Analysis', pt: 'Análise de Causa Raiz' },
        duration: '20 min',
        questions: {
          en: [
            'Why does this problem exist? (5 Whys)',
            'What constraints are we working with?',
            'What data do we have vs need?',
          ],
          pt: [
            'Porque existe este problema? (5 Porquês)',
            'Que restrições temos?',
            'Que dados temos vs precisamos?',
          ],
        },
        objectives: {
          en: ['Find root causes', 'Map constraints', 'Identify knowledge gaps'],
          pt: ['Encontrar causas raiz', 'Mapear restrições', 'Identificar lacunas de conhecimento'],
        },
      },
      {
        name: { en: 'Solution Ideation', pt: 'Ideação de Soluções' },
        duration: '20 min',
        questions: {
          en: [
            'What are 3 completely different ways to solve this?',
            'What would [industry leader] do?',
            'What is the minimum viable solution?',
          ],
          pt: [
            'Quais 3 formas completamente diferentes de resolver isto?',
            'O que faria [um líder da indústria]?',
            'Qual é a solução mínima viável?',
          ],
        },
        objectives: {
          en: ['Generate options', 'Think outside the box', 'Find MVP path'],
          pt: ['Gerar opções', 'Pensar fora da caixa', 'Encontrar caminho MVP'],
        },
      },
      {
        name: { en: 'Decision & Planning', pt: 'Decisão e Planeamento' },
        duration: '15 min',
        questions: {
          en: [
            'Which solution best balances impact vs effort?',
            'What are the key risks and mitigations?',
            'What is the first concrete step?',
          ],
          pt: [
            'Que solução equilibra melhor impacto vs esforço?',
            'Quais os riscos chave e as mitigações?',
            'Qual o primeiro passo concreto?',
          ],
        },
        objectives: {
          en: ['Select approach', 'Risk planning', 'Define next actions'],
          pt: ['Selecionar abordagem', 'Planeamento de risco', 'Definir próximas ações'],
        },
      },
    ],
  },
  {
    id: 'accountability',
    title: { en: 'Accountability Check-in', pt: 'Check-in de Responsabilização' },
    purpose: {
      en: 'Review progress, celebrate wins, and course-correct',
      pt: 'Rever progresso, celebrar conquistas e corrigir o rumo',
    },
    duration: '30 min',
    icon: Scale,
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    bestFor: {
      en: ['Weekly standup', 'Sprint review', 'Milestone tracking'],
      pt: ['Standup semanal', 'Revisão de sprint', 'Acompanhamento de milestones'],
    },
    outcomes: {
      en: ['Progress visibility', 'Blocker resolution', 'Updated commitments'],
      pt: ['Visibilidade do progresso', 'Resolução de bloqueios', 'Compromissos atualizados'],
    },
    tips: {
      en: [
        'Start with wins, no matter how small',
        'Focus on learning, not blame',
        'Keep energy forward-looking',
      ],
      pt: [
        'Comece pelas conquistas, por mais pequenas que sejam',
        'Foque-se em aprender, não em culpar',
        'Mantenha a energia virada para o futuro',
      ],
    },
    stages: [
      {
        name: { en: 'Wins & Progress', pt: 'Conquistas e Progresso' },
        duration: '8 min',
        questions: {
          en: [
            'What did you accomplish since last time?',
            'What are you most proud of?',
            'Any unexpected wins or learnings?',
          ],
          pt: [
            'O que conseguiu desde a última vez?',
            'Do que se orgulha mais?',
            'Alguma conquista ou aprendizagem inesperada?',
          ],
        },
        objectives: {
          en: ['Celebrate progress', 'Build momentum', 'Surface learnings'],
          pt: ['Celebrar progresso', 'Criar momentum', 'Fazer emergir aprendizagens'],
        },
      },
      {
        name: { en: 'Challenges & Blockers', pt: 'Desafios e Bloqueios' },
        duration: '12 min',
        questions: {
          en: [
            "What didn't go as planned?",
            'What is blocking your progress right now?',
            'Where do you need help?',
          ],
          pt: [
            'O que não correu como planeado?',
            'O que está a bloquear o seu progresso agora?',
            'Onde precisa de ajuda?',
          ],
        },
        objectives: {
          en: ['Identify obstacles', 'Problem-solve together', 'Offer resources'],
          pt: ['Identificar obstáculos', 'Resolver em conjunto', 'Oferecer recursos'],
        },
      },
      {
        name: { en: 'Next Commitments', pt: 'Próximos Compromissos' },
        duration: '10 min',
        questions: {
          en: [
            'What 3 things will you accomplish by next session?',
            'How will you measure success?',
            'What could derail you, and how will you prevent it?',
          ],
          pt: [
            'Que 3 coisas vai concluir até à próxima sessão?',
            'Como vai medir o sucesso?',
            'O que o pode descarrilar e como o vai prevenir?',
          ],
        },
        objectives: {
          en: ['Set clear goals', 'Define success criteria', 'Anticipate risks'],
          pt: ['Definir objetivos claros', 'Definir critérios de sucesso', 'Antecipar riscos'],
        },
      },
    ],
  },
  {
    id: 'pitch-prep',
    title: { en: 'Pitch Preparation', pt: 'Preparação de Pitch' },
    purpose: {
      en: 'Refine storytelling and prepare for investor/customer presentations',
      pt: 'Refinar storytelling e preparar apresentações a investidores/clientes',
    },
    duration: '60-90 min',
    icon: Rocket,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    bestFor: {
      en: ['Fundraising prep', 'Demo day', 'Key sales meetings'],
      pt: ['Preparação de fundraising', 'Demo day', 'Reuniões comerciais chave'],
    },
    outcomes: {
      en: ['Polished narrative', 'Q&A readiness', 'Confidence boost'],
      pt: ['Narrativa polida', 'Preparação para Q&A', 'Reforço de confiança'],
    },
    tips: {
      en: [
        'Record and review practice sessions',
        'Focus on the "so what?" for each point',
        'Prepare for tough questions specifically',
      ],
      pt: [
        'Grave e reveja as sessões de prática',
        'Foque-se no "e depois?" de cada ponto',
        'Prepare-se especificamente para perguntas difíceis',
      ],
    },
    stages: [
      {
        name: { en: 'Story Foundation', pt: 'Fundação da Narrativa' },
        duration: '20 min',
        questions: {
          en: [
            'In 30 seconds, why does your company exist?',
            'What is the one number that proves traction?',
            'Why you, why now?',
          ],
          pt: [
            'Em 30 segundos, porque existe a sua empresa?',
            'Qual é o número único que prova tração?',
            'Porquê você, porquê agora?',
          ],
        },
        objectives: {
          en: ['Nail the hook', 'Identify key proof points', 'Clarify timing'],
          pt: ['Acertar no gancho', 'Identificar provas chave', 'Clarificar o timing'],
        },
      },
      {
        name: { en: 'Pitch Walkthrough', pt: 'Passagem pelo Pitch' },
        duration: '30 min',
        questions: {
          en: [
            'Walk me through your full pitch',
            'Where do you feel least confident?',
            'What objections do you expect?',
          ],
          pt: [
            'Faça o pitch completo comigo',
            'Onde se sente menos confiante?',
            'Que objeções espera?',
          ],
        },
        objectives: {
          en: ['Full dry run', 'Identify weak spots', 'Prepare objection handles'],
          pt: ['Ensaio completo', 'Identificar pontos fracos', 'Preparar respostas a objeções'],
        },
      },
      {
        name: { en: 'Q&A Gauntlet', pt: 'Bateria de Q&A' },
        duration: '20 min',
        questions: {
          en: [
            'What if a competitor has 10x your resources?',
            'Walk me through your unit economics',
            "Why haven't you grown faster?",
          ],
          pt: [
            'E se um concorrente tiver 10x dos seus recursos?',
            'Explique as suas unit economics',
            'Porque não cresceu mais depressa?',
          ],
        },
        objectives: {
          en: ['Stress test', 'Build confidence', 'Refine responses'],
          pt: ['Stress test', 'Construir confiança', 'Refinar respostas'],
        },
      },
    ],
  },
  {
    id: 'team-dynamics',
    title: { en: 'Team & Culture Check', pt: 'Avaliação de Equipa e Cultura' },
    purpose: {
      en: 'Address team challenges, hiring, and organizational health',
      pt: 'Abordar desafios de equipa, recrutamento e saúde organizacional',
    },
    duration: '45-60 min',
    icon: Users,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    bestFor: {
      en: ['Co-founder conflict', 'Scaling team', 'Culture issues'],
      pt: ['Conflito entre co-founders', 'Escalar a equipa', 'Questões de cultura'],
    },
    outcomes: {
      en: ['Team health assessment', 'Hiring/firing decisions', 'Communication improvements'],
      pt: ['Avaliação da saúde da equipa', 'Decisões de contratação/saída', 'Melhorias de comunicação'],
    },
    tips: {
      en: [
        'Create safe space for honest conversation',
        'Focus on behaviors, not personalities',
        'Document agreed actions and owners',
      ],
      pt: [
        'Crie espaço seguro para conversa honesta',
        'Foque-se em comportamentos, não em personalidades',
        'Documente ações acordadas e responsáveis',
      ],
    },
    stages: [
      {
        name: { en: 'Team Health Pulse', pt: 'Pulso da Saúde da Equipa' },
        duration: '15 min',
        questions: {
          en: [
            'On a scale of 1-10, how is the team energy right now?',
            'Who on the team is thriving? Who is struggling?',
            'What conversations are you avoiding?',
          ],
          pt: [
            'Numa escala de 1-10, como está a energia da equipa?',
            'Quem está em crescimento? Quem está em dificuldades?',
            'Que conversas está a evitar?',
          ],
        },
        objectives: {
          en: ['Assess morale', 'Identify individuals needing support', 'Surface tensions'],
          pt: ['Avaliar moral', 'Identificar quem precisa de apoio', 'Fazer emergir tensões'],
        },
      },
      {
        name: { en: 'Deep Dive Issue', pt: 'Análise Profunda do Problema' },
        duration: '25 min',
        questions: {
          en: [
            'What specific situation is causing the most friction?',
            'What does each party want/need?',
            'What would "resolved" look like?',
          ],
          pt: [
            'Que situação específica está a causar mais fricção?',
            'O que cada parte quer/precisa?',
            'Como seria estar "resolvido"?',
          ],
        },
        objectives: {
          en: ['Understand all perspectives', 'Find common ground', 'Define success'],
          pt: ['Compreender todas as perspetivas', 'Encontrar terreno comum', 'Definir sucesso'],
        },
      },
      {
        name: { en: 'Path Forward', pt: 'Caminho a Seguir' },
        duration: '15 min',
        questions: {
          en: [
            'What is the first conversation you need to have?',
            'What support or training would help?',
            'How will you know if things are improving?',
          ],
          pt: [
            'Qual é a primeira conversa que precisa de ter?',
            'Que apoio ou formação ajudaria?',
            'Como vai saber se as coisas estão a melhorar?',
          ],
        },
        objectives: {
          en: ['Plan specific actions', 'Identify resources', 'Set check-in points'],
          pt: ['Planear ações específicas', 'Identificar recursos', 'Definir pontos de check-in'],
        },
      },
    ],
  },
];

export function SessionFrameworksTab() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language || 'en';
  const [expandedFramework, setExpandedFramework] = useState<string | null>(null);
  const [expandedStage, setExpandedStage] = useState<string | null>(null);

  const copyQuestions = (framework: SessionFramework) => {
    const text = framework.stages
      .map(
        (s) =>
          `## ${pick(lang, s.name)} (${s.duration})\n${pick(lang, s.questions).map((q) => `- ${q}`).join('\n')}`
      )
      .join('\n\n');
    navigator.clipboard.writeText(text);
    toast.success(t('consultorTools.questionsCopied'));
  };

  const copyAgenda = (framework: SessionFramework) => {
    const text = `# ${pick(lang, framework.title)}\n\n${t('consultorTools.duration', { defaultValue: 'Duration' })}: ${framework.duration}\n${t('consultorTools.purpose', { defaultValue: 'Purpose' })}: ${pick(lang, framework.purpose)}\n\n${framework.stages
      .map((s) => `## ${pick(lang, s.name)} (${s.duration})\n${pick(lang, s.objectives).map((o) => `- ${o}`).join('\n')}`)
      .join('\n\n')}`;
    navigator.clipboard.writeText(text);
    toast.success(t('consultorTools.agendaCopied'));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            {t('consultorTools.sessionFrameworks')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('consultorTools.sessionFrameworksDesc')}
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Sparkles className="h-3 w-3" />
          {FRAMEWORKS.length} {t('consultorTools.frameworks')}
        </Badge>
      </div>

      {/* Framework Cards */}
      <div className="space-y-4">
        {FRAMEWORKS.map((framework) => {
          const Icon = framework.icon;
          const isExpanded = expandedFramework === framework.id;
          const title = pick(lang, framework.title);
          const purpose = pick(lang, framework.purpose);
          const bestFor = pick(lang, framework.bestFor);
          const outcomes = pick(lang, framework.outcomes);
          const tips = pick(lang, framework.tips);

          return (
            <Card key={framework.id} className="overflow-hidden">
              <Collapsible open={isExpanded} onOpenChange={() => setExpandedFramework(isExpanded ? null : framework.id)}>
                <CollapsibleTrigger asChild>
                  <CardHeader className={cn('cursor-pointer transition-colors hover:bg-muted/50', framework.bgColor)}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <div className={cn('p-2 rounded-lg bg-background/80', framework.color)}>
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            {title}
                            <Badge variant="secondary" className="text-xs font-normal">
                              <Clock className="h-3 w-3 mr-1" />
                              {framework.duration}
                            </Badge>
                          </CardTitle>
                          <CardDescription className="mt-1">{purpose}</CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyAgenda(framework);
                          }}
                        >
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          {t('consultorTools.agenda')}
                        </Button>
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>

                    {/* Best For Badges */}
                    <div className="flex flex-wrap gap-2 mt-3">
                      {bestFor.slice(0, 3).map((item, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          <Target className="h-3 w-3 mr-1" />
                          {item}
                        </Badge>
                      ))}
                    </div>
                  </CardHeader>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <CardContent className="pt-0 space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">{t('consultorTools.sessionFlow')}</h4>
                        <Button variant="outline" size="sm" onClick={() => copyQuestions(framework)}>
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          {t('consultorTools.copyAllQuestions')}
                        </Button>
                      </div>

                      {framework.stages.map((stage, idx) => {
                        const stageKey = `${framework.id}-${idx}`;
                        const isStageExpanded = expandedStage === stageKey;
                        const stageName = pick(lang, stage.name);
                        const stageQs = pick(lang, stage.questions);
                        const stageObjs = pick(lang, stage.objectives);

                        return (
                          <Card key={idx} className="bg-muted/30">
                            <Collapsible
                              open={isStageExpanded}
                              onOpenChange={() => setExpandedStage(isStageExpanded ? null : stageKey)}
                            >
                              <CollapsibleTrigger asChild>
                                <CardHeader className="py-3 cursor-pointer hover:bg-muted/50 transition-colors">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                                        {idx + 1}
                                      </div>
                                      <div>
                                        <p className="font-medium text-sm">{stageName}</p>
                                        <p className="text-xs text-muted-foreground">{stage.duration}</p>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge variant="secondary" className="text-xs">
                                        {stageQs.length} {t('consultorTools.questions')}
                                      </Badge>
                                      {isStageExpanded ? (
                                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                      ) : (
                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                      )}
                                    </div>
                                  </div>
                                </CardHeader>
                              </CollapsibleTrigger>

                              <CollapsibleContent>
                                <CardContent className="pt-0 space-y-4">
                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                      <CheckCircle2 className="h-3 w-3" />
                                      {t('consultorTools.objectives')}
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                      {stageObjs.map((obj, i) => (
                                        <Badge key={i} variant="outline" className="text-xs">
                                          {obj}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>

                                  <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                                      <MessageSquare className="h-3 w-3" />
                                      {t('consultorTools.questionsToAsk')}
                                    </p>
                                    <ul className="space-y-2">
                                      {stageQs.map((q, i) => (
                                        <li key={i} className="flex items-start gap-2 text-sm">
                                          <ArrowRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                                          <span>{q}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </CardContent>
                              </CollapsibleContent>
                            </Collapsible>
                          </Card>
                        );
                      })}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                        <p className="text-xs font-medium text-green-700 dark:text-green-300 mb-2 flex items-center gap-1">
                          <TrendingUp className="h-3 w-3" />
                          {t('consultorTools.expectedOutcomes')}
                        </p>
                        <ul className="space-y-1">
                          {outcomes.map((o, i) => (
                            <li key={i} className="text-sm flex items-center gap-2">
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                              {o}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <p className="text-xs font-medium text-amber-700 dark:text-amber-300 mb-2 flex items-center gap-1">
                          <Lightbulb className="h-3 w-3" />
                          {t('consultorTools.proTips')}
                        </p>
                        <ul className="space-y-1">
                          {tips.map((tip, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0 mt-0.5" />
                              {tip}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
