import { useMemo } from 'react';
import { format } from 'date-fns';
import { getDateLocale } from '@/lib/dateLocale';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Rocket, Flag, CheckCircle2, ArrowRight, Sparkles, Calendar, Video, Clock, Circle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useStageHistory, useMilestoneHistory } from '@/hooks/useProgressHistory';
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

interface ProgressTimelineProps {
  workspaceId: string;
  className?: string;
  programId?: string;
  programType?: string;
  currentWeek?: number | null;
}

const stageColors: Record<string, string> = {
  ideation: 'bg-primary/10 text-primary border-primary/30 ',
  validation: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/30 ',
  mvp: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] border-[hsl(var(--info))]/30 ',
  growth: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] border-[hsl(var(--success))]/30 ',
  scale: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30 ',
};

function useAccelerationWeeks(programId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['acceleration-timeline-weeks', programId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('program_weeks')
        .select('id, week_number, title, scheduled_at, meeting_url, gate_id')
        .eq('program_id', programId!)
        .order('week_number');
      if (error) throw error;
      return data || [];
    },
    staleTime: 120_000,
    enabled: enabled && !!programId,
  });
}

export function ProgressTimeline({ workspaceId, className, programId, programType, currentWeek }: ProgressTimelineProps) {
  const { t, i18n } = useTranslation();
  const { data: stageHistory, isLoading: stageLoading } = useStageHistory(workspaceId);
  const { data: milestoneHistory, isLoading: milestoneLoading } = useMilestoneHistory(workspaceId);
  
  const isAcceleration = programType === 'acceleration';
  const { data: accelWeeks, isLoading: weeksLoading } = useAccelerationWeeks(programId, isAcceleration);

  const stageLabels: Record<string, string> = useMemo(() => ({
    ideation: t('stages.ideation', { defaultValue: 'Ideação' }),
    validation: t('stages.validation', { defaultValue: 'Validação' }),
    mvp: t('stages.mvp', { defaultValue: 'MVP' }),
    growth: t('stages.growth', { defaultValue: 'Crescimento' }),
    scale: t('stages.scale', { defaultValue: 'Escala' }),
  }), [t]);

  const dateLocale = i18n.language === 'pt' ? pt : undefined;

  const timelineEvents = useMemo(() => {
    const events: Array<{
      id: string;
      type: 'stage' | 'milestone';
      title: string;
      description?: string;
      date: Date;
      fromStage?: string;
      toStage?: string;
    }> = [];

    stageHistory?.forEach((sh) => {
      events.push({
        id: `stage-${sh.id}`,
        type: 'stage',
        title: t('progressTimeline.stageTransition', { defaultValue: 'Transição de fase' }),
        description: `${stageLabels[sh.from_stage || ''] || t('progressTimeline.start', { defaultValue: 'Início' })} → ${stageLabels[sh.to_stage] || sh.to_stage}`,
        date: new Date(sh.changed_at),
        fromStage: sh.from_stage || undefined,
        toStage: sh.to_stage,
      });
    });

    milestoneHistory?.forEach((m) => {
      if (m.completed_at) {
        events.push({
          id: `milestone-${m.id}`,
          type: 'milestone',
          title: m.title,
          description: m.description || undefined,
          date: new Date(m.completed_at),
        });
      }
    });

    return events.sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [stageHistory, milestoneHistory, stageLabels, t]);

  const isLoading = stageLoading || milestoneLoading || (isAcceleration && weeksLoading);
  const week = currentWeek ?? 1;

  if (isLoading) {
    return (
      <Card className={cn("", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('progressTimeline.title', { defaultValue: 'Linha do Tempo' })}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {t('progressTimeline.title', { defaultValue: 'Linha do Tempo' })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Acceleration program calendar */}
        {isAcceleration && accelWeeks && accelWeeks.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">
                {t('progressTimeline.programSchedule', { defaultValue: 'Calendário do Programa' })}
              </span>
              <Badge variant="secondary" className="text-xs">
                {t('workspace.currentWeek', { week, defaultValue: 'Semana {{week}}' })}
              </Badge>
            </div>
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
              <div className="space-y-1.5">
                {accelWeeks.map(pw => {
                  const isPastWeek = pw.week_number < week;
                  const isCurrentWeek = pw.week_number === week;
                  const hasSchedule = !!pw.scheduled_at;
                  const hasUrl = !!pw.meeting_url;

                  return (
                    <div key={pw.id} className="relative flex items-center gap-3 pl-10">
                      {/* Timeline dot */}
                      <div className={cn(
                        "absolute left-2 w-4 h-4 rounded-full border-2 bg-background flex items-center justify-center",
                        isPastWeek && "border-[hsl(var(--success))]/30",
                        isCurrentWeek && "border-primary ring-2 ring-primary/20",
                        !isPastWeek && !isCurrentWeek && "border-border",
                      )}>
                        {isPastWeek ? (
                          <CheckCircle2 className="h-2 w-2 text-[hsl(var(--success))]" />
                        ) : isCurrentWeek ? (
                          <Clock className="h-2 w-2 text-primary" />
                        ) : (
                          <Circle className="h-1.5 w-1.5 text-muted-foreground/30" />
                        )}
                      </div>

                      <div className={cn(
                        "flex-1 flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors",
                        isCurrentWeek && "bg-primary/5",
                      )}>
                        <Badge variant={isCurrentWeek ? 'default' : 'secondary'} className="text-[10px] h-4 px-1.5 shrink-0">
                          S{pw.week_number}
                        </Badge>
                        <span className={cn(
                          "text-sm flex-1 truncate",
                          isPastWeek && "text-muted-foreground",
                          isCurrentWeek && "font-medium",
                        )}>
                          {pw.title}
                        </span>
                        {hasSchedule && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {format(new Date(pw.scheduled_at!), 'dd MMM', { locale: dateLocale })}
                          </span>
                        )}
                        {hasUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 text-[10px] gap-1 text-primary px-1.5 shrink-0"
                            onClick={() => window.open(pw.meeting_url!, '_blank')}
                          >
                            <Video className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Historical events */}
        {timelineEvents.length === 0 && (!isAcceleration || !accelWeeks?.length) ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Rocket className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('progressTimeline.noEvents', { defaultValue: 'Sem eventos de progresso ainda' })}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t('progressTimeline.noEventsDescription', { defaultValue: 'Mudanças de fase e marcos concluídos aparecerão aqui' })}
            </p>
          </div>
        ) : timelineEvents.length > 0 && (
          <div className="relative">
            {isAcceleration && accelWeeks?.length ? (
              <div className="flex items-center gap-2 mb-3">
                <Flag className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">
                  {t('progressTimeline.historicalEvents', { defaultValue: 'Eventos' })}
                </span>
              </div>
            ) : null}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
            <div className="space-y-4">
              {timelineEvents.slice(0, 10).map((event) => (
                <div key={event.id} className="relative flex items-start gap-4 pl-10">
                  <div className={cn(
                    "absolute left-2 w-4 h-4 rounded-full border-2 bg-background flex items-center justify-center",
                    event.type === 'stage' ? "border-primary" : "border-[hsl(var(--success))]/30"
                  )}>
                    {event.type === 'stage' ? (
                      <Rocket className="h-2 w-2 text-primary" />
                    ) : (
                      <CheckCircle2 className="h-2 w-2 text-[hsl(var(--success))]" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pb-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      {event.type === 'stage' ? (
                        <>
                          <Badge variant="outline" className={cn("text-xs", stageColors[event.fromStage || ''] || 'bg-muted')}>
                            {stageLabels[event.fromStage || ''] || t('progressTimeline.start', { defaultValue: 'Início' })}
                          </Badge>
                          <ArrowRight className="h-3 w-3 text-muted-foreground" />
                          <Badge variant="outline" className={cn("text-xs", stageColors[event.toStage || ''])}>
                            {stageLabels[event.toStage || ''] || event.toStage}
                          </Badge>
                        </>
                      ) : (
                        <>
                          <Flag className="h-3 w-3 text-[hsl(var(--success))]" />
                          <span className="text-sm font-medium">{event.title}</span>
                        </>
                      )}
                    </div>
                    {event.type === 'milestone' && event.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{event.description}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {format(event.date, "d 'de' MMM yyyy • HH:mm", { locale: dateLocale })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
