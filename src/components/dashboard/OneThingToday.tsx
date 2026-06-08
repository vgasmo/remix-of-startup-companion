import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Target, 
  TrendingUp, 
  FileText, 
  CheckCircle2, 
  AlertCircle,
  Calendar,
  ArrowRight,
  Lightbulb,
  Sparkles
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';

import { useActionItems } from '@/hooks/useActionItems';
import { usePendingCheckin } from '@/hooks/useCheckins';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';
import { isPast, differenceInDays, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';

interface OneThingTodayProps {
  workspace: WorkspaceWithDetails;
  className?: string;
}

interface RecommendedAction {
  type: 'overdue_action' | 'checkin' | 'kpi_update' | 'session_prep' | 'template' | 'milestone';
  title: string;
  why: string;
  link: string;
  priority: number;
  icon: typeof Target;
  variant: 'destructive' | 'warning' | 'default';
}

export function OneThingToday({ workspace, className }: OneThingTodayProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { data: actions } = useActionItems(workspace.id);
  const { data: pendingCheckin } = usePendingCheckin(workspace.id);

  const recommendation = useMemo<RecommendedAction | null>(() => {
    const candidates: RecommendedAction[] = [];

    const overdueActions = actions?.filter(
      a => a.status !== 'completed' && a.due_date && isPast(new Date(a.due_date))
    ) || [];
    
    if (overdueActions.length > 0) {
      const oldest = overdueActions[0];
      const daysOverdue = differenceInDays(new Date(), new Date(oldest.due_date!));
      const variant = daysOverdue >= 7 ? 'destructive' : 'warning';
      candidates.push({
        type: 'overdue_action',
        title: oldest.title,
        why: t('oneThingToday.overdueWhy', { days: daysOverdue }),
        link: `/workspace/${workspace.id}?tab=milestones-actions-actions`,
        priority: 100 + daysOverdue,
        icon: daysOverdue >= 7 ? AlertCircle : Target,
        variant,
      });
    }

    if (pendingCheckin) {
      candidates.push({
        type: 'checkin',
        title: t('oneThingToday.submitCheckin'),
        why: t('oneThingToday.checkinWhy'),
        link: `/workspace/${workspace.id}?tab=overview`,
        priority: 80,
        icon: Calendar,
        variant: 'warning',
      });
    }

    if (!workspace.hasCurrentMonthKpi) {
      candidates.push({
        type: 'kpi_update',
        title: t('oneThingToday.updateKpis'),
        why: t('oneThingToday.kpiWhy'),
        link: `/workspace/${workspace.id}?tab=kpis`,
        priority: 60,
        icon: TrendingUp,
        variant: 'warning',
      });
    }

    if (workspace.nextMeetingDate) {
      const daysUntil = differenceInDays(new Date(workspace.nextMeetingDate), new Date());
      if (daysUntil <= 2 && daysUntil >= 0) {
        candidates.push({
          type: 'session_prep',
          title: t('oneThingToday.prepSession'),
          why: t('oneThingToday.sessionPrepWhy'),
          link: `/workspace/${workspace.id}?tab=agenda`,
          priority: 50,
          icon: FileText,
          variant: 'default',
        });
      }
    }

    const pendingActions = actions?.filter(
      a => a.status === 'pending' && (!a.due_date || !isPast(new Date(a.due_date)))
    ) || [];
    
    if (pendingActions.length > 0 && candidates.length === 0) {
      const next = pendingActions[0];
      candidates.push({
        type: 'milestone',
        title: next.title,
        why: t('oneThingToday.actionWhy'),
        link: `/workspace/${workspace.id}?tab=milestones-actions-actions`,
        priority: 30,
        icon: CheckCircle2,
        variant: 'default',
      });
    }

    candidates.sort((a, b) => b.priority - a.priority);
    return candidates[0] || null;
  }, [actions, pendingCheckin, workspace, t]);

  if (!recommendation) {
    return (
      <EmptyState
        key="caught-up"
        icon={CheckCircle2}
        tone="success"
        title={t('oneThingToday.allCaughtUp')}
        description={t('oneThingToday.keepMomentum')}
        className={cn('animate-scale-in', className)}
      />
    );
  }


  const Icon = recommendation.icon;
  const isDestructive = recommendation.variant === 'destructive';
  const isWarning = recommendation.variant === 'warning';

  return (
    <Card key={recommendation.type} className={cn(
      'relative overflow-hidden transition-all duration-300 hover:shadow-md hover:scale-[1.005] animate-scale-in',
      isDestructive && 'border-destructive/30 bg-gradient-to-r from-destructive/10 via-destructive/5 to-transparent',
      isWarning && 'border-warning/30 bg-gradient-to-r from-warning/10 via-warning/5 to-transparent',
      !isDestructive && !isWarning && 'border-primary/20 bg-gradient-to-r from-primary/8 via-accent/5 to-transparent',
      className
    )}>

      {/* Subtle glow accent */}
      <div className={cn(
        'absolute top-0 right-0 w-32 h-32 rounded-bl-full opacity-40',
        isDestructive && 'bg-gradient-to-bl from-destructive/15 to-transparent',
        isWarning && 'bg-gradient-to-bl from-warning/15 to-transparent',
        !isDestructive && !isWarning && 'bg-gradient-to-bl from-primary/10 to-transparent',
      )} />
      
      <CardContent className="p-4 relative">
        <div className="flex items-start gap-3">
          <div className={cn(
            'h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ring-1 transition-transform duration-300',
            isDestructive && 'bg-destructive/10 text-destructive ring-destructive/20',
            isWarning && 'bg-warning/10 text-warning ring-warning/20',
            !isDestructive && !isWarning && 'bg-primary/10 text-primary ring-primary/20',
          )}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={cn(
                "text-xs flex items-center gap-1 font-medium",
                isDestructive && 'border-destructive/40 text-destructive',
                isWarning && 'border-warning/40 text-warning',
              )}>
                <Lightbulb className="h-3 w-3" />
                {t('oneThingToday.focusToday')}
              </Badge>
            </div>
            <p className="text-heading truncate">{recommendation.title}</p>
            <p className="text-sm text-muted-foreground line-clamp-2 mt-0.5">{recommendation.why}</p>
          </div>
          <Button
            size="sm"
            variant={isDestructive ? 'destructive' : 'default'}
            onClick={() => navigate(recommendation.link)}
            className="flex-shrink-0 gap-1.5 shadow-sm h-11 sm:h-9 px-4 btn-press"
          >
            {t('common.go')}
            <ArrowRight className="h-4 w-4" />
          </Button>

        </div>
      </CardContent>
    </Card>
  );
}
