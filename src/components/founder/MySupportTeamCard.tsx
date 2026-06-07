import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Users, Calendar, MessageSquare, Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { WidgetErrorBoundary } from '@/components/ui/WidgetErrorBoundary';
import { supabase } from '@/lib/supabaseClient';
import type { WorkspaceMember } from '@/hooks/useWorkspaceMembers';

interface MySupportTeamCardProps {
  workspaceId: string;
  consultantId: string | null;
  mentorMember: WorkspaceMember | null;
  lastSessionDate: string | null;
}

function initials(name?: string | null) {
  if (!name) return '··';
  return name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();
}

function MySupportTeamCardInner({ workspaceId, consultantId, mentorMember, lastSessionDate }: MySupportTeamCardProps) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale = i18n.language?.startsWith('pt') ? pt : undefined;

  const { data: consultant } = useQuery({
    queryKey: ['support-team-consultant', consultantId],
    enabled: !!consultantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email, avatar_url')
        .eq('id', consultantId!)
        .maybeSingle();
      return data;
    },
  });

  const hasConsultant = !!consultant;
  const hasMentor = !!mentorMember;

  if (!hasConsultant && !hasMentor) {
    return (
      <Card className="border-border/60 rounded-xl bg-muted/30">
        <CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-info/10 flex items-center justify-center shrink-0">
            <Info className="h-4 w-4 text-info" />
          </div>
          <p className="text-sm text-muted-foreground">
            {t('founder.supportTeam.empty', { defaultValue: 'A equipa vai associar-te em breve um consultor.' })}
          </p>
        </CardContent>
      </Card>
    );
  }

  const lastSessionLabel = lastSessionDate
    ? t('founder.supportTeam.lastSession', {
        defaultValue: 'Última sessão {{when}}',
        when: formatDistanceToNow(new Date(lastSessionDate), { addSuffix: true, locale }),
      })
    : t('founder.supportTeam.noSession', { defaultValue: 'Sem sessões registadas' });

  return (
    <Card className="border-border/60 rounded-xl">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          <Users className="h-3.5 w-3.5" />
          {t('founder.supportTeam.title', { defaultValue: 'A tua equipa de apoio' })}
        </div>

        {hasConsultant && (
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 rounded-lg border border-border/40">
              <AvatarImage src={consultant?.avatar_url || undefined} alt={consultant?.full_name || ''} className="object-cover" />
              <AvatarFallback className="rounded-lg bg-primary/10 text-primary text-xs font-semibold">
                {initials(consultant?.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium truncate">{consultant?.full_name || consultant?.email}</p>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {t('founder.supportTeam.consultantLabel', { defaultValue: 'Consultor' })}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">{lastSessionLabel}</p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 shrink-0"
              onClick={() => navigate(`/workspace/${workspaceId}?tab=agenda`)}
            >
              <Calendar className="h-3.5 w-3.5" />
              {t('founder.supportTeam.book', { defaultValue: 'Agendar' })}
            </Button>
          </div>
        )}

        {hasMentor && (
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 rounded-lg border border-border/40">
              <AvatarImage src={mentorMember?.profile?.avatar_url || undefined} alt={mentorMember?.profile?.full_name || ''} className="object-cover" />
              <AvatarFallback className="rounded-lg bg-accent/40 text-accent-foreground text-xs font-semibold">
                {initials(mentorMember?.profile?.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium truncate">
                  {mentorMember?.profile?.full_name || mentorMember?.profile?.email}
                </p>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                  {t('founder.supportTeam.mentorLabel', { defaultValue: 'Mentor' })}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {t('founder.supportTeam.mentorHint', { defaultValue: 'Disponível para apoio pontual' })}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 shrink-0"
              onClick={() => navigate(`/workspace/${workspaceId}?tab=notes`)}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {t('founder.supportTeam.sendNote', { defaultValue: 'Enviar nota' })}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MySupportTeamCard(props: MySupportTeamCardProps) {
  return (
    <WidgetErrorBoundary name="MySupportTeamCard">
      <MySupportTeamCardInner {...props} />
    </WidgetErrorBoundary>
  );
}
