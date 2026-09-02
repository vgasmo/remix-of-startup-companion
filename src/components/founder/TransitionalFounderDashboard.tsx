/**
 * TransitionalFounderDashboard — Shown when a founder's workspace is in
 * claimed / pending / onboarding limbo. Read-only, no mutations.
 * Replaces the full mature dashboard with a reassuring guided view.
 */
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Clock,
  CheckCircle2,
  FileText,
  Settings,
  User,
  Rocket,
  ArrowRight,
  Mail,
  HelpCircle,
  ShieldCheck,
  FolderOpen,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { ResponsibleConsultantCard } from '@/components/workspace/ResponsibleConsultantCard';
import { PendingContractBanner } from '@/components/founder/PendingContractBanner';
import { cn } from '@/lib/utils';

interface TransitionalFounderDashboardProps {
  workspace: {
    id: string;
    status?: string;
    startup?: { name: string; description?: string | null; logo_url?: string | null } | null;
    program?: { name: string } | null;
  };
  workspaceStatus: 'claimed' | 'pending' | 'onboarding' | 'imported_unclaimed';
  contractStatus?: string | null;
}

// `/documents` is staff-only; founders reach their documents through the
// workspace tab instead, so the checklist links depend on the workspace id.
const buildChecklistItems = (workspaceId: string) => [
  { key: 'await_validation', icon: Clock, defaultLabel: 'Aguardar validação da equipa', href: null as string | null },
  { key: 'prepare_docs', icon: FileText, defaultLabel: 'Preparar documentação da startup', href: `/workspace/${workspaceId}?tab=documents` as string | null },
  { key: 'confirm_contacts', icon: User, defaultLabel: 'Confirmar dados de contacto', href: '/settings' as string | null },
  { key: 'explore_resources', icon: FolderOpen, defaultLabel: 'Explorar recursos disponíveis', href: '/resources' as string | null },
];

function getContractLabel(status: string | null | undefined, t: (k: string, o?: any) => string): { label: string; variant: 'default' | 'secondary' | 'outline' } {
  switch (status) {
    case 'active': return { label: t('founder.transitional.contractActive', { defaultValue: 'Contrato ativo' }), variant: 'default' };
    case 'pending_signature': return { label: t('founder.transitional.contractPendingSig', { defaultValue: 'Aguarda assinatura' }), variant: 'secondary' };
    case 'draft': return { label: t('founder.transitional.contractDraft', { defaultValue: 'Contrato em preparação' }), variant: 'outline' };
    default: return { label: t('founder.transitional.contractNone', { defaultValue: 'Sem contrato' }), variant: 'outline' };
  }
}

export function TransitionalFounderDashboard({
  workspace,
  workspaceStatus,
  contractStatus,
}: TransitionalFounderDashboardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const statusConfig = getStatusConfig(workspaceStatus, t);
  const contract = getContractLabel(contractStatus, t);

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Hero Card — Main reassurance */}
      <Card className={cn('rounded-2xl border-2', statusConfig.borderClass)}>
        <CardContent className="pt-8 pb-6 px-6">
          <div className="flex flex-col items-center text-center">
            <div className={cn(
              'h-16 w-16 rounded-2xl flex items-center justify-center mb-4',
              statusConfig.iconBgClass
            )}>
              <statusConfig.icon className={cn('h-8 w-8', statusConfig.iconClass)} />
            </div>

            {workspace.startup?.name && (
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={workspace.startup.logo_url || undefined} />
                  <AvatarFallback className="rounded-lg bg-muted text-xs font-semibold">
                    {workspace.startup.name.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium text-sm text-muted-foreground">
                  {workspace.startup.name}
                </span>
                {workspace.program?.name && (
                  <Badge variant="outline" className="text-[10px]">
                    {workspace.program.name}
                  </Badge>
                )}
              </div>
            )}

            <h1 className="text-xl font-bold tracking-tight mb-2">
              {statusConfig.title}
            </h1>
            <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
              {statusConfig.description}
            </p>

            <div className="flex items-center gap-2 mt-4">
              <Badge
                variant="secondary"
                className={cn('gap-1.5 text-xs', statusConfig.badgeClass)}
              >
                <Clock className="h-3 w-3" />
                {statusConfig.badge}
              </Badge>
              {/* Only render contract badge when real data is provided — avoid misleading fallback */}
              {contractStatus && (
                <Badge variant={contract.variant} className="gap-1.5 text-xs">
                  <FileText className="h-3 w-3" />
                  {contract.label}
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending Contract Banner */}
      <PendingContractBanner workspaceId={workspace.id} />

      {/* What happens next — state-grounded */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <HelpCircle className="h-4 w-4 text-primary" />
            {t('founder.transitional.whatNext', { defaultValue: 'O que acontece a seguir?' })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            {workspaceStatus === 'pending' ? (
              <>
                <StepItem step={1} text={t('founder.transitional.step1Pending', { defaultValue: 'A equipa irá analisar os dados da sua candidatura.' })} />
                <StepItem step={2} text={t('founder.transitional.step2Pending', { defaultValue: 'Se faltarem documentos, será contactado(a) por email.' })} />
                <StepItem step={3} text={t('founder.transitional.step3Pending', { defaultValue: 'Após aprovação, receberá uma notificação para ativar o espaço.' })} />
              </>
            ) : workspaceStatus === 'claimed' ? (
              <>
                <StepItem step={1} text={t('founder.transitional.step1Claimed', { defaultValue: 'A equipa está a verificar a associação com a startup.' })} />
                <StepItem step={2} text={t('founder.transitional.step2Claimed', { defaultValue: 'Poderá ser necessário assinar o contrato de incubação.' })} />
                <StepItem step={3} text={t('founder.transitional.step3Claimed', { defaultValue: 'O espaço será ativado após validação e contrato assinado.' })} />
              </>
            ) : (
              <>
                <StepItem step={1} text={t('founder.transitional.step1', { defaultValue: 'A equipa do programa analisa a sua candidatura.' })} />
                <StepItem step={2} text={t('founder.transitional.step2', { defaultValue: 'Receberá uma notificação quando for aprovada.' })} />
                <StepItem step={3} text={t('founder.transitional.step3', { defaultValue: 'O seu espaço de trabalho será totalmente ativado.' })} />
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground pt-1">
            {t('founder.transitional.timelineNote', { defaultValue: 'Contacte a equipa se tiver questões sobre o estado atual.' })}
          </p>
        </CardContent>
      </Card>

      {/* Guidance Checklist */}
      <Card className="rounded-2xl">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            {t('founder.transitional.checklistTitle', { defaultValue: 'Enquanto aguarda' })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {CHECKLIST_ITEMS.map((item) => {
              const label = t(`founder.transitional.checklist.${item.key}`, { defaultValue: item.defaultLabel });
              const className = 'flex items-center gap-3 py-2.5 px-3 rounded-xl hover:bg-muted/50 transition-colors w-full text-left';
              const content = (
                <>
                  <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <item.icon className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <span className="text-sm flex-1">{label}</span>
                  {item.href && <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />}
                </>
              );
              return item.href ? (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigate(item.href!)}
                  className={className}
                  aria-label={label}
                >
                  {content}
                </button>
              ) : (
                <div key={item.key} className={className.replace('hover:bg-muted/50 ', '')}>
                  {content}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Consultant Contact Card — reuse existing */}
      <ResponsibleConsultantCard workspaceId={workspace.id} />

      {/* Quick Actions */}
      <Card className="rounded-2xl">
        <CardContent className="py-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate('/settings')}
            >
              <Settings className="h-3.5 w-3.5" />
              {t('founder.transitional.goSettings', { defaultValue: 'Definições' })}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate(`/workspace/${workspace.id}`)}
            >
              <ArrowRight className="h-3.5 w-3.5" />
              {t('founder.transitional.goWorkspace', { defaultValue: 'Ver espaço' })}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate('/resources')}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t('founder.transitional.goResources', { defaultValue: 'Recursos' })}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StepItem({ step, text }: { step: number; text: string }) {
  return (
    <div className="flex items-start gap-3 py-1.5">
      <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <span className="text-xs font-bold text-primary">{step}</span>
      </div>
      <span className="text-sm leading-relaxed">{text}</span>
    </div>
  );
}

function getStatusConfig(status: string, t: (key: string, opts?: any) => string) {
  switch (status) {
    case 'claimed':
      return {
        icon: ShieldCheck,
        iconBgClass: 'bg-warning/15',
        iconClass: 'text-warning',
        borderClass: 'border-warning/40',
        badgeClass: 'bg-warning/15 text-warning',
        title: t('founder.transitional.titleClaimed', { defaultValue: 'A sua startup está a ser preparada' }),
        description: t('founder.transitional.descClaimed', { defaultValue: 'A equipa está a analisar a sua candidatura. Assim que for validada, terá acesso completo ao seu espaço de trabalho com KPIs, marcos e sessões.' }),
        badge: t('founder.transitional.badgeClaimed', { defaultValue: 'Candidatura em análise' }),
      };
    case 'pending':
      return {
        icon: Clock,
        iconBgClass: 'bg-info/10',
        iconClass: 'text-info',
        borderClass: 'border-info/30',
        badgeClass: 'bg-info/10 text-info',
        title: t('founder.transitional.titlePending', { defaultValue: 'Candidatura submetida' }),
        description: t('founder.transitional.descPending', { defaultValue: 'A sua candidatura foi recebida e está a aguardar análise. Contacte a equipa se tiver questões.' }),
        badge: t('founder.transitional.badgePending', { defaultValue: 'Aguarda aprovação' }),
      };
    case 'onboarding':
      return {
        icon: Rocket,
        iconBgClass: 'bg-primary/10',
        iconClass: 'text-primary',
        borderClass: 'border-primary/30',
        badgeClass: 'bg-primary/10 text-primary',
        title: t('founder.transitional.titleOnboarding', { defaultValue: 'Boas-vindas! A configurar o seu espaço' }),
        description: t('founder.transitional.descOnboarding', { defaultValue: 'O seu espaço de trabalho está a ser configurado. Em breve terá acesso a todas as ferramentas.' }),
        badge: t('founder.transitional.badgeOnboarding', { defaultValue: 'Em configuração' }),
      };
    default:
      return {
        icon: Clock,
        iconBgClass: 'bg-muted',
        iconClass: 'text-muted-foreground',
        borderClass: 'border-muted',
        badgeClass: '',
        title: t('founder.transitional.titleDefault', { defaultValue: 'Aguarda ativação do espaço' }),
        description: t('founder.transitional.descDefault', { defaultValue: 'O seu espaço aguarda ativação pela equipa. Receberá uma notificação quando estiver disponível.' }),
        badge: t('founder.transitional.badgeDefault', { defaultValue: 'Aguarda ativação' }),
      };
  }
}
