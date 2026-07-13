import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Zap, 
  TrendingUp, 
  CheckCircle2, 
  ClipboardList, 
  Calendar, 
  AlertTriangle,
  ChevronRight,
  Sparkles,
  MessageSquareText,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useWorkspaceActions, useWorkspaceKpis, useWorkspaceNextSession } from '@/hooks/useWorkspaceData';
import { usePendingCheckin } from '@/hooks/useCheckins';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { triggerMiniCelebration } from '@/lib/confetti';
import { format, isThisMonth, subDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface NextBestActionProps {
  workspaceId: string;
  programId: string;
  stage: string;
  canWrite: boolean;
}

interface ActionItem {
  id: string;
  type: 'kpi' | 'action' | 'checkin' | 'session' | 'stage_gate' | 'mentor_feedback';
  priority: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  variant: 'destructive' | 'warning' | 'default';
  action: () => void;
  actionLabel: string;
}

export function NextBestAction({ workspaceId, programId, stage, canWrite }: NextBestActionProps) {
  const { t, i18n } = useTranslation();
  const dateLocale = useDateLocale();
  const [, setSearchParams] = useSearchParams();
  const { data: actions } = useWorkspaceActions(workspaceId);
  const { data: kpiData } = useWorkspaceKpis(workspaceId);
  const { data: nextSession } = useWorkspaceNextSession(workspaceId);
  const { data: pendingCheckin } = usePendingCheckin(workspaceId);

  // Fetch recent shared consultant/mentor notes (last 7 days)
  const { data: recentFeedback } = useQuery({
    queryKey: ['mentor-feedback-nudge', workspaceId],
    queryFn: async () => {
      const since = subDays(new Date(), 7).toISOString();
      const { data, error } = await supabase
        .from('consultant_notes')
        .select('id, content, created_at')
        .eq('workspace_id', workspaceId)
        .eq('visibility', 'shared_with_founder')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
    enabled: !!workspaceId,
  });

  const nextActions = useMemo<ActionItem[]>(() => {
    const items: ActionItem[] = [];
    const today = new Date();

    const overdueActions = actions?.filter(a => 
      a.due_date && new Date(a.due_date) < today && a.status !== 'completed' && a.status !== 'awaiting_validation' && a.status !== 'cancelled'
    ) || [];
    
    if (overdueActions.length > 0) {
      items.push({
        id: 'overdue-actions',
        type: 'action',
        priority: 1,
        title: t('nextBestAction.overdueActions', { count: overdueActions.length }),
        description: t('nextBestAction.completeOrReschedule'),
        icon: <AlertTriangle className="h-5 w-5" />,
        variant: 'destructive',
        action: () => setSearchParams({ tab: 'milestones-actions' }),
        actionLabel: t('nextBestAction.viewActions'),
      });
    }

    if (pendingCheckin) {
      items.push({
        id: 'pending-checkin',
        type: 'checkin',
        priority: 2,
        title: t('nextBestAction.weeklyCheckinPending'),
        description: t('nextBestAction.dueOn', { date: format(new Date(pendingCheckin.due_date), 'EEEE', { locale: dateLocale }) }),
        icon: <ClipboardList className="h-5 w-5" />,
        variant: 'warning',
        action: () => setSearchParams({ tab: 'overview' }),
        actionLabel: t('nextBestAction.completeCheckin'),
      });
    }

    const hasCurrentMonthKpis = kpiData?.current.some(k => 
      k.period_month && isThisMonth(new Date(k.period_month))
    );
    
    if (!hasCurrentMonthKpis) {
      items.push({
        id: 'missing-kpis',
        type: 'kpi',
        priority: 3,
        title: t('nextBestAction.updateKpisForMonth'),
        description: t('nextBestAction.trackProgress'),
        icon: <TrendingUp className="h-5 w-5" />,
        variant: 'warning',
        action: () => setSearchParams({ tab: 'kpis' }),
        actionLabel: t('nextBestAction.addKpis'),
      });
    }

    if (nextSession) {
      const sessionDate = new Date(nextSession.starts_at);
      const daysUntil = Math.ceil((sessionDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      
      if (daysUntil <= 2 && daysUntil >= 0) {
        items.push({
          id: 'session-prep',
          type: 'session',
          priority: 4,
          title: t('nextBestAction.prepareSession'),
          description: t('nextBestAction.sessionOn', { title: nextSession.title, date: format(sessionDate, 'EEE, dd MMM', { locale: dateLocale }) }),
          icon: <Calendar className="h-5 w-5" />,
          variant: 'default',
          action: () => setSearchParams({ tab: 'agenda' }),
          actionLabel: t('nextBestAction.viewSession'),
        });
      }
    }

    // Mentor/consultant feedback nudge
    if (recentFeedback && recentFeedback.length > 0) {
      const preview = recentFeedback[0].content.slice(0, 60);
      items.push({
        id: 'mentor-feedback',
        type: 'mentor_feedback',
        priority: 2.5,
        title: t('nextBestAction.mentorFeedbackReceived', { count: recentFeedback.length }),
        description: preview + (recentFeedback[0].content.length > 60 ? '…' : ''),
        icon: <MessageSquareText className="h-5 w-5" />,
        variant: 'default',
        action: () => setSearchParams({ tab: 'interactions' }),
        actionLabel: t('nextBestAction.viewFeedback'),
      });
    }

    const inProgressActions = actions?.filter(a => a.status === 'in_progress') || [];
    if (inProgressActions.length > 0 && items.length < 3) {
      items.push({
        id: 'in-progress-actions',
        type: 'action',
        priority: 5,
        title: t('nextBestAction.actionsInProgress', { count: inProgressActions.length }),
        description: inProgressActions[0]?.title || t('nextBestAction.continueWork'),
        icon: <CheckCircle2 className="h-5 w-5" />,
        variant: 'default',
        action: () => setSearchParams({ tab: 'milestones-actions' }),
        actionLabel: t('nextBestAction.continue'),
      });
    }

    return items.sort((a, b) => a.priority - b.priority).slice(0, 3);
  }, [actions, kpiData, nextSession, pendingCheckin, recentFeedback, setSearchParams, t]);

  if (nextActions.length === 0) {
    return (
      <Card className="relative overflow-hidden border-[hsl(var(--success))]/30 bg-gradient-to-r from-[hsl(var(--success))]/80 via-[hsl(var(--success))]/50 to-transparent ">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-[hsl(var(--success))]/10 to-transparent rounded-bl-full" />
        <CardContent className="py-6 relative">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-[hsl(var(--success))]/10 flex items-center justify-center ring-1 ring-[hsl(var(--success))]/20">
              <CheckCircle2 className="h-6 w-6 text-[hsl(var(--success))]" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-[hsl(var(--success))]">{t('nextBestAction.allCaughtUp')}</h3>
              <p className="text-sm text-[hsl(var(--success))]">{t('nextBestAction.noUrgentActions')}</p>
            </div>
            <Sparkles className="h-5 w-5 text-[hsl(var(--success))]/50" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="relative overflow-hidden">
      {/* Subtle hero gradient */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/3 via-transparent to-accent/3 pointer-events-none" />
      
      <CardHeader className="pb-3 relative">
        <CardTitle className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          {t('nextBestAction.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 relative">
        {nextActions.map((item, index) => (
          <div 
            key={item.id}
            className={cn(
              'group flex items-center justify-between p-3 rounded-xl border transition-all duration-200',
              'hover:shadow-sm hover:scale-[1.005]',
              item.variant === 'destructive' 
                ? 'border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/40 hover:border-[hsl(var(--warning))]/60' 
                : item.variant === 'warning'
                ? 'border-[hsl(var(--warning))]/50 bg-[hsl(var(--warning))]/30 hover:border-[hsl(var(--warning))]/60'
                : 'border-border bg-muted/30 hover:border-border/80 hover:bg-muted/50',
              index === 0 && 'ring-1 ring-primary/10'
            )}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                'h-10 w-10 rounded-xl flex items-center justify-center transition-transform duration-200 group-hover:scale-105',
                item.variant === 'destructive' 
                  ? 'bg-[hsl(var(--warning))]/80 text-[hsl(var(--warning))] ' 
                  : item.variant === 'warning'
                  ? 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] '
                  : 'bg-muted text-muted-foreground'
              )}>
                {item.icon}
              </div>
              <div>
                <p className="font-medium text-sm">{item.title}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            </div>
            {canWrite && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={item.action}
                className="gap-1 opacity-70 group-hover:opacity-100 transition-opacity"
              >
                {item.actionLabel}
                <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
