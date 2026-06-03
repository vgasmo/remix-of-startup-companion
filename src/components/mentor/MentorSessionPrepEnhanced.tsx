/**
 * Mentor Session Prep Card — Enhanced
 * Shows structured prep context for the mentor's next session.
 * Read-only, navigation-to-act.
 */

import { useMemo } from 'react';
import { clickableProps } from '@/lib/clickable';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  ClipboardList, Calendar, BarChart3, Target, FileText, 
  ArrowRight, AlertCircle, Clock, CheckCircle2, TrendingUp 
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { StageBadge } from '@/components/ui/StageBadge';
import { format, formatDistanceToNow, differenceInDays, isBefore } from 'date-fns';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';
import { HealthScore } from '@/types/database';
import { cn } from '@/lib/utils';

interface MentorSessionPrepEnhancedProps {
  workspaces: WorkspaceWithDetails[];
}

export function MentorSessionPrepEnhanced({ workspaces }: MentorSessionPrepEnhancedProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const nextSessionWorkspace = useMemo(() => {
    if (!workspaces?.length) return null;
    const withSession = workspaces
      .filter(w => w.nextMeetingDate && !isBefore(new Date(w.nextMeetingDate), new Date()))
      .sort((a, b) => new Date(a.nextMeetingDate!).getTime() - new Date(b.nextMeetingDate!).getTime());
    return withSession[0] || null;
  }, [workspaces]);

  if (!nextSessionWorkspace) return null;

  const w = nextSessionWorkspace;
  const health = (w.health_score_override || w.health_score) as HealthScore | null;
  const daysUntil = differenceInDays(new Date(w.nextMeetingDate!), new Date());
  const isUrgent = daysUntil <= 1;

  const prepItems = [
    { 
      label: t('mentorPrep.kpis', { defaultValue: 'KPIs do mês' }),
      done: Boolean(w.hasCurrentMonthKpi),
      icon: BarChart3,
      path: `/workspace/${w.id}?tab=kpis`
    },
    {
      label: t('mentorPrep.actions', { defaultValue: 'Ações pendentes' }),
      done: w.pendingActionsCount === 0,
      icon: Target,
      detail: w.pendingActionsCount > 0 ? `${w.pendingActionsCount} pendentes` : undefined,
      path: `/workspace/${w.id}?tab=milestones-actions-actions`
    },
    {
      label: t('mentorPrep.lastSession', { defaultValue: 'Notas da última sessão' }),
      done: Boolean(w.lastSession),
      icon: FileText,
      detail: w.lastSession ? formatDistanceToNow(new Date(w.lastSession.scheduled_at), { addSuffix: true }) : undefined,
      path: `/workspace/${w.id}?tab=agenda`
    },
  ];

  return (
    <Card className={cn(
      'rounded-2xl overflow-hidden',
      isUrgent ? 'border-primary/40 ring-1 ring-primary/10' : 'border-border/60'
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            {t('mentorPrep.title', { defaultValue: 'Preparação da Próxima Sessão' })}
          </CardTitle>
          {isUrgent && (
            <Badge variant="default" className="text-[10px]">
              {daysUntil === 0 ? t('common.today', 'Hoje') : t('common.tomorrow', 'Amanhã')}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Startup context */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-sm font-medium">{w.startup?.name}</span>
              <HealthBadge score={health} size="sm" />
              <StageBadge stage={w.stage} size="sm" />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>{format(new Date(w.nextMeetingDate!), "dd MMM 'às' HH:mm")}</span>
              <span className="text-muted-foreground/50">·</span>
              <span>{daysUntil === 0 ? t('common.today') : `${daysUntil}d`}</span>
            </div>
          </div>
          <Button 
            size="sm" 
            className="gap-1.5 text-xs"
            onClick={() => navigate(`/workspace/${w.id}`)}
          >
            {t('mentorPrep.openWorkspace', { defaultValue: 'Abrir' })}
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>

        {/* Prep checklist */}
        <div className="space-y-1.5">
          {prepItems.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.label}
                className={cn(
                  'flex items-center gap-2.5 p-2 rounded-lg text-xs cursor-pointer transition-colors hover:bg-muted/60',
                  !item.done && 'bg-amber-50/50 dark:bg-amber-950/10'
                )}
                {...clickableProps(() => navigate(item.path))}
              >
                <div className={cn(
                  'h-5 w-5 rounded flex items-center justify-center shrink-0',
                  item.done ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-amber-100 dark:bg-amber-900/30'
                )}>
                  {item.done ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  ) : (
                    <AlertCircle className="h-3 w-3 text-amber-600" />
                  )}
                </div>
                <span className="flex-1">{item.label}</span>
                {item.detail && (
                  <span className="text-muted-foreground">{item.detail}</span>
                )}
                <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
              </div>
            );
          })}
        </div>

        {/* Overdue signal */}
        {w.overdueActionsCount > 0 && (
          <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/5 p-2 rounded-lg">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>{t('mentorPrep.overdueWarning', { defaultValue: '{{count}} ações atrasadas que podem precisar de discussão', count: w.overdueActionsCount })}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
