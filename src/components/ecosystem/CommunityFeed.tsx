import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Megaphone,
  Gift,
  Handshake,
  CalendarDays,
  MapPin,
  Clock,
  ArrowRight,
  Sparkles,
  Search as SearchIcon,
  Users,
  Code,
  Palette,
  TrendingUp,
  ExternalLink,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { EmptyState } from '@/components/ui/EmptyState';
import { format, addDays, addWeeks } from 'date-fns';
import { pt } from 'date-fns/locale';

/* ─── Mock data (will be replaced by real queries) ─── */

interface Announcement {
  id: string;
  title: string;
  description: string;
  partner?: string;
  category: 'perk' | 'news' | 'update';
  discount?: string;
  expiresAt?: string;
  url?: string;
}

interface Challenge {
  id: string;
  startupName: string;
  startupInitials: string;
  type: 'need' | 'offer';
  title: string;
  tags: string[];
  postedAt: string;
}

interface EcosystemEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  type: 'workshop' | 'networking' | 'pitch' | 'meetup';
}

const MOCK_ANNOUNCEMENTS: Announcement[] = [
  {
    id: '1',
    title: 'AWS Activate – Créditos Cloud',
    description: 'Até 100.000€ em créditos AWS para startups do ecossistema Startup Leiria.',
    partner: 'Amazon Web Services',
    category: 'perk',
    discount: '100.000€ em créditos',
    expiresAt: format(addWeeks(new Date(), 8), 'yyyy-MM-dd'),
    url: '#',
  },
  {
    id: '2',
    title: 'Hubspot for Startups',
    description: 'CRM gratuito durante 1 ano para startups em fase de validação ou superior.',
    partner: 'HubSpot',
    category: 'perk',
    discount: '90% desconto',
    url: '#',
  },
  {
    id: '3',
    title: 'Nova Parceria: Leiria Business School',
    description: 'Acesso a programas de formação executiva com condições especiais para founders.',
    category: 'news',
  },
  {
    id: '4',
    title: 'Atualização de Regulamento 2025',
    description: 'Novas regras para equity e contratos de incubação entram em vigor em Março.',
    category: 'update',
  },
];

const MOCK_CHALLENGES: Challenge[] = [
  {
    id: '1',
    startupName: 'GreenTech Solutions',
    startupInitials: 'GT',
    type: 'need',
    title: 'Procuramos Dev Full-Stack (React + Node)',
    tags: ['React', 'Node.js', 'Full-Stack'],
    postedAt: format(addDays(new Date(), -2), 'yyyy-MM-dd'),
  },
  {
    id: '2',
    startupName: 'HealthPulse',
    startupInitials: 'HP',
    type: 'offer',
    title: 'Oferecemos UX Audit gratuito (até 3 ecrãs)',
    tags: ['UX', 'Design', 'Audit'],
    postedAt: format(addDays(new Date(), -1), 'yyyy-MM-dd'),
  },
  {
    id: '3',
    startupName: 'DataWave AI',
    startupInitials: 'DW',
    type: 'need',
    title: 'Precisamos de Growth Marketer para campanha Q2',
    tags: ['Marketing', 'Growth', 'Ads'],
    postedAt: format(new Date(), 'yyyy-MM-dd'),
  },
  {
    id: '4',
    startupName: 'EduFlow',
    startupInitials: 'EF',
    type: 'offer',
    title: 'Partilhamos API de pagamentos integrada (Stripe)',
    tags: ['Fintech', 'API', 'Stripe'],
    postedAt: format(addDays(new Date(), -3), 'yyyy-MM-dd'),
  },
];

const MOCK_EVENTS: EcosystemEvent[] = [
  {
    id: '1',
    title: 'Demo Day – Cohort Spring 2025',
    date: format(addDays(new Date(), 5), 'yyyy-MM-dd'),
    time: '14:00',
    location: 'Auditório Startup Leiria',
    type: 'pitch',
  },
  {
    id: '2',
    title: 'Workshop: Product-Market Fit',
    date: format(addDays(new Date(), 12), 'yyyy-MM-dd'),
    time: '10:00',
    location: 'Sala de Formação B2',
    type: 'workshop',
  },
  {
    id: '3',
    title: 'Networking After-Work',
    date: format(addDays(new Date(), 18), 'yyyy-MM-dd'),
    time: '18:30',
    location: 'Terraço Cowork',
    type: 'networking',
  },
  {
    id: '4',
    title: 'Meetup: IA Generativa para Startups',
    date: format(addDays(new Date(), 25), 'yyyy-MM-dd'),
    time: '19:00',
    location: 'Online (Zoom)',
    type: 'meetup',
  },
];

/* ─── Sub-components ─── */

function AnnouncementCard({ item }: { item: Announcement }) {
  const categoryConfig = {
    perk: { color: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ', icon: Gift, label: 'Parceria' },
    news: { color: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]', icon: Megaphone, label: 'Novidade' },
    update: { color: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]', icon: Sparkles, label: 'Atualização' },
  };
  const cfg = categoryConfig[item.category];
  const Icon = cfg.icon;

  return (
    <Card className="group hover:shadow-md transition-all duration-200 hover:border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${cfg.color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-semibold text-sm text-foreground">{item.title}</h4>
              <Badge variant="outline" className={`text-[10px] ${cfg.color} border-0`}>
                {cfg.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">{item.description}</p>
            <div className="flex items-center gap-3 pt-1">
              {item.partner && (
                <span className="text-xs font-medium text-primary/80">{item.partner}</span>
              )}
              {item.discount && (
                <Badge variant="secondary" className="text-[10px] bg-primary/5 text-primary">
                  {item.discount}
                </Badge>
              )}
              {item.url && (
                <Button variant="ghost" size="sm" className="h-6 px-2 text-xs ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                  Ver mais <ExternalLink className="h-3 w-3 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ChallengeCard({ item }: { item: Challenge }) {
  const isNeed = item.type === 'need';
  const tagIcons: Record<string, typeof Code> = {
    React: Code, 'Node.js': Code, 'Full-Stack': Code,
    UX: Palette, Design: Palette, Audit: Palette,
    Marketing: TrendingUp, Growth: TrendingUp, Ads: TrendingUp,
    Fintech: TrendingUp, API: Code, Stripe: Code,
  };

  return (
    <Card className="group hover:shadow-md transition-all duration-200">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="h-9 w-9 shrink-0">
            <AvatarFallback className={`text-xs font-bold ${isNeed ? 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] ' : 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] '}`}>
              {item.startupInitials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{item.startupName}</span>
              <Badge variant={isNeed ? 'destructive' : 'default'} className="text-[10px] h-5">
                {isNeed ? 'Procura' : 'Oferece'}
              </Badge>
            </div>
            <p className="text-sm font-medium text-foreground">{item.title}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {item.tags.map(tag => {
                const TagIcon = tagIcons[tag] || Users;
                return (
                  <Badge key={tag} variant="outline" className="text-[10px] h-5 gap-1">
                    <TagIcon className="h-2.5 w-2.5" />
                    {tag}
                  </Badge>
                );
              })}
            </div>
          </div>
          <Button variant="outline" size="sm" className="shrink-0 h-8 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
            <Handshake className="h-3.5 w-3.5 mr-1" />
            Conectar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EventRow({ item }: { item: EcosystemEvent }) {
  const eventDate = new Date(item.date);
  const typeConfig = {
    workshop: { color: 'bg-primary/10', label: 'Workshop' },
    networking: { color: 'bg-[hsl(var(--info))]', label: 'Networking' },
    pitch: { color: 'bg-destructive', label: 'Pitch Day' },
    meetup: { color: 'bg-[hsl(var(--success))]/10', label: 'Meetup' },
  };
  const cfg = typeConfig[item.type];

  return (
    <div className="flex items-center gap-4 py-3 group hover:bg-muted/50 rounded-lg px-2 -mx-2 transition-colors">
      {/* Date block */}
      <div className="text-center shrink-0 w-12">
        <div className="text-2xl font-bold text-foreground leading-none">
          {format(eventDate, 'd')}
        </div>
        <div className="text-[10px] font-medium text-muted-foreground uppercase mt-0.5">
          {format(eventDate, 'MMM', { locale: pt })}
        </div>
      </div>
      <div className={`w-1 h-10 rounded-full ${cfg.color} shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            {item.time}
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            {item.location}
          </span>
        </div>
      </div>
      <Badge variant="outline" className="text-[10px] shrink-0">
        {cfg.label}
      </Badge>
      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
    </div>
  );
}

/* ─── Main Component ─── */

export function CommunityFeed() {
  const { t } = useTranslation();
  const [challengeSearch, setChallengeSearch] = useState('');

  const filteredChallenges = MOCK_CHALLENGES.filter(c =>
    c.title.toLowerCase().includes(challengeSearch.toLowerCase()) ||
    c.tags.some(tag => tag.toLowerCase().includes(challengeSearch.toLowerCase()))
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* ── Column 1+2: Announcements + Challenges ── */}
      <div className="lg:col-span-2 space-y-6">
        {/* Announcements & Perks */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Megaphone className="h-5 w-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold text-foreground">
              {t('community.announcements', 'Anúncios & Parcerias')}
            </h3>
            <Badge variant="secondary" className="ml-auto text-xs">
              {MOCK_ANNOUNCEMENTS.length} {t('community.active', 'ativos')}
            </Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {MOCK_ANNOUNCEMENTS.map(a => (
              <AnnouncementCard key={a.id} item={a} />
            ))}
          </div>
        </div>

        <Separator />

        {/* Ecosystem Challenges */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <Handshake className="h-5 w-5 text-primary" />
            <h3 className="font-heading text-lg font-semibold text-foreground">
              {t('community.challenges', 'Desafios do Ecossistema')}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground mb-3">
            {t('community.challengesDesc', 'Startups a procurar ou oferecer competências. Conecta-te!')}
          </p>
          <div className="relative mb-4">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('community.searchChallenges', 'Pesquisar desafios (ex: "React", "Marketing")...')}
              value={challengeSearch}
              onChange={(e) => setChallengeSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <ScrollArea  viewportClassName="max-h-[400px]">
            <div className="space-y-3 pr-2">
              {filteredChallenges.length === 0 ? (
                <EmptyState
                  icon={Handshake}
                  title={t('community.noChallenges', 'Sem desafios encontrados')}
                  description={t('community.noChallengesDesc', 'Ajusta a tua pesquisa ou publica o primeiro desafio.')}
                />
              ) : (
                filteredChallenges.map(c => <ChallengeCard key={c.id} item={c} />)
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* ── Column 3: Events ── */}
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
            <div className="divide-y divide-border">
              {MOCK_EVENTS.map(e => (
                <EventRow key={e.id} item={e} />
              ))}
            </div>
            <Button variant="outline" className="w-full mt-4 text-sm">
              <CalendarDays className="h-4 w-4 mr-2" />
              {t('community.viewAll', 'Ver calendário completo')}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
