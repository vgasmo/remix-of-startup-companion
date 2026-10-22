import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format, addDays } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Plus, Trash2, CalendarOff } from 'lucide-react';
import { notify } from '@/lib/notify';
import { useMyTimeOff, useAddTimeOff, useDeleteTimeOff, useMyRecurringBlocks, useAddRecurringBlocks, useDeleteRecurringBlock } from '@/hooks/useConsultantTimeOff';
import { cn } from '@/lib/utils';

// Segunda primeiro; valores = dia da semana (0 = domingo)
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const PERIODS = {
  day: { start: null, end: null },
  morning: { start: '09:00', end: '13:00' },
  afternoon: { start: '13:00', end: '19:00' },
} as const;
type PeriodKey = keyof typeof PERIODS | 'custom';

/** Builds an ISO instant from a Lisbon wall-clock date + time. */
function toIso(date: string, time: string) {
  // Local browser timezone matches Europe/Lisbon for staff usage; Date handles DST.
  return new Date(`${date}T${time}:00`).toISOString();
}

export function ConsultantTimeOffSettings() {
  const { t } = useTranslation();
  const { data: periods, isLoading } = useMyTimeOff();
  const addTimeOff = useAddTimeOff();
  const deleteTimeOff = useDeleteTimeOff();

  const today = format(new Date(), 'yyyy-MM-dd');
  const [allDay, setAllDay] = useState(true);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('18:00');
  const [reason, setReason] = useState('');
  const [mode, setMode] = useState<'weekly' | 'dates'>('weekly');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [period, setPeriod] = useState<PeriodKey>('day');
  const { data: recurring } = useMyRecurringBlocks();
  const addRecurring = useAddRecurringBlocks();
  const deleteRecurring = useDeleteRecurringBlock();

  const weekdayName = (d: number) => t(`timeOff.weekday.${d}`, ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][d]);
  const periodLabel = (k: PeriodKey) => ({
    day: t('timeOff.period.day', 'Dia inteiro'),
    morning: t('timeOff.period.morning', 'Manhã (09–13h)'),
    afternoon: t('timeOff.period.afternoon', 'Tarde (13–19h)'),
    custom: t('timeOff.period.custom', 'Outras horas'),
  })[k];

  const handleAddRecurring = async () => {
    if (!weekdays.length) {
      notify.error(t('timeOff.pickWeekday', 'Escolha pelo menos um dia da semana'));
      return;
    }
    const range = period === 'custom' ? { start: startTime, end: endTime } : PERIODS[period];
    if (range.start && range.end && range.end <= range.start) {
      notify.error(t('timeOff.invalidRange', 'O fim tem de ser depois do início'));
      return;
    }
    try {
      await addRecurring.mutateAsync({ weekdays, start_time: range.start, end_time: range.end, reason });
      notify.success(t('timeOff.added', 'Período bloqueado'));
      setWeekdays([]);
      setReason('');
    } catch (error: unknown) {
      notify.error(error instanceof Error ? error.message : t('timeOff.addFailed', 'Não foi possível bloquear o período'));
    }
  };

  const handleAdd = async () => {
    const startsAt = allDay ? toIso(startDate, '00:00') : toIso(startDate, startTime);
    const endsAt = allDay
      ? addDays(new Date(`${endDate}T00:00:00`), 1).toISOString() // meia-noite local seguinte (respeita a mudança de hora)
      : toIso(startDate, endTime);

    if (new Date(endsAt) <= new Date(startsAt)) {
      notify.error(t('timeOff.invalidRange', 'O fim tem de ser depois do início'));
      return;
    }

    try {
      await addTimeOff.mutateAsync({ starts_at: startsAt, ends_at: endsAt, all_day: allDay, reason });
      notify.success(t('timeOff.added', 'Período bloqueado'));
      setReason('');
    } catch (error: unknown) {
      notify.error(error instanceof Error ? error.message : t('timeOff.addFailed', 'Não foi possível bloquear o período'));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTimeOff.mutateAsync(id);
      notify.success(t('timeOff.removed', 'Bloqueio removido'));
    } catch (error: unknown) {
      notify.error(error instanceof Error ? error.message : t('timeOff.removeFailed', 'Não foi possível remover'));
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarOff className="h-5 w-5" />
          {t('timeOff.title', 'Dias e horas sem reuniões')}
        </CardTitle>
        <CardDescription>
          {t('timeOff.description', 'Marque férias, dias ou intervalos de horas em que não quer receber reuniões. Estes períodos deixam de aparecer nas marcações e são recusados no servidor.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="inline-flex rounded-lg border p-1 gap-1">
          {(['weekly', 'dates'] as const).map((m) => (
            <Button key={m} size="sm" variant={mode === m ? 'default' : 'ghost'} onClick={() => setMode(m)}>
              {m === 'weekly' ? t('timeOff.modeWeekly', 'Todas as semanas') : t('timeOff.modeDates', 'Datas específicas')}
            </Button>
          ))}
        </div>

        {mode === 'weekly' && (
          <div className="rounded-xl border p-4 space-y-4">
            <div className="space-y-1.5">
              <Label>{t('timeOff.weekdays', 'Dias da semana')}</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => {
                  const on = weekdays.includes(d);
                  return (
                    <Button key={d} type="button" size="sm" variant={on ? 'default' : 'outline'} aria-pressed={on}
                      onClick={() => setWeekdays((w) => (on ? w.filter((x) => x !== d) : [...w, d]))}>
                      {weekdayName(d)}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('timeOff.periodLabel', 'Período')}</Label>
              <div className="flex flex-wrap gap-2">
                {(['day', 'morning', 'afternoon', 'custom'] as PeriodKey[]).map((k) => (
                  <Button key={k} type="button" size="sm" variant={period === k ? 'default' : 'outline'} aria-pressed={period === k} onClick={() => setPeriod(k)}>
                    {periodLabel(k)}
                  </Button>
                ))}
              </div>
            </div>
            {period === 'custom' && (
              <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
                <div className="space-y-1.5">
                  <Label htmlFor="rec-start-time">{t('timeOff.startTime', 'Das')}</Label>
                  <Input id="rec-start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-end-time">{t('timeOff.endTime', 'Às')}</Label>
                  <Input id="rec-end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="rec-reason">{t('timeOff.reason', 'Motivo (opcional, apenas visível para a equipa)')}</Label>
              <Input id="rec-reason" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder={t('timeOff.reasonPlaceholder', 'Férias, formação, trabalho interno…')} />
            </div>
            <Button onClick={handleAddRecurring} disabled={addRecurring.isPending}>
              {addRecurring.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              {t('timeOff.addWeekly', 'Bloquear todas as semanas')}
            </Button>
          </div>
        )}

        {mode === 'dates' && (
        <div className="rounded-xl border p-4 space-y-4">
          <div className="flex items-center gap-3">
            <Switch id="time-off-all-day" checked={allDay} onCheckedChange={setAllDay} />
            <Label htmlFor="time-off-all-day">{t('timeOff.allDay', 'Dia(s) inteiro(s)')}</Label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="time-off-start-date">
                {allDay ? t('timeOff.from', 'De') : t('timeOff.day', 'Dia')}
              </Label>
              <Input
                id="time-off-start-date"
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (e.target.value > endDate) setEndDate(e.target.value);
                }}
              />
            </div>
            {allDay ? (
              <div className="space-y-1.5">
                <Label htmlFor="time-off-end-date">{t('timeOff.to', 'Até')}</Label>
                <Input
                  id="time-off-end-date"
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="time-off-start-time">{t('timeOff.startTime', 'Das')}</Label>
                  <Input id="time-off-start-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="time-off-end-time">{t('timeOff.endTime', 'Às')}</Label>
                  <Input id="time-off-end-time" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="time-off-reason">{t('timeOff.reason', 'Motivo (opcional, apenas visível para a equipa)')}</Label>
            <Input
              id="time-off-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('timeOff.reasonPlaceholder', 'Férias, formação, trabalho interno…')}
            />
          </div>

          <Button onClick={handleAdd} disabled={addTimeOff.isPending}>
            {addTimeOff.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {t('timeOff.add', 'Bloquear período')}
          </Button>
        </div>
        )}

        {!!recurring?.length && (
          <div className="space-y-2">
            <p className="text-sm font-medium">{t('timeOff.weeklyList', 'Todas as semanas')}</p>
            {recurring.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {t(`timeOff.every.${r.weekday}`)} · {' '}
                    {r.start_time ? `${r.start_time.slice(0, 5)} – ${r.end_time?.slice(0, 5)}` : t('timeOff.period.day', 'Dia inteiro')}
                  </p>
                  {r.reason && <p className="truncate text-xs text-muted-foreground">{r.reason}</p>}
                </div>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive"
                  onClick={() => deleteRecurring.mutate(r.id, { onSuccess: () => notify.success(t('timeOff.removed', 'Bloqueio removido')) })}
                  aria-label={t('common.delete')}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <div className={cn('space-y-2')}>
          {!!periods?.length && <p className="text-sm font-medium">{t('timeOff.datesList', 'Datas específicas')}</p>}
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !periods?.length && !recurring?.length ? (
            <p className="text-sm text-muted-foreground italic">
              {t('timeOff.empty', 'Sem períodos bloqueados.')}
            </p>
          ) : (
            (periods ?? []).map((p) => {
              const start = new Date(p.starts_at);
              const end = new Date(p.ends_at);
              const label = p.all_day
                ? `${format(start, 'dd/MM/yyyy')} – ${format(new Date(end.getTime() - 1), 'dd/MM/yyyy')}`
                : `${format(start, 'dd/MM/yyyy HH:mm')} – ${format(end, 'HH:mm')}`;
              return (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    {p.reason && <p className="truncate text-xs text-muted-foreground">{p.reason}</p>}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDelete(p.id)}
                    aria-label={t('common.delete')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
