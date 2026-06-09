import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Building2,
  Layers,
  BarChart3,
  BookOpen,
  Bell,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Star,
  Pencil,
} from 'lucide-react';
import type { ProgramSetupDraft } from '@/hooks/useProgramSetup';

interface WizardReviewStepProps {
  draft: ProgramSetupDraft;
  validationErrors: string[];
  availableSteps?: string[];
  showAlertRulesCard?: boolean;
  showHealthCard?: boolean;
  onNavigateToStep?: (step: string) => void;
}

export function WizardReviewStep({
  draft,
  validationErrors,
  availableSteps,
  showAlertRulesCard = true,
  showHealthCard = true,
  onNavigateToStep,
}: WizardReviewStepProps) {
  const { t } = useTranslation();
  const { basics, stages, kpis, coreKpis, playbooks, alertRules, healthModel } = draft.draft_json;

  const activeStages = stages?.filter((s) => s.is_active) || [];
  const totalKpis = kpis?.reduce((sum, s) => sum + s.kpis.length, 0) || 0;
  const totalPlaybookItems = playbooks?.reduce((sum, p) => sum + p.items.length, 0) || 0;
  const enabledRules = alertRules?.filter((r) => r.is_enabled).length || 0;
  const enabledStepSet = new Set(availableSteps || ['basics', 'stages', 'kpis', 'playbooks', 'alerts', 'review']);

  const hasErrors = validationErrors.length > 0;
  const canNavigateToStep = (step: string) => enabledStepSet.has(step) && !!onNavigateToStep;
  const getCardClassName = (step: string) =>
    canNavigateToStep(step)
      ? 'cursor-pointer hover:border-primary/40 transition-colors'
      : 'transition-colors';

  const EditButton = ({ step }: { step: string }) => (
    canNavigateToStep(step) ? (
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 ml-auto opacity-60 hover:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          onNavigateToStep?.(step);
        }}
        title={t('common.edit', 'Editar')}
      >
        <Pencil className="h-3 w-3" />
      </Button>
    ) : null
  );

  return (
    <div className="space-y-6">
      {hasErrors ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('admin.wizard.cannotPublish', 'Não é possível publicar')}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc list-inside mt-2 space-y-1">
              {validationErrors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/10">
          <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />
          <AlertTitle className="text-[hsl(var(--success))]">{t('admin.wizard.readyToPublish', 'Pronto para Publicar')}</AlertTitle>
          <AlertDescription className="text-[hsl(var(--success))]">
            {t('admin.wizard.allValidationsPassed', 'Todas as validações passaram. A configuração do programa está pronta para ser publicada.')}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className={getCardClassName('basics')} onClick={() => canNavigateToStep('basics') && onNavigateToStep?.('basics')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              {t('programSetup.steps.basics', 'Dados Básicos')}
              <EditButton step="basics" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <p className="font-medium">{basics?.name || t('common.untitled', 'Sem título')}</p>
              {basics?.description && (
                <p className="text-xs text-muted-foreground line-clamp-2">{basics.description}</p>
              )}
              {basics?.start_date && (
                <p className="text-xs text-muted-foreground">{t('programSetup.startsAt', 'Início')}: {basics.start_date}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {enabledStepSet.has('stages') && (
          <Card className={getCardClassName('stages')} onClick={() => canNavigateToStep('stages') && onNavigateToStep?.('stages')}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Layers className="h-4 w-4" />
                {t('programSetup.steps.stages', 'Etapas')}
                <EditButton step="stages" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {activeStages.map((stage) => (
                  <Badge key={stage.stage_key} variant="secondary">
                    {stage.name}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t('admin.wizard.activeStages', { count: activeStages.length, defaultValue: '{{count}} etapas ativas' })}
              </p>
            </CardContent>
          </Card>
        )}

        {enabledStepSet.has('kpis') && (
          <Card className={getCardClassName('kpis')} onClick={() => canNavigateToStep('kpis') && onNavigateToStep?.('kpis')}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                KPIs
                <EditButton step="kpis" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalKpis}</p>
              <p className="text-xs text-muted-foreground">{t('admin.wizard.totalAcrossStages', 'Total em todas as etapas')}</p>
              <div className="flex items-center gap-1 mt-2">
                <Star className="h-3 w-3 text-[hsl(var(--warning))]" />
                <span className="text-xs">
                  {coreKpis?.length || 0} {t('admin.wizard.coreKpis', 'KPIs principais')}
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {enabledStepSet.has('playbooks') && (
          <Card className={getCardClassName('playbooks')} onClick={() => canNavigateToStep('playbooks') && onNavigateToStep?.('playbooks')}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Playbooks
                <EditButton step="playbooks" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{playbooks?.length || 0}</p>
              <p className="text-xs text-muted-foreground">
                {totalPlaybookItems} {t('admin.wizard.playbookItems', 'itens (milestones + ações)')}
              </p>
            </CardContent>
          </Card>
        )}

        {showAlertRulesCard && enabledStepSet.has('alerts') && (
          <Card className={getCardClassName('alerts')} onClick={() => canNavigateToStep('alerts') && onNavigateToStep?.('alerts')}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bell className="h-4 w-4" />
                {t('admin.wizard.alertRules', 'Regras de Alerta')}
                <EditButton step="alerts" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{enabledRules}</p>
              <p className="text-xs text-muted-foreground">
                {t('admin.wizard.rulesEnabled', { count: alertRules?.length || 0, defaultValue: 'de {{count}} regras ativas' })}
              </p>
            </CardContent>
          </Card>
        )}

        {showHealthCard && enabledStepSet.has('alerts') && (
          <Card className={getCardClassName('alerts')} onClick={() => canNavigateToStep('alerts') && onNavigateToStep?.('alerts')}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                {healthModel?.is_enabled ? (
                  <CheckCircle className="h-4 w-4 text-[hsl(var(--success))]" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground" />
                )}
                Health Scoring
                <EditButton step="alerts" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={healthModel?.is_enabled ? 'default' : 'secondary'}>
                {healthModel?.is_enabled ? t('common.enabled', 'Ativado') : t('common.disabled', 'Desativado')}
              </Badge>
              {healthModel?.is_enabled && (
                <p className="text-xs text-muted-foreground mt-2">
                  {Object.keys(healthModel.weights_json || {}).length} {t('admin.wizard.dimensionsConfigured', 'dimensões configuradas')}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('admin.wizard.coreKpisTitle', 'KPIs Principais')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[100px]">
            <div className="flex flex-wrap gap-2">
              {coreKpis?.map((kpi, idx) => (
                <Badge key={idx} variant="outline" className="gap-1">
                  <Star className="h-3 w-3 text-[hsl(var(--warning))]" />
                  {kpi.name}
                </Badge>
              ))}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
