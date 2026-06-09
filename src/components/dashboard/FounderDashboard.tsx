import { useMemo, useEffect, useState, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Rocket,
  RotateCcw,
  BookOpenCheck,
  X,
  ChevronDown,
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useFounderMaturity } from '@/hooks/useFounderMaturity';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { StageBadge } from '@/components/ui/StageBadge';
import { ContentSkeleton } from '@/components/ui/ContentSkeleton';
import { FounderWelcomePanel } from '@/components/founder/FounderWelcomePanel';
import { StreakHero } from '@/components/dashboard/StreakHero';
import { FounderBookingCTA } from '@/components/dashboard/FounderBookingCTA';
import { OneThingToday } from '@/components/dashboard/OneThingToday';
import { StageProgressCard } from '@/components/dashboard/StageProgressCard';
import { CalendarWidget } from '@/components/dashboard/CalendarWidget';
// Deduped: OneThingToday is the single primary "next action" signal for founders.
import { InvestorReadinessWidget } from '@/components/workspace/InvestorReadinessWidget';
import { QuickActionsFab } from '@/components/workspace/QuickActionsFab';
import { QuickKpiModal } from '@/components/workspace/QuickKpiModal';
// AiPulseCard intentionally not rendered in the calm founder view.
import { WorkspaceWithDetails, PendingWorkspace } from '@/hooks/useWorkspaces';
import { useWorkspaceMembers } from '@/hooks/useWorkspaceMembers';
import { HealthScore } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useProgressStreak } from '@/hooks/useProgressStreak';
import { useChecklistRecovery } from '@/hooks/useChecklistRecovery';
import { notify } from "@/lib/notify";
import { SmartNudgeCard } from '@/components/dashboard/SmartNudgeCard';
import { useSmartNudges } from '@/hooks/useSmartNudges';
import { WidgetErrorBoundary } from '@/components/ui/WidgetErrorBoundary';
import { FounderJourneyMap } from '@/components/dashboard/FounderJourneyMap';
import { AccelerationProgressCard } from '@/components/dashboard/AccelerationProgressCard';
import { TransitionalFounderDashboard } from '@/components/founder/TransitionalFounderDashboard';
import { FounderWelcomeWizard } from '@/components/founder/FounderWelcomeWizard';
import { FounderReadinessStrip } from '@/components/founder/FounderReadinessStrip';
import { PendingContractBanner } from '@/components/founder/PendingContractBanner';
import { FounderProgressRings } from '@/components/dashboard/FounderProgressRings';
import { FounderStoryTimeline } from '@/components/founder/FounderStoryTimeline';
import { useAutoMaterializeDeliverables } from '@/hooks/useAutoMaterializeDeliverables';
import { useActionItems } from '@/hooks/useActionItems';
import { useUpcomingSessions } from '@/hooks/useUpcomingSessions';
import { FounderHelpNudge } from '@/components/founder/FounderHelpNudge';
import { useWorkspaceOwner } from '@/hooks/useWorkspaceOwner';
import { MySupportTeamCard } from '@/components/founder/MySupportTeamCard';
import { BrandSurface } from '@/components/ui/BrandSurface';
import { WelcomeSplash } from '@/components/founder/WelcomeSplash';
import { useIsFirstWeek } from '@/hooks/useIsFirstWeek';
// NextBestActionFounder removed from beginner view — kept available for power users via OneThingToday.

interface FounderDashboardProps {
  workspaces: WorkspaceWithDetails[];
  pendingWorkspaces: PendingWorkspace[];
  isLoading: boolean;
  onCreateStartup: () => void;
}

export const FounderDashboard = memo(function FounderDashboard({ 
  workspaces, 
  pendingWorkspaces,
  isLoading, 
  onCreateStartup 
}: FounderDashboardProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { profile } = useAuth();
  const { streakWeeks, recordActivity } = useProgressStreak();
  const { canRestore, restoreChecklist } = useChecklistRecovery(profile?.id);
  // Quick KPI modal auto-trigger state
  const [showQuickKpi, setShowQuickKpi] = useState(false);

  const handleRestoreChecklist = () => {
    restoreChecklist();
    notify.success(t('checklistRecovery.restored', { defaultValue: 'Checklist reposta com sucesso' }));
  };

  useEffect(() => {
    recordActivity();
  }, [recordActivity]);

  // Multi-workspace affordance: default to first but allow switching
  const [selectedWorkspaceIdx, setSelectedWorkspaceIdx] = useState(0);
  const workspace = workspaces[selectedWorkspaceIdx] || workspaces[0];
  const nudges = useSmartNudges(workspace?.id);
  
  const { data: workspaceMembers } = useWorkspaceMembers(workspace?.id);
  const { data: workspaceOwner } = useWorkspaceOwner(workspace?.id);

  // Auto-materialize acceleration deliverables into workspace milestones/actions
  useAutoMaterializeDeliverables(workspace?.id, workspace?.program_id, workspace?.program?.program_type ?? undefined);
  const hasMentor = useMemo(() => {
    if (!workspaceMembers) return false;
    return workspaceMembers.some(m => m.role === 'mentor_externo');
  }, [workspaceMembers]);
  const hasConsultant = Boolean(workspaceOwner?.assigned_consultor_id)
    || Boolean(workspaceMembers?.some(m => m.role === 'consultor'));
  
  const hasProfile = Boolean(profile?.full_name);
  const hasStartup = Boolean(workspace);
  const hasKpis = Boolean(workspace?.hasCurrentMonthKpi);
  const hasDocuments = Boolean(workspace?.lastSession);

  // Founder maturity drives progressive disclosure.
  const { maturity, isBeginner, showAdvancedByDefault } = useFounderMaturity(workspace);
  const setupComplete = hasProfile && hasStartup && hasKpis && hasDocuments;

  // Persist the "Show more" preference per user across sessions.
  // Read once on mount; if the user has never toggled, fall back to maturity-driven default.
  const advancedPrefKey = profile?.id ? `founder-advanced-open:${profile.id}` : null;
  const readStoredAdvanced = (): boolean | null => {
    if (!advancedPrefKey) return null;
    try {
      const raw = localStorage.getItem(advancedPrefKey);
      if (raw === '1') return true;
      if (raw === '0') return false;
      return null;
    } catch { return null; }
  };
  const [advancedUserToggled, setAdvancedUserToggled] = useState<boolean>(() => readStoredAdvanced() !== null);
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(() => {
    const stored = readStoredAdvanced();
    return stored !== null ? stored : showAdvancedByDefault;
  });

  // Sync default disclosure as maturity is computed (e.g., async data arrives),
  // but never override an explicit user toggle (in-session or persisted).
  useEffect(() => {
    if (!advancedUserToggled) setAdvancedOpen(showAdvancedByDefault);
  }, [showAdvancedByDefault, advancedUserToggled]);

  const handleAdvancedToggle = (open: boolean) => {
    setAdvancedUserToggled(true);
    setAdvancedOpen(open);
    if (advancedPrefKey) {
      try { localStorage.setItem(advancedPrefKey, open ? '1' : '0'); } catch { /* ignore */ }
    }
  };

  // Auto-trigger QuickKpiModal — but NOT for new founders, and never on first visit.
  useEffect(() => {
    if (!workspace || hasKpis) return;
    if (maturity === 'new_founder') return; // calm first-arrival
    const day = new Date().getDate();
    if (day >= 1 && day <= 5) {
      const dismissKey = `quickkpi-dismissed-${workspace.id}-${new Date().getFullYear()}-${new Date().getMonth()}`;
      const firstVisitKey = `founder-first-visit-${workspace.id}`;
      const isFirstVisit = !localStorage.getItem(firstVisitKey);
      if (isFirstVisit) {
        localStorage.setItem(firstVisitKey, new Date().toISOString());
        return; // never on first visit
      }
      if (!sessionStorage.getItem(dismissKey)) {
        const timer = setTimeout(() => setShowQuickKpi(true), 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [workspace, hasKpis, maturity]);

  // Hook must be called unconditionally — keep above any early return (Rules of Hooks).
  const isFirstWeek = useIsFirstWeek(profile?.created_at, (workspace as any)?.created_at);

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-5xl">
        {/* Structural skeleton matching dashboard layout */}
        <ContentSkeleton type="stats" count={3} />
        <ContentSkeleton type="list" count={3} />
        <div className="grid gap-6 md:grid-cols-2">
          <ContentSkeleton type="chart" />
          <ContentSkeleton type="list" count={4} />
        </div>
      </div>
    );
  }

  // ProtectedRoute enforces claim-first gate — founders without an active workspace
  // are redirected to /claim-startup before reaching this component.
  // This fallback handles the brief render before redirect completes.
  if (!workspace) {
    return (
      <div className="space-y-6 max-w-5xl">
        <ContentSkeleton type="stats" count={3} />
      </div>
    );
  }

  // LOCAL DETECTION: If the workspace exists but is not truly 'active',
  // render the transitional dashboard instead of the full mature view.
  // This is additive, read-only, does NOT change useWorkspaces or useFounderOnboardingState.
  const wsStatus = (workspace as any).status as string | undefined;
  const wsNeedsOnboarding = (workspace as any).needs_onboarding === true;
  const isTransitional = wsStatus && wsStatus !== 'active';

  if (isTransitional) {
    // If needs_onboarding is true, show 'onboarding' state regardless of workspace status
    const transitionalStatus = wsNeedsOnboarding
      ? 'onboarding'
      : (['claimed', 'pending', 'onboarding'].includes(wsStatus!))
        ? wsStatus as 'claimed' | 'pending' | 'onboarding'
        : 'claimed'; // safe fallback for imported_unclaimed or other non-active states
    return (
      <TransitionalFounderDashboard
        workspace={workspace}
        workspaceStatus={transitionalStatus}
      />
    );
  }

  const health = workspace.health_score_override || workspace.health_score;
  const handleUpdateKpis = () => navigate(`/workspace/${workspace.id}?tab=kpis`);
  const handleAddAction = () => navigate(`/workspace/${workspace.id}?tab=milestones-actions-actions`);
  const handleScheduleSession = () => navigate(`/workspace/${workspace.id}?tab=agenda`);




  return (
    <div className="space-y-6 max-w-5xl animate-fade-in">

      <WelcomeSplash userId={profile?.id} />
      <FounderWelcomeWizard workspaceId={workspace?.id ?? null} />
      {/* Multi-workspace notice */}
      {workspaces.length > 1 && (
        <Card className="border-primary/20 bg-primary/5 rounded-xl">
          <CardContent className="py-3 px-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                  <Rocket className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {t('founder.multiWorkspace.title', { defaultValue: 'Tem {{count}} startups associadas', count: workspaces.length })}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {t('founder.multiWorkspace.hint', { defaultValue: 'Está a ver "{{name}}". Selecione outra abaixo.', name: workspace?.startup?.name || '' })}
                  </p>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 sm:max-w-[260px] justify-between shrink-0">
                    <span className="flex items-center gap-2 min-w-0">
                      <Avatar className="h-5 w-5 rounded-md">
                        <AvatarImage src={workspace?.startup?.logo_url || undefined} className="object-cover" alt="" />
                        <AvatarFallback className="rounded-md bg-primary/10 text-primary text-[9px] font-semibold">
                          {workspace?.startup?.name?.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate text-xs">{workspace?.startup?.name || `Startup ${selectedWorkspaceIdx + 1}`}</span>
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-60 shrink-0" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-[260px]">
                  {workspaces.map((ws, idx) => (
                    <DropdownMenuItem
                      key={ws.id}
                      onClick={() => setSelectedWorkspaceIdx(idx)}
                      className="gap-2"
                    >
                      <Avatar className="h-6 w-6 rounded-md">
                        <AvatarImage src={ws.startup?.logo_url || undefined} className="object-cover" alt="" />
                        <AvatarFallback className="rounded-md bg-primary/10 text-primary text-[10px] font-semibold">
                          {ws.startup?.name?.slice(0, 2).toUpperCase() || `S${idx + 1}`}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex-1 truncate text-sm">{ws.startup?.name || `Startup ${idx + 1}`}</span>
                      {idx === selectedWorkspaceIdx && (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                          {t('common.current', { defaultValue: 'Atual' })}
                        </Badge>
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ★ PENDING CONTRACT — High-priority, blocks everything else when present ★ */}
      <WidgetErrorBoundary name="PendingContract">
        <PendingContractBanner workspaceId={workspace.id} />
      </WidgetErrorBoundary>

      {/* ============================================================
          PRIMARY CALM SCREEN — clear hierarchy, V1 identity
          1) Greeting hero (always)
          2) [optional] Pending contract blocker — already rendered above
          3) ONE next-action (OneThingToday)
          4) Support team
          5) Booking CTA
          ============================================================ */}

      {/* 1. GREETING HERO — branded surface, .text-display, inline context */}
      {(() => {
        const hour = new Date().getHours();
        const greetingKey =
          hour < 12 ? 'founder.hero.morning'
          : hour < 19 ? 'founder.hero.afternoon'
          : 'founder.hero.evening';
        const greetingDefault =
          hour < 12 ? 'Bom dia{{name}}'
          : hour < 19 ? 'Boa tarde{{name}}'
          : 'Boa noite{{name}}';
        const firstName = profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : '';
        const currentWeek = (workspace as any).current_week as number | null | undefined;
        const isAcceleration = workspace.program?.program_type === 'acceleration';

        return (
          <BrandSurface
            intensity="hero"
            className="surface-hero rounded-2xl p-4 sm:p-7 overflow-hidden animate-fade-in-up stagger-1"
          >

            <div className="flex items-start gap-3 sm:gap-4">
              <Avatar className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl border border-border/50 shrink-0">
                <AvatarImage src={workspace.startup?.logo_url || undefined} className="object-cover" alt={workspace.startup?.name || 'Startup'} />
                <AvatarFallback className="rounded-2xl bg-primary/10 text-primary text-sm font-semibold">
                  {workspace.startup?.name?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 space-y-2">
                <h1 className="text-display text-foreground break-words">
                  {t(greetingKey, { defaultValue: greetingDefault, name: firstName })}
                </h1>
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="text-heading text-foreground/90 break-words line-clamp-2 max-w-full">
                    {workspace.startup?.name}
                  </span>
                  <StageBadge stage={workspace.stage} size="sm" />
                  <HealthBadge score={health as HealthScore | null} size="sm" />
                </div>
                <p className="text-caption break-words">
                  {workspace.program?.name}
                  {isAcceleration && currentWeek
                    ? ` · ${t('founder.hero.week', { defaultValue: 'Semana {{n}}', n: currentWeek })}`
                    : ''}
                  {isBeginner
                    ? ` · ${t('founder.hero.calmHint', { defaultValue: 'hoje basta um passo.' })}`
                    : ''}
                </p>
                <WeeklyGreetingSubline
                  userId={profile?.id}
                  workspaceId={workspace.id}
                />
              </div>
            </div>
          </BrandSurface>

        );
      })()}



      {/* 2. Today's focus — THE single primary CTA */}
      <div className="animate-fade-in-up stagger-2">
        <OneThingToday workspace={workspace} isFirstWeek={isFirstWeek} />
      </div>

      {/* 2.5 My Support Team — relationship awareness */}
      {(!isBeginner || hasConsultant || hasMentor) && (
        <div className="animate-fade-in-up stagger-3">
          <MySupportTeamCard
            workspaceId={workspace.id}
            consultantId={workspaceOwner?.assigned_consultor_id ?? null}
            mentorMember={workspaceMembers?.find(m => m.role === 'mentor_externo') ?? null}
            lastSessionDate={workspace.lastSession?.scheduled_at ?? null}
          />
        </div>
      )}

      {/* 3. Consultant / next session */}
      <div className="animate-fade-in-up stagger-4">
        <FounderBookingCTA workspaceId={workspace.id} isFirstWeek={isFirstWeek} />
      </div>



      {/* Optional: compact "Your setup" checklist — only when onboarding is incomplete */}
      {!setupComplete && (
        <FounderWelcomePanel
          hasStartup={hasStartup}
          hasProfile={hasProfile}
          hasKpis={hasKpis}
          hasMentor={hasMentor}
          hasDocuments={hasDocuments}
          onCreateStartup={onCreateStartup}
          workspaceId={workspace.id}
          userId={profile?.id}
        />
      )}

      {/* ============================================================
          SHOW MORE PROGRESS DETAILS — collapsible advanced widgets
          ============================================================ */}
      <Collapsible open={advancedOpen} onOpenChange={handleAdvancedToggle}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="w-full justify-between text-sm text-muted-foreground hover:text-foreground border border-dashed border-border/60 rounded-xl"
          >
            <span>
              {advancedOpen
                ? t('founder.advanced.hide', { defaultValue: 'Esconder detalhes de progresso' })
                : t('founder.advanced.show', { defaultValue: 'Mostrar mais detalhes de progresso' })}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${advancedOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6 pt-4">
          {/* Startup Card */}
          <Card
            className="surface-raised overflow-hidden rounded-xl cursor-pointer animate-fade-in-up stagger-1"
            onClick={() => navigate(`/workspace/${workspace.id}`)}
          >
            <div className="bg-muted/40 p-4 sm:p-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-12 w-12 rounded-xl border border-border/50">
                  <AvatarImage src={workspace.startup?.logo_url || undefined} className="object-cover" alt={workspace.startup?.name || 'Startup logo'} />
                  <AvatarFallback className="rounded-xl bg-primary/10 text-primary text-sm font-semibold">
                    {workspace.startup?.name?.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold truncate mb-1">{workspace.startup?.name}</h2>
                  <div className="flex items-center gap-2 flex-wrap">
                    <StageBadge stage={workspace.stage} size="sm" />
                    <Badge variant="secondary" className="text-xs px-2 py-0.5 rounded-full border border-border/50">
                      {workspace.program?.name}
                    </Badge>
                    <HealthBadge score={health as HealthScore | null} size="sm" />
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); navigate(`/workspace/${workspace.id}`); }}
                  className={`text-xs shrink-0 ${isFirstWeek ? 'ring-2 ring-primary/30 motion-safe:animate-pulse-soft' : ''}`}
                >
                  {t('founder.openWorkspace')}
                </Button>
              </div>
            </div>
          </Card>

          {/* Readiness Strip */}
          <div className="animate-fade-in-up stagger-2">
            <WidgetErrorBoundary name="ReadinessStrip">
              <FounderReadinessStrip workspace={workspace} />
            </WidgetErrorBoundary>
          </div>

          {/* Progress Rings */}
          <div className="animate-fade-in-up stagger-3">
            <WidgetErrorBoundary name="ProgressRings">
              <FounderProgressRings workspaceId={workspace.id} />
            </WidgetErrorBoundary>
          </div>

          {/* Journey Map / Acceleration */}
          <div className="animate-fade-in-up stagger-4">
            <WidgetErrorBoundary name="JourneyMap">
              {workspace.program?.program_type === 'acceleration' ? (
                <AccelerationProgressCard
                  programId={workspace.program_id}
                  currentWeek={(workspace as any).current_week ?? null}
                  workspaceId={workspace.id}
                />
              ) : (
                <FounderJourneyMap currentStage={workspace.stage} />
              )}
            </WidgetErrorBoundary>
          </div>

          {/* Smart Nudges */}
          {nudges.length > 0 && (
            <div className="animate-fade-in-up stagger-5">
              <WidgetErrorBoundary name="SmartNudges">
                <SmartNudgeCard nudges={nudges} />
              </WidgetErrorBoundary>
            </div>
          )}

          {/* Story Timeline (Magic Moment) */}
          <div className="animate-fade-in-up stagger-5">
            <WidgetErrorBoundary name="FounderStoryTimeline">
              <FounderStoryTimeline workspaceId={workspace.id} />
            </WidgetErrorBoundary>
          </div>

          {/* Stage Progress + Investor Readiness + Calendar */}
          <div className="grid gap-6 md:grid-cols-2 animate-fade-in-up stagger-6">

            <div className="space-y-4">
              <StageProgressCard workspace={workspace} />
              <InvestorReadinessWidget workspaceId={workspace.id} compact />
            </div>
            <CalendarWidget />
          </div>

          {/* Streak */}
          <StreakHero streakWeeks={streakWeeks} />

          {/* Quick Guide — only one dismissible banner, only inside advanced */}
          {!isBeginner && <QuickGuideBanner />}
        </CollapsibleContent>
      </Collapsible>

      {/* Checklist Recovery Footer */}
      {canRestore && (
        <div className="flex justify-center pt-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleRestoreChecklist}
            className="text-xs text-muted-foreground hover:text-foreground gap-1.5"
          >
            <RotateCcw className="h-3 w-3" />
            {t('checklistRecovery.restoreChecklist', { defaultValue: 'Mostrar checklist de integração' })}
          </Button>
        </div>
      )}

      {/* Mobile Quick Actions FAB */}
      <QuickActionsFab
        onUpdateKpis={handleUpdateKpis}
        onAddAction={handleAddAction}
        onScheduleSession={handleScheduleSession}
      />

      {/* Quick KPI Modal (auto-triggered) */}
      {workspace && (
        <QuickKpiModal
          open={showQuickKpi}
          onOpenChange={(open) => {
            setShowQuickKpi(open);
            if (!open) {
              const dismissKey = `quickkpi-dismissed-${workspace.id}-${new Date().getFullYear()}-${new Date().getMonth()}`;
              sessionStorage.setItem(dismissKey, 'true');
            }
          }}
          workspaceId={workspace.id}
          programId={workspace.program_id}
        />
      )}

      <FounderHelpNudge
        workspaceId={workspace.id}
        hasConsultant={hasConsultant}
        pageLabel="founder_dashboard"
        aiStarterPrompt={t('founderHelpNudge.dashboardPrompt', {
          defaultValue: 'Estou no meu painel. Qual deveria ser o meu próximo passo?',
        })}
      />
    </div>
  );
});

function QuickGuideBanner() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem('shown_quickguide_founder') === 'true';
  });

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem('shown_quickguide_founder', 'true');
    setDismissed(true);
  };

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 shrink-0">
            <BookOpenCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              {t('quickGuideBanner.title', { defaultValue: 'Novo aqui? Consulta o Guia Rápido' })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('quickGuideBanner.description', { defaultValue: 'Aprende a tirar o máximo partido da plataforma passo a passo.' })}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { handleDismiss(); navigate('/guide'); }}
            className="shrink-0 gap-1.5"
          >
            {t('quickGuideBanner.cta', { defaultValue: 'Abrir Guia' })}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleDismiss}
            className="h-7 w-7 shrink-0 text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function getISOWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function WeeklyGreetingSubline({ userId, workspaceId }: { userId?: string; workspaceId: string }) {
  const { t } = useTranslation();
  const { data: actions } = useActionItems(workspaceId);
  const { data: sessions } = useUpcomingSessions();

  const weekKey = useMemo(() => {
    const now = new Date();
    return `greeted_this_week_${userId ?? 'anon'}_${now.getFullYear()}_${getISOWeek(now)}`;
  }, [userId]);

  const [isFirstOfWeek] = useState<boolean>(() => {
    try {
      if (sessionStorage.getItem(weekKey) === '1') return false;
      sessionStorage.setItem(weekKey, '1');
      return true;
    } catch {
      return false;
    }
  });

  if (!isFirstOfWeek) return null;

  const pending = (actions ?? []).filter((a) => a.status !== 'completed').length;
  const upcoming = (sessions ?? []).length;

  return (
    <p className="text-sm text-muted-foreground motion-safe:animate-fade-in">
      {t('founder.hero.weekly', {
        defaultValue: 'Boa semana! Tem {{actions}} ações pendentes e {{sessions}} sessões agendadas.',
        actions: pending,
        sessions: upcoming,
      })}
    </p>
  );
}
