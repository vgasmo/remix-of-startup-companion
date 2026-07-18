/**
 * NextBestActionPanels — Stream F (additive, read-only).
 *
 * Three role-scoped panels that derive ONE primary action from real state.
 * No new queries — accepts already-loaded data via props.
 * Each suggestion includes a "why" line grounded in observable fields.
 */
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  ArrowRight,
  ClipboardCheck,
  CalendarClock,
  FileSignature,
  UserPlus,
  ListChecks,
  HeartHandshake,
  Inbox,
  Info,
} from 'lucide-react';
import type { WorkspaceWithDetails } from '@/hooks/useWorkspaces';

interface Action {
  icon: typeof Sparkles;
  title: string;
  why: string;
  ctaLabel: string;
  to: string;
}

function ActionCard({ action }: { action: Action | null }) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const Icon = action?.icon ?? Sparkles;

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {t('nextBestAction.title', { defaultValue: 'Próxima melhor ação' })}
          <Badge variant="outline" className="ml-auto text-[10px] py-0 h-4">
            {t('nextBestAction.derived', { defaultValue: 'derivada do estado real' })}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {action ? (
          <>
            <div className="flex items-start gap-3">
              <div className="rounded-md bg-primary/10 p-2 flex-shrink-0">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm leading-snug">{action.title}</div>
                <div className="text-xs text-muted-foreground mt-1 flex items-start gap-1.5">
                  <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>{action.why}</span>
                </div>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={() => navigate(action.to)}
            >
              {action.ctaLabel}
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          </>
        ) : (
          <div className="text-xs text-muted-foreground py-2">
            {t('nextBestAction.allClear', {
              defaultValue: 'Sem ações urgentes derivadas do estado actual.',
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───────────────────────── Founder ───────────────────────── */

interface FounderProps {
  workspace?: WorkspaceWithDetails | null;
  pendingCheckinsCount?: number;
  hasPendingContractIntake?: boolean;
}

export function NextBestActionFounder({
  workspace,
  pendingCheckinsCount = 0,
  hasPendingContractIntake = false,
}: FounderProps) {
  const { t } = useTranslation();

  const action = useMemo<Action | null>(() => {
    if (!workspace) return null;

    if ((workspace as any).needs_onboarding) {
      return {
        icon: ClipboardCheck,
        title: t('nextBestAction.founder.onboarding.title', {
          defaultValue: 'Completar onboarding do workspace',
        }),
        why: t('nextBestAction.founder.onboarding.why', {
          defaultValue: 'O workspace está marcado como needs_onboarding=true.',
        }),
        ctaLabel: t('nextBestAction.continue', { defaultValue: 'Continuar' }),
        to: `/workspace/${workspace.id}`,
      };
    }

    if (hasPendingContractIntake) {
      return {
        icon: FileSignature,
        title: t('nextBestAction.founder.intake.title', {
          defaultValue: 'Preencher dados de contratação',
        }),
        why: t('nextBestAction.founder.intake.why', {
          defaultValue: 'Existe um intake de contrato em estado editável associado a esta startup.',
        }),
        ctaLabel: t('nextBestAction.openIntake', { defaultValue: 'Abrir formulário' }),
        to: `/workspace/${workspace.id}?tab=contracts`,
      };
    }

    if (pendingCheckinsCount > 0) {
      return {
        icon: ListChecks,
        title: t('nextBestAction.founder.checkin.title', {
          defaultValue: 'Submeter check-in semanal pendente',
        }),
        why: t('nextBestAction.founder.checkin.why', {
          defaultValue: '{{count}} check-in(s) por submeter esta semana.',
          count: pendingCheckinsCount,
        }),
        ctaLabel: t('nextBestAction.openCheckin', { defaultValue: 'Abrir check-in' }),
        to: `/workspace/${workspace.id}?tab=overview&open=checkin`,
      };
    }

    return null;
  }, [workspace, pendingCheckinsCount, hasPendingContractIntake, t]);

  return <ActionCard action={action} />;
}

/* ───────────────────────── Staff / Backoffice ───────────────────────── */

interface StaffProps {
  contractsAwaitingSignatureCount?: number;
  intakesBlockedCount?: number;
  unassignedActiveWorkspacesCount?: number;
}

export function NextBestActionStaff({
  contractsAwaitingSignatureCount = 0,
  intakesBlockedCount = 0,
  unassignedActiveWorkspacesCount = 0,
}: StaffProps) {
  const { t } = useTranslation();

  const action = useMemo<Action | null>(() => {
    if (intakesBlockedCount > 0) {
      return {
        icon: Inbox,
        title: t('nextBestAction.staff.intakesBlocked.title', {
          defaultValue: 'Rever intakes bloqueados por dados em falta',
        }),
        why: t('nextBestAction.staff.intakesBlocked.why', {
          defaultValue: '{{count}} intake(s) em review_pending ou changes_requested.',
          count: intakesBlockedCount,
        }),
        ctaLabel: t('nextBestAction.review', { defaultValue: 'Rever' }),
        to: '/admin?tab=backoffice&subtab=contracts',
      };
    }

    if (contractsAwaitingSignatureCount > 0) {
      return {
        icon: FileSignature,
        title: t('nextBestAction.staff.signatures.title', {
          defaultValue: 'Acompanhar contratos enviados para assinatura',
        }),
        why: t('nextBestAction.staff.signatures.why', {
          defaultValue: '{{count}} contrato(s) com signature_status pendente.',
          count: contractsAwaitingSignatureCount,
        }),
        ctaLabel: t('nextBestAction.open', { defaultValue: 'Abrir' }),
        to: '/backoffice?tab=contracts',
      };
    }

    if (unassignedActiveWorkspacesCount > 0) {
      return {
        icon: UserPlus,
        title: t('nextBestAction.staff.unassigned.title', {
          defaultValue: 'Atribuir consultor a workspaces activos',
        }),
        why: t('nextBestAction.staff.unassigned.why', {
          defaultValue: '{{count}} workspace(s) activo(s) sem assigned_consultor_id.',
          count: unassignedActiveWorkspacesCount,
        }),
        ctaLabel: t('nextBestAction.assign', { defaultValue: 'Atribuir' }),
        to: '/ecosystem',
      };
    }

    return null;
  }, [contractsAwaitingSignatureCount, intakesBlockedCount, unassignedActiveWorkspacesCount, t]);

  return <ActionCard action={action} />;
}

/* ───────────────────────── Mentor ───────────────────────── */

interface MentorProps {
  upcomingSessionsCount?: number;
  pendingMentorRequestsCount?: number;
  ndaPending?: boolean;
}

export function NextBestActionMentor({
  upcomingSessionsCount = 0,
  pendingMentorRequestsCount = 0,
  ndaPending = false,
}: MentorProps) {
  const { t } = useTranslation();

  const action = useMemo<Action | null>(() => {
    if (ndaPending) {
      return {
        icon: FileSignature,
        title: t('nextBestAction.mentor.nda.title', {
          defaultValue: 'Aceitar NDA para desbloquear acesso',
        }),
        why: t('nextBestAction.mentor.nda.why', {
          defaultValue: 'O acesso a workspaces de mentor está bloqueado até aceitar o NDA.',
        }),
        ctaLabel: t('nextBestAction.acceptNda', { defaultValue: 'Aceitar NDA' }),
        to: '/mentor-nda',
      };
    }

    if (pendingMentorRequestsCount > 0) {
      return {
        icon: HeartHandshake,
        title: t('nextBestAction.mentor.requests.title', {
          defaultValue: 'Responder a pedidos de mentoria',
        }),
        why: t('nextBestAction.mentor.requests.why', {
          defaultValue: '{{count}} pedido(s) pendente(s) na sua fila.',
          count: pendingMentorRequestsCount,
        }),
        ctaLabel: t('nextBestAction.open', { defaultValue: 'Abrir' }),
        to: '/mentors',
      };
    }

    if (upcomingSessionsCount > 0) {
      return {
        icon: CalendarClock,
        title: t('nextBestAction.mentor.sessions.title', {
          defaultValue: 'Preparar próxima sessão',
        }),
        why: t('nextBestAction.mentor.sessions.why', {
          defaultValue: '{{count}} sessão(ões) marcada(s) próximas.',
          count: upcomingSessionsCount,
        }),
        ctaLabel: t('nextBestAction.prepare', { defaultValue: 'Preparar' }),
        to: '/my-workspaces',
      };
    }

    return null;
  }, [upcomingSessionsCount, pendingMentorRequestsCount, ndaPending, t]);

  return <ActionCard action={action} />;
}
