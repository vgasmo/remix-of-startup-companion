import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO, isPast, isToday, isFuture, addDays } from 'date-fns';
import { getDateLocale } from '@/lib/dateLocale';
import {
  Calendar, Video, ExternalLink, Clock, CheckCircle2, Circle,
  Pencil, X, Save, Link2, Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";

interface AccelerationCalendarSectionProps {
  programId: string;
  isStaff: boolean;
  currentWeek?: number | null;
}

interface ProgramWeekWithSchedule {
  id: string;
  week_number: number;
  title: string;
  description: string | null;
  gate_id: string | null;
  scheduled_at: string | null;
  meeting_url: string | null;
}

interface ProgramGate {
  id: string;
  name: string;
  sort_order: number;
  target_start_week: number | null;
  target_end_week: number | null;
}

function useAccelerationCalendar(programId: string) {
  return useQuery({
    queryKey: ['acceleration-calendar', programId],
    queryFn: async () => {
      const [weeksRes, gatesRes] = await Promise.all([
        supabase
          .from('program_weeks')
          .select('id, week_number, title, description, gate_id, scheduled_at, meeting_url')
          .eq('program_id', programId)
          .order('week_number'),
        supabase
          .from('program_gates')
          .select('id, name, sort_order, target_start_week, target_end_week')
          .eq('program_id', programId)
          .order('sort_order'),
      ]);
      if (weeksRes.error) throw weeksRes.error;
      if (gatesRes.error) throw gatesRes.error;
      return {
        weeks: (weeksRes.data || []) as ProgramWeekWithSchedule[],
        gates: (gatesRes.data || []) as ProgramGate[],
      };
    },
    staleTime: 60_000,
    enabled: !!programId,
  });
}

function useUpdateProgramWeek(programId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { weekId: string; scheduled_at?: string | null; meeting_url?: string | null }) => {
      const updates: Record<string, unknown> = {};
      if (params.scheduled_at !== undefined) updates.scheduled_at = params.scheduled_at;
      if (params.meeting_url !== undefined) updates.meeting_url = params.meeting_url;
      const { error } = await supabase
        .from('program_weeks')
        .update(updates)
        .eq('id', params.weekId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acceleration-calendar', programId] });
      queryClient.invalidateQueries({ queryKey: ['program-weeks', programId] });
    },
  });
}

export function AccelerationCalendarSection({ programId, isStaff, currentWeek }: AccelerationCalendarSectionProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useAccelerationCalendar(programId);
  const updateWeek = useUpdateProgramWeek(programId);
  const [editingWeekId, setEditingWeekId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState<Date | undefined>();
  const [editTime, setEditTime] = useState('10:00');
  const [editUrl, setEditUrl] = useState('');

  const weeksByGate = useMemo(() => {
    if (!data) return [];
    return data.gates.map(gate => ({
      gate,
      weeks: data.weeks.filter(w => w.gate_id === gate.id),
    }));
  }, [data]);

  const startEditing = (week: ProgramWeekWithSchedule) => {
    setEditingWeekId(week.id);
    if (week.scheduled_at) {
      const d = parseISO(week.scheduled_at);
      setEditDate(d);
      setEditTime(format(d, 'HH:mm'));
    } else {
      setEditDate(undefined);
      setEditTime('10:00');
    }
    setEditUrl(week.meeting_url || '');
  };

  const handleSave = async (weekId: string) => {
    try {
      let scheduled_at: string | null = null;
      if (editDate) {
        const [h, m] = editTime.split(':').map(Number);
        const d = new Date(editDate);
        d.setHours(h || 0, m || 0, 0, 0);
        scheduled_at = d.toISOString();
      }
      await updateWeek.mutateAsync({
        weekId,
        scheduled_at,
        meeting_url: editUrl.trim() || null,
      });
      notify.success(t('accelerationCalendar.saved', { defaultValue: 'Sessão atualizada' }));
      setEditingWeekId(null);
    } catch {
      notify.error(t('accelerationCalendar.saveFailed', { defaultValue: 'Erro ao guardar' }));
    }
  };

  if (isLoading || !data || data.weeks.length === 0) return null;

  const week = currentWeek ?? 1;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-4 w-4 text-primary" />
          {t('accelerationCalendar.title', { defaultValue: 'Calendário do Programa' })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {weeksByGate.map(({ gate, weeks }) => (
          <div key={gate.id} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {gate.name}
              </span>
              <span className="text-[10px] text-muted-foreground">
                ({t('accelerationCalendar.weekRange', { 
                  start: gate.target_start_week ?? '?', 
                  end: gate.target_end_week ?? '?', 
                  defaultValue: 'Semanas {{start}}–{{end}}' 
                })})
              </span>
            </div>
            <div className="space-y-1">
              {weeks.map(pw => {
                const isEditing = editingWeekId === pw.id;
                const isPastWeek = pw.week_number < week;
                const isCurrentWeek = pw.week_number === week;
                const isFutureWeek = pw.week_number > week;
                const hasSchedule = !!pw.scheduled_at;
                const hasUrl = !!pw.meeting_url;
                const scheduledDate = pw.scheduled_at ? parseISO(pw.scheduled_at) : null;
                const sessionPast = scheduledDate ? isPast(scheduledDate) && !isToday(scheduledDate) : isPastWeek;

                return (
                  <div
                    key={pw.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all border',
                      isCurrentWeek && 'bg-primary/5 border-primary/20',
                      isPastWeek && !isCurrentWeek && 'bg-muted/30 border-border/30',
                      isFutureWeek && 'border-border/40 bg-background',
                    )}
                  >
                    {/* Status icon */}
                    <div className="shrink-0">
                      {sessionPast ? (
                        <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />
                      ) : isCurrentWeek ? (
                        <Clock className="h-4 w-4 text-primary animate-pulse" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground/40" />
                      )}
                    </div>

                    {/* Week info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={isCurrentWeek ? 'default' : 'secondary'} className="text-[10px] h-4 px-1.5 shrink-0">
                          S{pw.week_number}
                        </Badge>
                        <span className={cn(
                          'text-sm truncate',
                          sessionPast && 'text-muted-foreground',
                          isCurrentWeek && 'font-medium',
                        )}>
                          {pw.title}
                        </span>
                      </div>
                      {hasSchedule && !isEditing && (
                        <div className="flex items-center gap-2 mt-0.5 ml-7">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {format(scheduledDate!, 'dd MMM yyyy, HH:mm', { locale: getDateLocale() })}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Meeting link or edit controls */}
                    {isEditing ? (
                      <div className="flex items-center gap-2 shrink-0">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 text-xs">
                              <Calendar className="h-3 w-3 mr-1" />
                              {editDate ? format(editDate, 'dd/MM') : t('accelerationCalendar.pickDate', { defaultValue: 'Data' })}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="end">
                            <CalendarPicker
                              mode="single"
                              selected={editDate}
                              onSelect={setEditDate}
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                        <Input
                          type="time"
                          value={editTime}
                          onChange={e => setEditTime(e.target.value)}
                          className="h-7 w-[80px] text-xs"
                        />
                        <Input
                          type="url"
                          placeholder="URL da sessão"
                          value={editUrl}
                          onChange={e => setEditUrl(e.target.value)}
                          className="h-7 w-[180px] text-xs"
                        />
                        <Button size="sm" className="h-7 w-7 p-0" onClick={() => handleSave(pw.id)} disabled={updateWeek.isPending} loading={updateWeek.isPending}>
                          <Save className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingWeekId(null)}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        {hasUrl && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs gap-1 text-primary"
                            onClick={() => window.open(pw.meeting_url!, '_blank')}
                          >
                            <Video className="h-3.5 w-3.5" />
                            {t('accelerationCalendar.joinSession', { defaultValue: 'Entrar' })}
                          </Button>
                        )}
                        {isStaff && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            onClick={() => startEditing(pw)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
