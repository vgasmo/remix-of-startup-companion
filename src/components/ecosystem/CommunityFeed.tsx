import { useTranslation } from 'react-i18next';
import { Megaphone, Handshake, CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { EmptyState } from '@/components/ui/EmptyState';

/**
 * Community feed — previously rendered MOCK_ANNOUNCEMENTS / MOCK_CHALLENGES / MOCK_EVENTS
 * which appeared to founders as production truth (fake perks, fake dates, fake companies).
 *
 * Until the real permissioned model is wired (published-only admin_announcements,
 * moderated community_offers, real ecosystem events with dates), the surface
 * renders honest empty states. Do not reintroduce fixture arrays here.
 */
export function CommunityFeed() {
  const { t } = useTranslation();

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Megaphone className="h-5 w-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold text-foreground">
              {t('community.announcements', 'Anúncios & Parcerias')}
            </h3>
          </div>
          <EmptyState
            icon={Megaphone}
            title={t('community.noAnnouncementsTitle', 'Sem anúncios publicados')}
            description={t(
              'community.noAnnouncementsDesc',
              'Quando a equipa Startup Leiria publicar novidades, parcerias ou perks, aparecem aqui.',
            )}
          />
        </div>

        <Separator />

        <div>
          <div className="flex items-center gap-2 mb-4">
            <Handshake className="h-5 w-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold text-foreground">
              {t('community.challenges', 'Desafios do Ecossistema')}
            </h3>
          </div>
          <EmptyState
            icon={Handshake}
            title={t('community.noChallengesTitle', 'Ainda sem desafios')}
            description={t(
              'community.noChallengesDesc2',
              'Founders vão poder publicar necessidades e ofertas depois de aprovação da equipa. Estamos a preparar esta funcionalidade.',
            )}
          />
        </div>
      </div>

      <div>
        <Card className="sticky top-6">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">
                {t('community.upcomingEvents', 'Próximos Eventos')}
              </CardTitle>
            </div>
            <CardDescription>
              {t('community.eventsDesc', 'Workshops, pitches e networking no ecossistema')}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <EmptyState
              icon={CalendarDays}
              title={t('community.noEventsTitle', 'Sem eventos agendados')}
              description={t(
                'community.noEventsDesc',
                'Assim que forem publicados, aparecem aqui com data, hora e local.',
              )}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
