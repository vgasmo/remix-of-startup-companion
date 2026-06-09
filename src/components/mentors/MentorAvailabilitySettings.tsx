import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useMyAvailability, useSetAvailability } from '@/hooks/useMentorAvailability';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { notify } from "@/lib/notify";
import { Clock, Plus, Trash2, Save, Loader2, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

const TIME_SLOTS = Array.from({ length: 24 }, (_, i) => {
  const hour = i.toString().padStart(2, '0');
  return [
    { value: `${hour}:00`, label: `${hour}:00` },
    { value: `${hour}:30`, label: `${hour}:30` },
  ];
}).flat();

interface AvailabilitySlot {
  id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_active: boolean;
}

export function MentorAvailabilitySettings() {
  const { t } = useTranslation();
  const { data: savedAvailability, isLoading } = useMyAvailability();
  const setAvailability = useSetAvailability();
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  const DAYS_OF_WEEK = useMemo(() => [
    { value: 0, label: t('days.sunday', 'Domingo'), short: t('days.sunShort', 'Dom') },
    { value: 1, label: t('days.monday', 'Segunda'), short: t('days.monShort', 'Seg') },
    { value: 2, label: t('days.tuesday', 'Terça'), short: t('days.tueShort', 'Ter') },
    { value: 3, label: t('days.wednesday', 'Quarta'), short: t('days.wedShort', 'Qua') },
    { value: 4, label: t('days.thursday', 'Quinta'), short: t('days.thuShort', 'Qui') },
    { value: 5, label: t('days.friday', 'Sexta'), short: t('days.friShort', 'Sex') },
    { value: 6, label: t('days.saturday', 'Sábado'), short: t('days.satShort', 'Sáb') },
  ], [t]);

  useEffect(() => {
    if (savedAvailability) {
      setSlots(savedAvailability.map(s => ({
        id: s.id,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        is_active: s.is_active,
      })));
      setHasChanges(false);
    }
  }, [savedAvailability]);

  // Group slots by day for the calendar view
  const slotsByDay = useMemo(() => {
    const grouped: Record<number, AvailabilitySlot[]> = {};
    for (let i = 0; i < 7; i++) grouped[i] = [];
    slots.forEach(slot => {
      grouped[slot.day_of_week]?.push(slot);
    });
    // Sort each day's slots by start_time
    Object.values(grouped).forEach(daySlots => {
      daySlots.sort((a, b) => a.start_time.localeCompare(b.start_time));
    });
    return grouped;
  }, [slots]);

  const addSlotForDay = (day: number) => {
    const newSlot: AvailabilitySlot = {
      id: `temp-${Date.now()}`,
      day_of_week: day,
      start_time: '09:00',
      end_time: '17:00',
      is_active: true,
    };
    setSlots([...slots, newSlot]);
    setHasChanges(true);
  };

  const removeSlot = (id: string) => {
    setSlots(slots.filter(s => s.id !== id));
    setHasChanges(true);
  };

  const updateSlot = (id: string, field: keyof AvailabilitySlot, value: any) => {
    setSlots(slots.map(s =>
      s.id === id ? { ...s, [field]: value } : s
    ));
    setHasChanges(true);
  };

  const handleSave = async () => {
    for (const slot of slots) {
      if (slot.start_time >= slot.end_time) {
        notify.error(t('mentor.startBeforeEnd', 'A hora de início deve ser anterior ao fim'));
        return;
      }
    }

    try {
      await setAvailability.mutateAsync(
        slots.map(s => ({
          mentor_id: '',
          day_of_week: s.day_of_week,
          start_time: s.start_time,
          end_time: s.end_time,
          is_active: s.is_active,
        }))
      );
      notify.success(t('mentor.availabilitySaved', 'Disponibilidade guardada'));
      setHasChanges(false);
    } catch (error: any) {
      notify.error(error.message || t('mentor.saveFailed', 'Falha ao guardar disponibilidade'));
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Only show weekdays (1-5) by default, show weekend if there are slots
  const hasWeekendSlots = slotsByDay[0].length > 0 || slotsByDay[6].length > 0;
  const daysToShow = hasWeekendSlots ? [1, 2, 3, 4, 5, 6, 0] : [1, 2, 3, 4, 5];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          {t('mentor.availabilitySettings', 'Definições de Disponibilidade')}
        </CardTitle>
        <CardDescription>
          {t('mentor.availabilityDescription', 'Configure a sua disponibilidade semanal para sessões de mentoria. Os founders poderão agendar sessões durante estes horários.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Weekly calendar grid */}
        <div className="space-y-1">
          {daysToShow.map(dayValue => {
            const day = DAYS_OF_WEEK[dayValue];
            const daySlots = slotsByDay[dayValue];
            const hasSlots = daySlots.length > 0;
            const isActive = daySlots.some(s => s.is_active);

            return (
              <div
                key={dayValue}
                className={cn(
                  'rounded-xl border transition-colors',
                  hasSlots && isActive
                    ? 'border-primary/20 bg-primary/5'
                    : 'border-border/60 bg-card',
                )}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Day label */}
                  <div className="w-24 shrink-0">
                    <span className={cn(
                      'text-sm font-semibold',
                      hasSlots && isActive ? 'text-primary' : 'text-muted-foreground',
                    )}>
                      {day.label}
                    </span>
                  </div>

                  {/* Slots for this day */}
                  <div className="flex-1 flex flex-wrap items-center gap-2">
                    {daySlots.length === 0 ? (
                      <span className="text-xs text-muted-foreground/50 italic">
                        {t('mentor.noSlots', 'Sem disponibilidade')}
                      </span>
                    ) : (
                      daySlots.map(slot => (
                        <div
                          key={slot.id}
                          className={cn(
                            'flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-all',
                            slot.is_active
                              ? 'border-primary/30 bg-primary/10 text-foreground'
                              : 'border-border bg-muted/50 text-muted-foreground opacity-60',
                          )}
                        >
                          <Switch
                            checked={slot.is_active}
                            onCheckedChange={(checked) => updateSlot(slot.id, 'is_active', checked)}
                            className="scale-75"
                          />
                          <div className="flex items-center gap-1.5">
                            <Select
                              value={slot.start_time}
                              onValueChange={(v) => updateSlot(slot.id, 'start_time', v)}
                            >
                              <SelectTrigger className="h-7 w-[72px] border-0 bg-transparent p-0 text-sm font-medium shadow-none focus:ring-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TIME_SLOTS.map(time => (
                                  <SelectItem key={time.value} value={time.value}>{time.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <span className="text-xs text-muted-foreground">–</span>
                            <Select
                              value={slot.end_time}
                              onValueChange={(v) => updateSlot(slot.id, 'end_time', v)}
                            >
                              <SelectTrigger className="h-7 w-[72px] border-0 bg-transparent p-0 text-sm font-medium shadow-none focus:ring-0">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {TIME_SLOTS.map(time => (
                                  <SelectItem key={time.value} value={time.value}>{time.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-muted-foreground hover:text-destructive"
                            onClick={() => removeSlot(slot.id)}
                           aria-label={t('common.delete')}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>

                  {/* Add slot for this day */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-primary shrink-0"
                    onClick={() => addSlotForDay(dayValue)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {t('common.add', 'Adicionar')}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Show weekend toggle */}
        {!hasWeekendSlots && (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-muted-foreground"
              onClick={() => {
                addSlotForDay(6); // Add Saturday slot to show weekends
              }}
            >
              <Plus className="h-3 w-3 mr-1" />
              {t('mentor.addWeekend', 'Adicionar fim de semana')}
            </Button>
          </div>
        )}

        {/* Save */}
        {hasChanges && (
          <div className="flex justify-end pt-4 border-t">
            <Button onClick={handleSave} disabled={setAvailability.isPending}>
              {setAvailability.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('common.saving', 'A guardar...')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {t('common.saveChanges', 'Guardar Alterações')}
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
