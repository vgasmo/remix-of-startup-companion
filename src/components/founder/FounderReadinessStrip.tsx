import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  CheckCircle2, AlertCircle, BarChart3, FileText, Calendar, 
  Users, Target, ArrowRight, Sparkles 
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';
import { cn } from '@/lib/utils';

interface FounderReadinessStripProps {
  workspace: WorkspaceWithDetails;
}

interface ReadinessItem {
  key: string;
  label: string;
  done: boolean;
  icon: React.ElementType;
  action?: { label: string; path: string };
}

export function FounderReadinessStrip({ workspace }: FounderReadinessStripProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const items = useMemo((): ReadinessItem[] => {
    return [
      {
        key: 'kpis',
        label: t('founderReadiness.kpis', { defaultValue: 'KPIs do mês' }),
        done: Boolean(workspace.hasCurrentMonthKpi),
        icon: BarChart3,
        action: { label: t('founderReadiness.updateKpis', { defaultValue: 'Atualizar' }), path: `/workspace/${workspace.id}?tab=kpis` },
      },
      {
        key: 'session',
        label: t('founderReadiness.session', { defaultValue: 'Sessão recente' }),
        done: Boolean(workspace.lastSession),
        icon: Calendar,
        action: { label: t('founderReadiness.schedule', { defaultValue: 'Agendar' }), path: `/workspace/${workspace.id}?tab=agenda` },
      },
      {
        key: 'actions',
        label: t('founderReadiness.actions', { defaultValue: 'Ações em dia' }),
        done: workspace.overdueActionsCount === 0,
        icon: Target,
        action: workspace.overdueActionsCount > 0 
          ? { label: `${workspace.overdueActionsCount} ${t('common.overdue', 'atrasadas')}`, path: `/workspace/${workspace.id}?tab=milestones-actions-actions` }
          : undefined,
      },
      {
        key: 'health',
        label: t('founderReadiness.health', { defaultValue: 'Saúde do projeto' }),
        done: ['healthy', 'thriving', 'stable'].includes(workspace.health_score_override || workspace.health_score || ''),
        icon: CheckCircle2,
      },
    ];
  }, [workspace, t]);

  const completedCount = items.filter(i => i.done).length;
  const progress = (completedCount / items.length) * 100;
  const nextStep = items.find(i => !i.done);

  return (
    <Card className="border-border/60 rounded-2xl overflow-hidden">
      <CardContent className="p-4">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">
              {t('founderReadiness.title', { defaultValue: 'Prontidão do Projeto' })}
            </span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {completedCount}/{items.length}
            </Badge>
          </div>
          <Progress value={progress} className="w-20 h-1.5" />
        </div>

        {/* Items row */}
        <div className="flex flex-wrap gap-2 mb-2">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.key}
                className={cn(
                  'flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors',
                  item.done
                    ? 'bg-success/5 border-success/30 text-success'
                    : 'bg-muted/50 border-border/50 text-muted-foreground'
                )}
              >
                <Icon className="h-3 w-3" />
                <span>{item.label}</span>
                {item.done && <CheckCircle2 className="h-3 w-3" />}
              </div>
            );
          })}
        </div>

        {/* Next Step CTA */}
        {nextStep?.action && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/40">
            <AlertCircle className="h-3.5 w-3.5 text-warning shrink-0" />
            <span className="text-xs text-muted-foreground flex-1">
              {t('founderReadiness.nextStep', { defaultValue: 'Próximo passo:' })} {nextStep.label}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs h-6 px-2 gap-1"
              onClick={() => navigate(nextStep.action!.path)}
            >
              {nextStep.action.label}
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
