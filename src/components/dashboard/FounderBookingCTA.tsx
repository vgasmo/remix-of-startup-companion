import { useState } from 'react';
import { sanitizeUrl } from '@/lib/sanitizeUrl';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Calendar, Clock, Video, ChevronRight, Sparkles } from 'lucide-react';
import { format, isToday, isTomorrow } from 'date-fns';
import { useDateLocale } from '@/lib/dateLocale';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useWorkspaceOwner } from '@/hooks/useWorkspaceOwner';
import { useUpcomingSessions } from '@/hooks/useUpcomingSessions';
import { useFeatureFlag } from '@/hooks/useFeatureFlags';

interface FounderBookingCTAProps {
  workspaceId: string;
  className?: string;
  isFirstWeek?: boolean;
}

export function FounderBookingCTA({ workspaceId, className, isFirstWeek = false }: FounderBookingCTAProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const { data: ownership } = useWorkspaceOwner(workspaceId);
  const { data: sessions } = useUpcomingSessions();
  const publicBookingEnabled = useFeatureFlag('public_first_contact_booking');

  const hasConsultant = Boolean(ownership?.assigned_consultor_id);
  // G1: pick the next session for THIS workspace only — otherwise a founder
  // with two startups sees the other startup's session on this card.
  const nextSession = sessions?.find((s) => s.workspace_id === workspaceId);

  const handleBookSession = () => {
    navigate(`/workspace/${workspaceId}?tab=agenda&new=1`);
  };

  const formatSessionDate = (dateStr: string) => {
    const date = new Date(dateStr);
    if (isToday(date)) return t('common.today');
    if (isTomorrow(date)) return t('common.tomorrow', { defaultValue: 'Amanhã' });
    return format(date, 'EEE, d MMM', { locale: dateLocale });
  };

  // No consultant assigned - show first contact CTA
  if (!hasConsultant) {
    return (
      <Card className={`overflow-hidden border-primary/30 bg-gradient-to-br from-primary/5 via-background to-accent/5 ${className}`}>
        <CardContent className="p-4 sm:p-6">

          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-shrink-0">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/20">
                <Sparkles className="h-8 w-8 text-primary-foreground" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg md:text-xl font-semibold mb-1">
                {t('founderHome.bookFirstContact', 'Book Your First Meeting')}
              </h2>
              <p className="text-muted-foreground text-sm mb-3">
                {t('founderHome.bookFirstContactDesc', 'Connect with a consultant to kickstart your startup journey.')}
              </p>
              <Button onClick={handleBookSession} size="lg" className="gap-2 shadow-md">
                <Calendar className="h-4 w-4" />
                {t('founderHome.scheduleFirstMeeting', 'Schedule First Meeting')}
                <ChevronRight className="h-4 w-4" />
              </Button>
              {isFirstWeek && (
                <p className="text-xs text-muted-foreground mt-2">
                  {t('founderHome.firstWeekHint', {
                    defaultValue:
                      'Agendar uma sessão com o mentor é o passo mais importante da primeira semana.',
                  })}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Has consultant - show next session or book new
  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardContent className="p-4 sm:p-6">
        <div className="flex flex-col md:flex-row md:items-center gap-4">

          {/* Consultant info */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <Avatar className="h-12 w-12 border-2 border-primary/20">
              <AvatarImage src={ownership?.consultor?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary font-medium">
                {ownership?.consultor?.full_name?.slice(0, 2).toUpperCase() || 'C'}
              </AvatarFallback>
            </Avatar>
            <div className="hidden md:block">
              <p className="text-sm text-muted-foreground">{t('founderHome.yourConsultant', 'Your Consultant')}</p>
              <p className="font-medium">{ownership?.consultor?.full_name || 'Consultant'}</p>
            </div>
          </div>

          <div className="flex-1 min-w-0">
            {nextSession ? (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={isToday(new Date(nextSession.scheduled_at)) ? 'default' : 'secondary'} className="text-xs">
                      {formatSessionDate(nextSession.scheduled_at)}
                    </Badge>
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {format(new Date(nextSession.scheduled_at), 'HH:mm', { locale: dateLocale })}
                    </span>
                    {nextSession.join_url && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Video className="h-3 w-3" />
                        Online
                      </Badge>
                    )}
                  </div>
                  <p className="font-medium truncate">{nextSession.title}</p>
                </div>
                <div className="flex gap-2">
                   {sanitizeUrl(nextSession.join_url) && (
                    <Button asChild variant="default" size="sm" className="h-11 sm:h-9 flex-1 sm:flex-none btn-press">
                      <a href={sanitizeUrl(nextSession.join_url)!} target="_blank" rel="noopener noreferrer">
                        <Video className="h-4 w-4 mr-1" />
                        {t('founderHome.join', { defaultValue: 'Entrar' })}
                      </a>
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={handleBookSession} className="h-11 sm:h-9 flex-1 sm:flex-none">
                    {t('founderHome.viewSessions', 'View Sessions')}
                  </Button>
                </div>

              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <h3 className="font-medium">{t('founderHome.noUpcomingSessions', 'No upcoming sessions')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('founderHome.bookNextSession', 'Book your next check-in with your consultant')}
                  </p>
                </div>
                <Button onClick={handleBookSession} className="gap-2 h-11 sm:h-10 w-full sm:w-auto btn-press">
                  <Calendar className="h-4 w-4" />
                  {t('founderHome.bookSession', 'Book Session')}
                </Button>

              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
