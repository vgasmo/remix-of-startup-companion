import { memo, useMemo, useState } from 'react';

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Calendar, 
  Clock,
  FileText,
  Briefcase,
  Users,
  TrendingUp,
  ArrowRight,
  CheckCircle2,
  Heart,
  Sparkles,
  Star,
  ClipboardList,
  Target,
  BarChart3,
} from 'lucide-react';
import { format, formatDistanceToNow, isToday } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { StageBadge } from '@/components/ui/StageBadge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { BrandSurface } from '@/components/ui/BrandSurface';
import { CalendarWidget } from '@/components/dashboard/CalendarWidget';
import { FirstContactPrepSheet } from '@/components/consultor/FirstContactPrepSheet';
import { WorkspaceWithDetails } from '@/hooks/useWorkspaces';
import { HealthScore } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { MentorOpenLoops } from '@/components/mentor/MentorOpenLoops';
import { MentorImpactPanel } from '@/components/mentor/MentorImpactPanel';
import { MentorSessionPrepEnhanced } from '@/components/mentor/MentorSessionPrepEnhanced';
import { QuickNoteDialog } from '@/components/mentor/QuickNoteDialog';
import { useMyAvailability } from '@/hooks/useMentorAvailability';
import { StickyNote } from 'lucide-react';
import { WidgetErrorBoundary } from '@/components/ui/WidgetErrorBoundary';
import { NextBestActionMentor } from '@/components/dashboard/NextBestActionPanels';
import { MentorPortfolioPulse } from '@/components/mentor/MentorPortfolioPulse';
import { MomentumBadge } from '@/components/shared/MomentumBadge';
import { computeMomentum } from '@/hooks/useWorkspaceMomentum';

interface MentorDashboardProps {
  workspaces: WorkspaceWithDetails[];
  isLoading: boolean;
}

export const MentorDashboard = memo(function MentorDashboard({ workspaces, isLoading }: MentorDashboardProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [prepSheetWorkspaceId, setPrepSheetWorkspaceId] = useState<string | null>(null);
  const [quickNoteWorkspaceId, setQuickNoteWorkspaceId] = useState<string | null>(null);
  const { data: mySlots } = useMyAvailability();
  
  const slotsThisWeek = mySlots?.filter(s => s.is_active).length ?? 0;
  const availabilityStatus = slotsThisWeek > 2 ? 'available' : slotsThisWeek > 0 ? 'limited' : 'full';
  const statusColors = { available: 'bg-success', limited: 'bg-warning', full: 'bg-destructive' };
  const statusLabels = {
    available: t('mentor.availability.available', { defaultValue: 'Disponível' }),
    limited: t('mentor.availability.limited', { defaultValue: 'Limitado' }),
    full: t('mentor.availability.full', { defaultValue: 'Sem vagas' }),
  };

  const sortedWorkspaces = useMemo(() => {
    if (!workspaces) return [];
    return [...workspaces].sort((a, b) => {
      if (a.nextMeetingDate && !b.nextMeetingDate) return -1;
      if (!a.nextMeetingDate && b.nextMeetingDate) return 1;
      if (a.nextMeetingDate && b.nextMeetingDate) {
        return new Date(a.nextMeetingDate).getTime() - new Date(b.nextMeetingDate).getTime();
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [workspaces]);

  const upcomingMeetings = useMemo(() => {
    if (!workspaces) return [];
    return workspaces
      .filter(w => w.nextMeetingDate)
      .sort((a, b) => 
        new Date(a.nextMeetingDate!).getTime() - new Date(b.nextMeetingDate!).getTime()
      )
      .slice(0, 5);
  }, [workspaces]);

  const impactStats = useMemo(() => {
    if (!workspaces) return { sessionsCompleted: 0, actionsCreated: 0, healthyCount: 0 };
    const healthyCount = workspaces.filter(w => {
      const health = w.health_score_override || w.health_score;
      return health === 'healthy' || health === 'thriving';
    }).length;
    return {
      sessionsCompleted: workspaces.filter(w => w.lastSession).length,
      actionsCreated: workspaces.reduce((sum, w) => sum + w.pendingActionsCount, 0),
      healthyCount,
    };
  }, [workspaces]);

  const recentUnloggedSessions = useMemo(() => {
    if (!workspaces) return [];
    const now = new Date();
    return workspaces.filter(w => {
      if (!w.lastSession?.scheduled_at) return false;
      const sessionDate = new Date(w.lastSession.scheduled_at);
      const hoursSince = (now.getTime() - sessionDate.getTime()) / (1000 * 60 * 60);
      return hoursSince >= 0 && hoursSince <= 48;
    }).slice(0, 3);
  }, [workspaces]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-xl" />
            <div className="flex-1">
              <Skeleton className="h-5 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
        </Card>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="p-4">
              <Skeleton className="h-16 w-full" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Enhanced empty state
  if (workspaces.length === 0) {
    return (
      <Card className="relative overflow-hidden border-0 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/8 via-accent/5 to-transparent" />
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-primary/10 to-transparent rounded-bl-full" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-gradient-to-tr from-accent/10 to-transparent rounded-tr-full" />
        <CardContent className="relative p-8 md:p-12 text-center">
          <div className="h-20 w-20 mx-auto rounded-3xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center mb-6 ring-1 ring-primary/20 shadow-lg shadow-primary/10">
            <Heart className="h-10 w-10 text-primary" />
          </div>
          <h3 className="font-heading text-xl md:text-2xl font-bold mb-3">
            {t('mentor.welcomeTitle', 'Bem-vindo ao Painel de Mentor')}
          </h3>
          <p className="text-muted-foreground mb-2 max-w-md mx-auto">
            {t('mentor.noStartupsAssignedDesc', 'Ainda não tens startups atribuídas. Quando a equipa do programa te associar a startups, elas aparecerão aqui com toda a informação para preparares as tuas sessões.')}
          </p>
          <p className="text-sm text-primary/70 mb-6 max-w-sm mx-auto flex items-center justify-center gap-1.5">
            <Sparkles className="h-4 w-4" />
            {t('mentor.thankYouMessage', 'O teu tempo e experiência fazem toda a diferença para estas startups.')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button onClick={() => navigate('/mentors')} className="gap-2 shadow-md">
              <Users className="h-4 w-4" />
              {t('mentor.viewConnectionRequests', 'Ver Conexões & Recursos')}
            </Button>
            <Button variant="outline" onClick={() => navigate('/settings')}>
              {t('mentor.updateAvailability', 'Atualizar Disponibilidade')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-6 max-w-sm mx-auto">
            {t('mentor.emptyHint', 'Enquanto espera, pode consultar o Guia Rápido na barra lateral para se familiarizar com a plataforma.')}
          </p>
        </CardContent>
      </Card>
    );
  }

  const sessionsThisWeek = upcomingMeetings.length;
  const hour = new Date().getHours();
  const greetingKey =
    hour < 12 ? 'mentor.hero.morning'
    : hour < 19 ? 'mentor.hero.afternoon'
    : 'mentor.hero.evening';
  const greetingDefault =
    hour < 12 ? 'Bom dia{{name}}'
    : hour < 19 ? 'Boa tarde{{name}}'
    : 'Boa noite{{name}}';
  const firstName = profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : '';

  return (
    <div className="space-y-6 max-w-5xl">
      {/* 1. GREETING HERO — branded surface, availability inline */}
      <BrandSurface
        intensity="hero"
        className="surface-hero rounded-2xl p-4 sm:p-7 overflow-hidden animate-fade-in-up stagger-1"
      >
        <div className="space-y-2">
          <p className="label-eyebrow">
            {t('mentor.hero.eyebrow', { defaultValue: 'Painel do mentor' })}
          </p>
          <h1 className="text-display text-foreground break-words">
            {t(greetingKey, { defaultValue: greetingDefault, name: firstName })}
          </h1>
          <div className="flex items-center gap-2 flex-wrap text-sm text-muted-foreground">
            <span>
              {t('mentor.hero.subline', {
                defaultValue: '{{count}} startups · {{sessions}} sessões esta semana',
                count: workspaces.length,
                sessions: sessionsThisWeek,
              })}
            </span>
            <Badge
              variant="outline"
              className="gap-1.5 rounded-full border-border/60 bg-background/70 text-xs font-medium"
            >
              <span className={cn('h-2 w-2 rounded-full', statusColors[availabilityStatus])} />
              {statusLabels[availabilityStatus]}
            </Badge>
          </div>
        </div>

        {slotsThisWeek === 0 && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3">
            <div className="h-9 w-9 rounded-xl bg-warning/15 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4 text-warning" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">
                {t('mentor.availability.emptyBanner.title', { defaultValue: 'Define a tua disponibilidade' })}
              </p>
              <p className="text-xs text-muted-foreground">
                {t('mentor.availability.emptyBanner.subtitle', { defaultValue: 'Sem horários definidos, os fundadores não conseguem agendar sessões contigo.' })}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => navigate('/mentors?tab=availability')}
              className="gap-1.5 shrink-0"
            >
              {t('mentor.availability.emptyBanner.cta', { defaultValue: 'Configurar agora' })}
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </BrandSurface>

      {/* Stream F: Next Best Action (read-only, derived from sessions/requests) */}
      <WidgetErrorBoundary name="NextBestActionMentor">
        <NextBestActionMentor
          upcomingSessionsCount={(workspaces || []).reduce(
            (acc, w: any) => acc + (w?.upcomingSessions?.length || 0),
            0
          )}
        />
      </WidgetErrorBoundary>

      {/* P0 HERO: Single Session Prep surface (MentorNextSessionPrep removed — it duplicated this) */}
      <WidgetErrorBoundary name="MentorSessionPrep">
        <MentorSessionPrepEnhanced workspaces={workspaces} />
      </WidgetErrorBoundary>


      {/* Open Loops — what needs attention */}
      <WidgetErrorBoundary name="MentorOpenLoops">
        <MentorOpenLoops workspaces={workspaces} />
      </WidgetErrorBoundary>

      {/* Post-session feedback CTA */}
      {recentUnloggedSessions.length > 0 && (
        <Card className="border-warning/30 bg-gradient-to-r from-warning/10 via-warning/5 to-transparent rounded-2xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-9 w-9 rounded-xl bg-warning/15 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-warning" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold">{t('mentor.postSession.title', { defaultValue: 'Regista as notas da sessão' })}</p>
                <p className="text-xs text-muted-foreground">{t('mentor.postSession.subtitle', { defaultValue: 'Tens sessões recentes sem notas — regista enquanto está fresco.' })}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {recentUnloggedSessions.map(w => (
                <Button
                  key={w.id}
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs hover:bg-warning/10"
                  onClick={() => navigate(`/workspace/${w.id}?tab=agenda`)}
                >
                  {w.startup?.name?.slice(0, 12)}
                  <ArrowRight className="h-3 w-3" />
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Stats */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {[
          { label: t('mentor.myStartups'), value: workspaces.length, icon: Briefcase, accent: false, onClick: () => document.getElementById('mentor-startups-section')?.scrollIntoView({ behavior: 'smooth' }) },
          { label: t('mentor.upcomingMeetings'), value: upcomingMeetings.length, icon: Calendar, accent: false, 
            extra: workspaces.filter(w => w.nextMeetingDate && isToday(new Date(w.nextMeetingDate))).length,
            onClick: () => document.getElementById('mentor-calendar-section')?.scrollIntoView({ behavior: 'smooth' }) },
          { label: t('mentor.startupsHealthy'), value: impactStats.healthyCount, icon: TrendingUp, accent: true },
          { label: t('mentor.pendingActions'), value: impactStats.actionsCreated, icon: CheckCircle2, accent: false },
        ].map((stat, i) => {
          const Icon = stat.icon;
          const isClickable = !!stat.onClick;
          return (
            <Card 
              key={i} 
              className={cn(
                "p-4 rounded-2xl border-border/60 transition-all duration-200 hover:shadow-sm hover:border-border/80",
                isClickable && "cursor-pointer hover:border-primary/30"
              )}
              onClick={stat.onClick}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">{stat.label}</p>
                  <p className={cn("text-3xl font-semibold", stat.accent && 'text-success')}>{stat.value}</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-muted/50 flex items-center justify-center">
                  <Icon className={cn("h-4 w-4", stat.accent ? 'text-success' : 'text-muted-foreground/50')} />
                </div>
              </div>
              {stat.extra !== undefined && stat.extra > 0 && (
                <p className="text-xs text-primary mt-1 font-medium">
                  {stat.extra} {t('common.today')}
                </p>
              )}
            </Card>
          );
        })}
      </div>

      {/* Cross-startup portfolio pulse */}
      <MentorPortfolioPulse workspaces={workspaces} />


      {/* Two-column layout: Startups + Calendar */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div id="mentor-startups-section" className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">{t('mentor.myStartups')}</h2>
              <p className="text-xs text-muted-foreground">
                {t('mentor.myStartupsHint', { defaultValue: 'Startups que acompanha. Use "Preparar Reunião" para contexto rápido antes de cada sessão.' })}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/mentors')} className="gap-1 text-xs text-muted-foreground hover:text-foreground">
              {t('mentor.manageConnections')}
              <ArrowRight className="h-3 w-3" />
            </Button>
          </div>

          <div className="grid gap-2.5">
            {sortedWorkspaces.map((workspace) => {
              const health = workspace.health_score_override || workspace.health_score;
              const hasUpcomingMeeting = workspace.nextMeetingDate && isToday(new Date(workspace.nextMeetingDate));
              
              return (
                <Card 
                  key={workspace.id}
                  className={cn(
                    'group cursor-pointer transition-all duration-200 rounded-2xl border-border/60',
                    'hover:shadow-md hover:border-border/80 hover:scale-[1.003]',
                    hasUpcomingMeeting && 'border-primary/30 bg-primary/5 ring-1 ring-primary/10',
                  )}
                  onClick={() => navigate(`/workspace/${workspace.id}`)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <Avatar className="h-12 w-12 rounded-xl shrink-0 ring-1 ring-border/50">
                        <AvatarImage src={workspace.startup?.logo_url || undefined} className="object-cover" alt={workspace.startup?.name || 'Startup logo'} />
                        <AvatarFallback className="rounded-xl bg-primary/10 text-primary font-semibold">
                          {workspace.startup?.name?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className="font-semibold truncate group-hover:text-primary transition-colors">{workspace.startup?.name}</h3>
                          <HealthBadge score={health as HealthScore | null} size="sm" />
                          {(() => { const m = computeMomentum(workspace); return <MomentumBadge band={m.band} score={m.momentumScore} size="sm" />; })()}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <StageBadge stage={workspace.stage} size="sm" />
                          {workspace.lastSession ? (
                            <span className="flex items-center gap-1">
                              <FileText className="h-3 w-3" />
                              {t('mentor.lastSession', 'Última sessão')}: {formatDistanceToNow(new Date(workspace.lastSession.scheduled_at), { addSuffix: true })}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-muted-foreground/50 italic">
                              <FileText className="h-3 w-3" />
                              {t('mentor.noSessionsYet', { defaultValue: 'Sem sessões registadas' })}
                            </span>
                          )}
                        </div>
                        {/* Compact summary cues */}
                        <div className="flex items-center gap-2.5 mt-1.5 text-[11px] text-muted-foreground">
                          {workspace.hasCurrentMonthKpi ? (
                            <span className="flex items-center gap-0.5 text-success">
                              <BarChart3 className="h-3 w-3" />
                              {t('mentor.kpiUpToDate', { defaultValue: 'KPIs atualizados' })}
                            </span>
                          ) : (
                            <span className="flex items-center gap-0.5">
                              <BarChart3 className="h-3 w-3" />
                              {t('mentor.kpiMissing', { defaultValue: 'KPIs por atualizar' })}
                            </span>
                          )}
                          {workspace.pendingActionsCount > 0 && (
                            <span className="flex items-center gap-0.5">
                              <Target className="h-3 w-3" />
                              {workspace.pendingActionsCount} {t('mentor.actionsPending', { defaultValue: 'ações' })}
                              {workspace.overdueActionsCount > 0 && (
                                <span className="text-destructive font-medium ml-0.5">
                                  ({workspace.overdueActionsCount} {t('common.overdue', 'atrasadas')})
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex flex-col items-end gap-1.5">
                        {workspace.nextMeetingDate ? (
                          <div className={hasUpcomingMeeting ? 'text-primary' : 'text-muted-foreground'}>
                            <div className="flex items-center gap-1.5 text-xs font-medium">
                              <Calendar className="h-3.5 w-3.5" />
                              {hasUpcomingMeeting
                                ? format(new Date(workspace.nextMeetingDate), 'HH:mm')
                                : format(new Date(workspace.nextMeetingDate), 'dd MMM')
                              }
                            </div>
                            {hasUpcomingMeeting && (
                              <Badge variant="default" className="text-[10px] mt-1">
                                {t('common.today', 'Hoje')}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-xs h-7 opacity-60 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/workspace/${workspace.id}?tab=agenda`);
                            }}
                          >
                            {t('mentor.scheduleSession', 'Agendar')}
                          </Button>
                        )}
                        {/* Prep Sheet button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[11px] h-6 px-2 gap-1 opacity-50 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrepSheetWorkspaceId(workspace.id);
                          }}
                        >
                          <ClipboardList className="h-3 w-3" />
                          {t('mentor.prepSheet', { defaultValue: 'Preparar' })}
                        </Button>
                        {/* Quick Note button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[11px] h-6 px-2 gap-1 opacity-50 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            setQuickNoteWorkspaceId(workspace.id);
                          }}
                        >
                          <StickyNote className="h-3 w-3" />
                          {t('mentor.quickNote', { defaultValue: 'Nota Rápida' })}
                        </Button>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground/30 group-hover:text-primary transition-colors" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>

        <div id="mentor-calendar-section" className="space-y-4">
          <WidgetErrorBoundary name="CalendarWidget">
            <CalendarWidget />
          </WidgetErrorBoundary>
          
          {/* Your Impact - Enhanced */}
          <WidgetErrorBoundary name="MentorImpactPanel">
            <MentorImpactPanel workspaces={workspaces} />
          </WidgetErrorBoundary>
        </div>
      </div>

      {/* Prep Sheet Dialog */}
      {prepSheetWorkspaceId && (
        <FirstContactPrepSheet
          open={!!prepSheetWorkspaceId}
          onOpenChange={(open) => { if (!open) setPrepSheetWorkspaceId(null); }}
          workspaceId={prepSheetWorkspaceId}
        />
      )}

      {/* Quick Note Dialog */}
      {quickNoteWorkspaceId && (
        <QuickNoteDialog
          open={!!quickNoteWorkspaceId}
          onOpenChange={(open) => { if (!open) setQuickNoteWorkspaceId(null); }}
          workspaceId={quickNoteWorkspaceId}
          startupName={workspaces.find(w => w.id === quickNoteWorkspaceId)?.startup?.name || undefined}
        />
      )}
    </div>
  );
});
