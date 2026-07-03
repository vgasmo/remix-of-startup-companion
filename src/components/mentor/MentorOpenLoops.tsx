import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { clickableProps } from '@/lib/clickable';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertCircle, FileText, BarChart3, Calendar, ArrowRight,
  Target, Clock, CheckCircle2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';
import { differenceInDays, subHours } from 'date-fns';
import { cn } from '@/lib/utils';


interface MentorOpenLoopsProps {
  workspaces: WorkspaceWithDetails[];
}

interface OpenLoop {
  workspaceId: string;
  startupName: string;
  type: 'session_notes' | 'overdue_actions' | 'stale_kpi' | 'upcoming_session';
  label: string;
  urgency: 'high' | 'medium' | 'low';
  actionPath: string;
  icon: React.ElementType;
}

export function MentorOpenLoops({ workspaces }: MentorOpenLoopsProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const loops = useMemo((): OpenLoop[] => {
    if (!workspaces?.length) return [];
    const now = new Date();
    const result: OpenLoop[] = [];

    workspaces.forEach(w => {
      const name = w.startup?.name || 'Startup';

      // Recent sessions that may need notes (within 48h)
      if (w.lastSession?.scheduled_at) {
        const sessionDate = new Date(w.lastSession.scheduled_at);
        const hoursSince = (now.getTime() - sessionDate.getTime()) / (1000 * 60 * 60);
        if (hoursSince >= 0 && hoursSince <= 72) {
          result.push({
            workspaceId: w.id,
            startupName: name,
            type: 'session_notes',
            label: t('mentor.openLoops.sessionNotes', { defaultValue: 'Sessão recente pode precisar de notas' }),
            urgency: hoursSince <= 24 ? 'high' : 'medium',
            actionPath: `/workspace/${w.id}?tab=agenda`,
            icon: FileText,
          });
        }
      }

      // Overdue actions
      if (w.overdueActionsCount > 0) {
        result.push({
          workspaceId: w.id,
          startupName: name,
          type: 'overdue_actions',
          label: t('mentor.openLoops.overdueActions', { defaultValue: '{{count}} ações atrasadas', count: w.overdueActionsCount }),
          urgency: 'high',
          actionPath: `/workspace/${w.id}?tab=milestones-actions&sub=actions`,
          icon: Target,
        });
      }

      // Missing KPIs
      if (!w.hasCurrentMonthKpi) {
        result.push({
          workspaceId: w.id,
          startupName: name,
          type: 'stale_kpi',
          label: t('mentor.openLoops.staleKpi', { defaultValue: 'KPIs deste mês por atualizar' }),
          urgency: 'medium',
          actionPath: `/workspace/${w.id}?tab=kpis`,
          icon: BarChart3,
        });
      }

      // Upcoming session needing prep (within 3 days)
      if (w.nextMeetingDate) {
        const daysUntil = differenceInDays(new Date(w.nextMeetingDate), now);
        if (daysUntil >= 0 && daysUntil <= 3) {
          result.push({
            workspaceId: w.id,
            startupName: name,
            type: 'upcoming_session',
            label: t('mentor.openLoops.upcomingSession', { defaultValue: 'Sessão em {{days}} dias — preparar', days: daysUntil }),
            urgency: daysUntil === 0 ? 'high' : 'low',
            actionPath: `/workspace/${w.id}?tab=agenda`,
            icon: Calendar,
          });
        }
      }
    });

    // Sort by urgency
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    return result.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]).slice(0, 8);
  }, [workspaces, t]);

  if (loops.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        tone="success"
        title={t('mentor.openLoops.allClearTitle', { defaultValue: 'Tudo em dia' })}
        description={t('mentor.openLoops.allClearDesc', { defaultValue: 'Não há pendências com as suas startups. Bom trabalho!' })}
      />
    );
  }


  return (
    <Card className="border-warning/30 dark:border-warning/30 rounded-2xl">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4 text-warning" />
          {t('mentor.openLoops.title', { defaultValue: 'Precisa da Sua Atenção' })}
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {loops.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-1.5">
          {loops.map((loop, idx) => {
            const Icon = loop.icon;
            return (
              <div
                key={`${loop.workspaceId}-${loop.type}-${idx}`}
                className={cn(
                  'flex items-center gap-3 p-2.5 rounded-xl text-sm cursor-pointer transition-colors hover:bg-muted/60',
                  loop.urgency === 'high' && 'bg-destructive/5 dark:bg-destructive/5'
                )}
                {...clickableProps(() => navigate(loop.actionPath))}
              >
                <div className={cn(
                  'h-7 w-7 rounded-lg flex items-center justify-center shrink-0',
                  loop.urgency === 'high' ? 'bg-destructive/10 dark:bg-destructive/30' :
                  loop.urgency === 'medium' ? 'bg-warning/10 dark:bg-warning/30' :
                  'bg-muted'
                )}>
                  <Icon className={cn(
                    'h-3.5 w-3.5',
                    loop.urgency === 'high' ? 'text-destructive' :
                    loop.urgency === 'medium' ? 'text-warning' :
                    'text-muted-foreground'
                  )} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{loop.startupName}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{loop.label}</p>
                </div>
                <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
