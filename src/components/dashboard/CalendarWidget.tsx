import { useMemo, forwardRef } from 'react';
import { clickableProps } from '@/lib/clickable';
import { useTranslation } from 'react-i18next';
import { format, startOfWeek, endOfWeek, eachDayOfInterval, isSameDay, isToday, addDays } from 'date-fns';
import { pt, enUS } from 'date-fns/locale';
import { Calendar, Clock, Video, MapPin, CalendarPlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useUpcomingSessions } from '@/hooks/useUpcomingSessions';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';


interface CalendarWidgetProps {
  className?: string;
}

export const CalendarWidget = forwardRef<HTMLDivElement, CalendarWidgetProps>(function CalendarWidget({ className }, ref) {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { data: sessions, isLoading } = useUpcomingSessions();

  const dateLocale = i18n.language === 'pt' ? pt : enUS;

  const today = new Date();
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // Group sessions by date
  const sessionsByDate = useMemo(() => {
    if (!sessions) return {};
    
    const grouped: Record<string, typeof sessions> = {};
    sessions.forEach(session => {
      const dateKey = format(new Date(session.scheduled_at), 'yyyy-MM-dd');
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(session);
    });
    return grouped;
  }, [sessions]);

  // Get sessions for next 7 days for the list view
  const upcomingDays = eachDayOfInterval({
    start: today,
    end: addDays(today, 6),
  });

  const handleSessionClick = (session: any) => {
    navigate(`/workspace/${session.workspace_id}?tab=agenda`);
  };

  if (isLoading) {
    return (
      <Card className={cn("", className)}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            {t('calendar.upcomingSessions', 'Próximas Sessões')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-16" />
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
          <Calendar className="h-4 w-4 text-primary" />
          {t('calendar.upcomingSessions', 'Próximas Sessões')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Week Calendar View */}
        <div className="grid grid-cols-7 gap-1">
          {weekDays.map((day) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const daySessions = sessionsByDate[dateKey] || [];
            const hasSession = daySessions.length > 0;
            
            return (
              <div
                key={dateKey}
                className={cn(
                  "flex flex-col items-center p-2 rounded-lg text-center transition-colors",
                  isToday(day) && "bg-primary/10 ring-1 ring-primary/30",
                  hasSession && !isToday(day) && "bg-accent/50"
                )}
              >
                <span className="text-[10px] text-muted-foreground uppercase">
                  {format(day, 'EEE', { locale: dateLocale })}
                </span>
                <span className={cn(
                  "text-sm font-medium",
                  isToday(day) && "text-primary"
                )}>
                  {format(day, 'd')}
                </span>
                {hasSession && (
                  <div className="flex gap-0.5 mt-1">
                    {daySessions.slice(0, 3).map((_, i) => (
                      <div key={i} className="h-1 w-1 rounded-full bg-primary" />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Session List */}
        <ScrollArea className="h-[200px]">
          <div className="space-y-2">
            {upcomingDays.map((day) => {
              const dateKey = format(day, 'yyyy-MM-dd');
              const daySessions = sessionsByDate[dateKey] || [];
              
              if (daySessions.length === 0) return null;

              return (
                <div key={dateKey}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn(
                      "text-xs font-medium",
                      isToday(day) ? "text-primary" : "text-muted-foreground"
                    )}>
                      {isToday(day) ? t('common.today', 'Hoje') : format(day, 'EEEE, d MMM', { locale: dateLocale })}
                    </span>
                    <Badge variant="secondary" className="text-[10px] h-4">
                      {daySessions.length}
                    </Badge>
                  </div>
                  <div className="space-y-2 pl-2 border-l-2 border-primary/20">
                    {daySessions.map((session) => (
                      <div
                        key={session.id}
                        {...clickableProps(() => handleSessionClick(session))}
                        className="p-2 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{session.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {session.startup_name}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                            <Clock className="h-3 w-3" />
                            {format(new Date(session.scheduled_at), 'HH:mm')}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {session.join_url && (
                            <Badge variant="outline" className="text-[10px] h-4 gap-1">
                              <Video className="h-2.5 w-2.5" />
                              Online
                            </Badge>
                          )}
                          {session.location && !session.join_url && (
                            <Badge variant="outline" className="text-[10px] h-4 gap-1">
                              <MapPin className="h-2.5 w-2.5" />
                              {session.location}
                            </Badge>
                          )}
                          {session.duration && (
                            <span className="text-[10px] text-muted-foreground">
                              {session.duration} min
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            
            {sessions?.length === 0 && (
              <EmptyState
                icon={Calendar}
                title={t('calendar.noSessions', { defaultValue: 'Sem sessões agendadas' })}
                description={t('calendar.noSessionsDesc', { defaultValue: 'Agende uma sessão com o seu mentor para receber orientação.' })}
                action={{
                  label: t('calendar.bookSession', { defaultValue: 'Agendar sessão' }),
                  onClick: () => navigate('/mentors'),
                  icon: CalendarPlus,
                }}
                variant="inline"
              />
            )}

          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
});
