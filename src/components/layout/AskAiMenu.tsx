import { useMemo } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sparkles, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';

function fireAskAi(question?: string) {
  document.dispatchEvent(
    new CustomEvent('sl-ask-ai', { detail: { question }, bubbles: true })
  );
}

interface Suggestion {
  label: string;
  question: string;
}

/**
 * Produce route-aware suggested questions for the AI Copilot.
 * Routes covered: /my-workspaces, /workspace/:id (+ ?tab), /admin, /crm,
 * /ecosystem, /mentors, /backoffice, /documents, /settings, /search.
 */
function useContextualSuggestions(): { title: string; items: Suggestion[] } {
  const { t } = useTranslation();
  const location = useLocation();
  const params = useParams();
  const { isAdmin, isStaff, isFounder, isMentor } = useAuth();

  return useMemo(() => {
    const path = location.pathname;
    const tab = new URLSearchParams(location.search).get('tab') || '';

    // Workspace tab-specific
    if (path.startsWith('/workspace/')) {
      if (tab.startsWith('milestones-actions')) {
        return {
          title: t('askAi.ctx.workspaceActions', { defaultValue: 'Sobre milestones e ações' }),
          items: [
            { label: t('askAi.q.actionsOverdue', { defaultValue: 'Quais ações estão em atraso?' }), question: 'Quais ações desta startup estão em atraso e o que devo fazer primeiro?' },
            { label: t('askAi.q.nextMilestone', { defaultValue: 'Qual é o próximo milestone?' }), question: 'Qual é o próximo milestone desta startup e que ações o desbloqueiam?' },
            { label: t('askAi.q.howCreateAction', { defaultValue: 'Como criar uma ação?' }), question: 'Como criar uma nova ação dentro de um milestone?' },
          ],
        };
      }
      if (tab === 'kpis') {
        return {
          title: t('askAi.ctx.workspaceKpis', { defaultValue: 'Sobre KPIs' }),
          items: [
            { label: t('askAi.q.kpiTrend', { defaultValue: 'Como evoluíram os KPIs?' }), question: 'Resumo da evolução dos KPIs desta startup nos últimos 3 meses.' },
            { label: t('askAi.q.kpiSuggested', { defaultValue: 'Que KPIs devo acompanhar?' }), question: 'Que KPIs são recomendados para esta startup tendo em conta o seu estágio?' },
            { label: t('askAi.q.howUpdateKpis', { defaultValue: 'Como atualizar KPIs?' }), question: 'Como atualizar os valores mensais dos KPIs?' },
          ],
        };
      }
      if (tab === 'agenda') {
        return {
          title: t('askAi.ctx.workspaceAgenda', { defaultValue: 'Sobre sessões' }),
          items: [
            { label: t('askAi.q.scheduleSession', { defaultValue: 'Como agendar uma sessão?' }), question: 'Como agendar uma sessão e que opções de calendário existem?' },
            { label: t('askAi.q.upcomingSessions', { defaultValue: 'Que sessões próximas existem?' }), question: 'Que sessões estão agendadas para esta startup nas próximas 2 semanas?' },
          ],
        };
      }
      if (tab === 'documents') {
        return {
          title: t('askAi.ctx.workspaceDocs', { defaultValue: 'Sobre documentos' }),
          items: [
            { label: t('askAi.q.uploadDoc', { defaultValue: 'Como fazer upload de documentos?' }), question: 'Como fazer upload de um documento e categorizá-lo corretamente?' },
            { label: t('askAi.q.docReview', { defaultValue: 'Como pedir revisão de documento?' }), question: 'Como funciona o fluxo de revisão de documentos (manual e automático)?' },
          ],
        };
      }
      return {
        title: t('askAi.ctx.workspace', { defaultValue: 'Sobre esta startup' }),
        items: [
          { label: t('askAi.q.startupHealth', { defaultValue: 'Como está a saúde desta startup?' }), question: 'Resumo da saúde desta startup: KPIs, ações, sessões e riscos principais.' },
          { label: t('askAi.q.startupNext', { defaultValue: 'O que devo focar agora?' }), question: 'Quais são as 3 prioridades mais importantes para esta startup esta semana?' },
          { label: t('askAi.q.startupRisks', { defaultValue: 'Que riscos existem?' }), question: 'Que sinais de risco existem nesta startup (inatividade, ações em atraso, KPIs em queda)?' },
        ],
      };
    }

    if (path.startsWith('/admin')) {
      return {
        title: t('askAi.ctx.admin', { defaultValue: 'Sobre administração' }),
        items: [
          { label: t('askAi.q.pendingApprovals', { defaultValue: 'Quem está à espera de aprovação?' }), question: 'Quantos utilizadores estão pendentes de aprovação e como aprová-los?' },
          { label: t('askAi.q.contractRenewals', { defaultValue: 'Que contratos expiram em breve?' }), question: 'Que contratos expiram nos próximos 30 dias e que ações devo tomar?' },
          { label: t('askAi.q.howAddProgram', { defaultValue: 'Como criar um programa?' }), question: 'Como criar um novo programa (incubação ou aceleração)?' },
        ],
      };
    }

    if (path.startsWith('/crm')) {
      return {
        title: t('askAi.ctx.crm', { defaultValue: 'Sobre CRM' }),
        items: [
          { label: t('askAi.q.crmHotLeads', { defaultValue: 'Que leads estão quentes?' }), question: 'Que leads no CRM estão mais avançados e precisam de seguimento esta semana?' },
          { label: t('askAi.q.crmConvert', { defaultValue: 'Como converter um lead?' }), question: 'Como converter um lead CRM num contrato e workspace?' },
          { label: t('askAi.q.crmStuck', { defaultValue: 'Que leads estão parados?' }), question: 'Que leads estão parados há mais de 14 dias na mesma fase?' },
        ],
      };
    }

    if (path.startsWith('/ecosystem')) {
      return {
        title: t('askAi.ctx.ecosystem', { defaultValue: 'Sobre o ecossistema' }),
        items: [
          { label: t('askAi.q.ecoTopRisks', { defaultValue: 'Top startups em risco?' }), question: 'Quais as 5 startups com maior risco no ecossistema agora?' },
          { label: t('askAi.q.ecoStageDist', { defaultValue: 'Distribuição por estágio?' }), question: 'Como está distribuído o ecossistema por estágio (ideação, validação, MVP, growth, scale)?' },
          { label: t('askAi.q.ecoConsultorLoad', { defaultValue: 'Carga dos consultores?' }), question: 'Como está distribuída a carga de startups por consultor?' },
        ],
      };
    }

    if (path.startsWith('/mentors')) {
      return {
        title: t('askAi.ctx.mentors', { defaultValue: 'Sobre mentores' }),
        items: [
          { label: t('askAi.q.bookMentor', { defaultValue: 'Como reservar um mentor?' }), question: 'Como reservar um slot com um mentor e que regras de NDA se aplicam?' },
          { label: t('askAi.q.mentorAvailable', { defaultValue: 'Que mentores estão disponíveis?' }), question: 'Que mentores têm disponibilidade nas próximas 2 semanas?' },
        ],
      };
    }

    if (path.startsWith('/backoffice')) {
      return {
        title: t('askAi.ctx.backoffice', { defaultValue: 'Sobre backoffice' }),
        items: [
          { label: t('askAi.q.bofContracts', { defaultValue: 'Estado dos contratos?' }), question: 'Quantos contratos estão ativos, em renovação e em fase de assinatura?' },
          { label: t('askAi.q.bofPricing', { defaultValue: 'Como funciona o pricing?' }), question: 'Como funciona o motor de pricing dos contratos e os 14 tipologias?' },
          { label: t('askAi.q.bofOccupancy', { defaultValue: 'Ocupação de espaços?' }), question: 'Como está a ocupação dos espaços de incubação?' },
        ],
      };
    }

    if (path === '/my-workspaces' || path === '/') {
      if (isFounder && !isStaff) {
        return {
          title: t('askAi.ctx.myWorkspacesFounder', { defaultValue: 'Sobre o seu workspace' }),
          items: [
            { label: t('askAi.q.founderNext', { defaultValue: 'Que devo fazer a seguir?' }), question: 'O que devo fazer a seguir no meu workspace? Resuma os próximos passos.' },
            { label: t('askAi.q.founderKpis', { defaultValue: 'Como atualizo os KPIs?' }), question: 'Como atualizo os KPIs mensais do meu workspace?' },
            { label: t('askAi.q.founderHelp', { defaultValue: 'Onde peço ajuda a um mentor?' }), question: 'Como posso pedir ajuda ou agendar com um mentor?' },
          ],
        };
      }
      return {
        title: t('askAi.ctx.myWorkspaces', { defaultValue: 'Sobre o seu portefólio' }),
        items: [
          { label: t('askAi.q.portfolioRisk', { defaultValue: 'Quais startups precisam de atenção?' }), question: 'Quais startups do meu portefólio precisam de atenção urgente esta semana?' },
          { label: t('askAi.q.portfolioOverdue', { defaultValue: 'Onde estão as ações em atraso?' }), question: 'Resumo das ações em atraso por startup no meu portefólio.' },
          { label: t('askAi.q.portfolioWeek', { defaultValue: 'Resumo da semana?' }), question: 'Resumo executivo do que aconteceu no meu portefólio na última semana.' },
        ],
      };
    }

    if (path.startsWith('/settings')) {
      return {
        title: t('askAi.ctx.settings', { defaultValue: 'Sobre definições' }),
        items: [
          { label: t('askAi.q.connectCalendar', { defaultValue: 'Como ligar o calendário?' }), question: 'Como ligar o meu calendário Outlook/Google?' },
          { label: t('askAi.q.notifSettings', { defaultValue: 'Ajustar notificações?' }), question: 'Como ajustar as minhas preferências de notificação?' },
        ],
      };
    }

    // Default fallback
    return {
      title: t('askAi.ctx.default', { defaultValue: 'Perguntas frequentes' }),
      items: [
        { label: t('askAi.q.howUseApp', { defaultValue: 'Como uso a aplicação?' }), question: 'Dá-me uma visão geral das principais funcionalidades desta plataforma.' },
        { label: t('askAi.q.findStartup', { defaultValue: 'Como encontro uma startup?' }), question: 'Como pesquisar uma startup e abrir o seu workspace?' },
        { label: t('askAi.q.shortcuts', { defaultValue: 'Que atalhos existem?' }), question: 'Que atalhos de teclado e ações rápidas existem na aplicação?' },
      ],
    };
  }, [location.pathname, location.search, params, isAdmin, isStaff, isFounder, isMentor, t]);
}

export function AskAiMenu() {
  const { t } = useTranslation();
  const { title, items } = useContextualSuggestions();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 text-muted-foreground hover:text-violet-500 relative"
          aria-label={t('askAi.button', { defaultValue: 'Ask AI' })}
          title={t('askAi.button', { defaultValue: 'Ask AI' })}
        >
          <Sparkles className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 animate-scale-in">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
          <span className="text-xs">{title}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {items.map((item, idx) => (
          <DropdownMenuItem
            key={idx}
            onClick={() => fireAskAi(item.question)}
            className="cursor-pointer text-sm py-2.5 whitespace-normal items-start gap-2"
          >
            <MessageSquarePlus className="h-3.5 w-3.5 mt-0.5 text-muted-foreground flex-shrink-0" />
            <span className="leading-snug">{item.label}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => fireAskAi()}
          className="cursor-pointer text-xs text-muted-foreground gap-2"
        >
          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
          {t('askAi.askAnything', { defaultValue: 'Fazer outra pergunta…' })}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
