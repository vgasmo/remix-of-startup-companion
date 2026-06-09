import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Flag, CalendarDays, Check, Lock, ChevronRight, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';

interface AccelerationProgressCardProps {
  programId: string;
  currentWeek: number | null;
  workspaceId?: string;
}

interface ProgramGate {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  target_start_week: number | null;
  target_end_week: number | null;
}

interface ProgramWeek {
  id: string;
  week_number: number;
  title: string;
  description: string | null;
  gate_id: string | null;
  deliverables_json: unknown;
}

function useAccelerationStructure(programId: string) {
  const gatesQuery = useQuery({
    queryKey: ['program-gates', programId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('program_gates')
        .select('id, name, description, sort_order, target_start_week, target_end_week')
        .eq('program_id', programId)
        .order('sort_order');
      if (error) throw error;
      return (data || []) as ProgramGate[];
    },
    staleTime: 300_000,
    enabled: !!programId,
  });

  const weeksQuery = useQuery({
    queryKey: ['program-weeks', programId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('program_weeks')
        .select('id, week_number, title, description, gate_id, deliverables_json')
        .eq('program_id', programId)
        .order('week_number');
      if (error) throw error;
      return (data || []) as ProgramWeek[];
    },
    staleTime: 300_000,
    enabled: !!programId,
  });

  return { gates: gatesQuery.data || [], weeks: weeksQuery.data || [], isLoading: gatesQuery.isLoading || weeksQuery.isLoading };
}

const GATE_COLORS = [
  'from-primary to-primary',
  'from-[hsl(var(--info))] to-[hsl(var(--info))]',
  'from-[hsl(var(--success))] to-[hsl(var(--success))]',
  'from-[hsl(var(--warning))] to-[hsl(var(--warning))]',
  'from-destructive to-primary',
];

export const AccelerationProgressCard = memo(function AccelerationProgressCard({
  programId,
  currentWeek,
  workspaceId,
}: AccelerationProgressCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { gates, weeks, isLoading } = useAccelerationStructure(programId);

  const week = currentWeek ?? 1;
  const totalWeeks = weeks.length > 0 ? Math.max(...weeks.map(w => w.week_number)) : 12;
  const progressPercent = Math.min(((week) / totalWeeks) * 100, 100);

  // Next upcoming gate (first gate whose start week is in the future)
  const nextGate = useMemo(() => {
    return gates.find(g => (g.target_start_week ?? 1) > week)
      ?? gates.find(g => week >= (g.target_start_week ?? 1) && week <= (g.target_end_week ?? totalWeeks));
  }, [gates, week, totalWeeks]);
  const weeksToNextGate = nextGate
    ? Math.max((nextGate.target_start_week ?? week) - week, 0)
    : null;

  // Map gates to their weeks and determine status
  const gateStatus = useMemo(() => {
    return gates.map((gate, idx) => {
      const startWeek = gate.target_start_week ?? 1;
      const endWeek = gate.target_end_week ?? totalWeeks;
      const isCompleted = week > endWeek;
      const isCurrent = week >= startWeek && week <= endWeek;
      const isLocked = week < startWeek;
      const gateWeeks = weeks.filter(w => w.gate_id === gate.id);
      return { ...gate, startWeek, endWeek, isCompleted, isCurrent, isLocked, gateWeeks, colorIdx: idx };
    });
  }, [gates, weeks, week, totalWeeks]);

  if (isLoading || gates.length === 0) return null;

  return (
    <Card className="rounded-2xl overflow-hidden border-border/50 bg-gradient-to-r from-muted/20 via-background to-muted/20">
      <CardContent className="p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Flag className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">
              {t('founder.accelerationProgress', { defaultValue: 'Progresso da Aceleração' })}
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs gap-1">
              <CalendarDays className="h-3 w-3" />
              {t('workspace.currentWeek', { week, defaultValue: 'Semana {{week}}' })}
            </Badge>
            {nextGate && weeksToNextGate !== null && weeksToNextGate > 0 && (
              <Badge variant="outline" className="text-xs gap-1 border-primary/30 text-primary">
                <Flag className="h-3 w-3" />
                {t('founder.nextGateIn', {
                  name: nextGate.name,
                  count: weeksToNextGate,
                  defaultValue: 'Próximo gate ({{name}}) em {{count}} sem.'
                })}
              </Badge>
            )}
          </div>
        </div>

        {/* Overall progress */}
        <div className="mb-5">
          <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
            <span>{t('founder.weekProgress', { current: week, total: totalWeeks, defaultValue: 'Semana {{current}} de {{total}}' })}</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <Progress value={progressPercent} className="h-2" />
        </div>

        {/* Gates track */}
        <div className="space-y-3">
          {gateStatus.map((gate, idx) => {
            const color = GATE_COLORS[idx % GATE_COLORS.length];
            return (
              <motion.div
                key={gate.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1, duration: 0.3 }}
                onClick={() => {
                  if (workspaceId) {
                    navigate(`/workspace/${workspaceId}?tab=milestones-actions`);
                  }
                }}
                className={cn(
                  'relative rounded-xl border p-3 transition-all cursor-pointer hover:shadow-md',
                  gate.isCurrent && 'border-primary/30 bg-primary/5 shadow-sm',
                  gate.isCompleted && 'border-border/30 bg-muted/30',
                  gate.isLocked && 'border-border/20 bg-muted/10 opacity-60',
                )}
              >
                <div className="flex items-center gap-3">
                  {/* Gate status icon */}
                  <div className={cn(
                    'h-8 w-8 rounded-full flex items-center justify-center shrink-0',
                    gate.isCompleted && `bg-gradient-to-br ${color} shadow-sm`,
                    gate.isCurrent && `bg-gradient-to-br ${color} shadow-md ring-2 ring-primary/20`,
                    gate.isLocked && 'bg-muted border border-border/50',
                  )}>
                    {gate.isCompleted ? (
                      <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                    ) : gate.isLocked ? (
                      <Lock className="h-3 w-3 text-muted-foreground/50" />
                    ) : (
                      <Zap className="h-3.5 w-3.5 text-white" />
                    )}
                  </div>

                  {/* Gate info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        'text-sm font-medium truncate',
                        gate.isCurrent && 'text-foreground',
                        gate.isCompleted && 'text-foreground/80',
                        gate.isLocked && 'text-muted-foreground/60',
                      )}>
                        {gate.name}
                      </span>
                      {gate.isCurrent && (
                        <Badge variant="default" className="text-[10px] h-4 px-1.5">
                          {t('founder.currentGate', { defaultValue: 'Atual' })}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-muted-foreground">
                        {t('founder.gateWeeks', {
                          start: gate.startWeek,
                          end: gate.endWeek,
                          defaultValue: 'Semanas {{start}}–{{end}}'
                        })}
                      </span>
                      {gate.description && (
                        <>
                          <span className="text-muted-foreground/30">·</span>
                          <span className="text-[11px] text-muted-foreground/70 truncate">{gate.description}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Gate progress indicator */}
                  {gate.isCurrent && (
                    <div className="text-xs font-medium text-primary shrink-0">
                      {Math.round(((week - gate.startWeek) / Math.max(gate.endWeek - gate.startWeek, 1)) * 100)}%
                    </div>
                  )}
                  {gate.isCompleted && (
                    <Check className="h-4 w-4 text-success shrink-0" />
                  )}
                </div>

                {/* Week pills for current gate */}
                {gate.isCurrent && gate.gateWeeks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5 ml-11">
                    {gate.gateWeeks.map(gw => {
                      const weekDone = week > gw.week_number;
                      const weekCurrent = week === gw.week_number;
                      return (
                        <motion.button
                          key={gw.id}
                          animate={weekCurrent ? { scale: [1, 1.08, 1] } : undefined}
                          transition={weekCurrent ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : undefined}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (workspaceId) {
                              navigate(`/workspace/${workspaceId}?tab=milestones-actions-actions`);
                            }
                          }}
                          className={cn(
                            'text-[10px] px-2 py-0.5 rounded-full border transition-all cursor-pointer hover:ring-1 hover:ring-primary/30',
                            weekDone && 'bg-primary/15 border-primary/20 text-primary',
                            weekCurrent && 'bg-primary text-primary-foreground border-primary font-semibold shadow-sm',
                            !weekDone && !weekCurrent && 'bg-muted/50 border-border/40 text-muted-foreground/60',
                          )}
                          title={gw.title}
                        >
                          S{gw.week_number}
                          {weekCurrent && <ChevronRight className="inline h-2.5 w-2.5 ml-0.5" />}
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
});
