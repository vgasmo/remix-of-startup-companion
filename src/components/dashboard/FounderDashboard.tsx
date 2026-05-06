import { useMemo, useEffect, useState } from 'react';
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
import { toast } from 'sonner';
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
import { useAutoMaterializeDeliverables } from '@/hooks/useAutoMaterializeDeliverables';
import { FounderHelpNudge } from '@/components/founder/FounderHelpNudge';
import { useWorkspaceOwner } from '@/hooks/useWorkspaceOwner';
// NextBestActionFounder removed from beginner view — kept available for power users via OneThingToday.

interface FounderDashboardProps {
  workspaces: WorkspaceWithDetails[];
  pendingWorkspaces: PendingWorkspace[];
  isLoading: boolean;
  onCreateStartup: () => void;
}

export function FounderDashboard({ 
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
    toast.success(t('checklistRecovery.restored', { defaultValue: 'Checklist reposta com sucesso' }));
  };

  useEffect(() => {
    recordActivity();
  }, []);

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
  const [advancedOpen, setAdvancedOpen] = useState(showAdvancedByDefault);
  const [advancedUserToggled, setAdvancedUserToggled] = useState(false);

  // Sync default disclosure as maturity is computed (e.g., async data arrives),
  // but never override an explicit user toggle.
  useEffect(() => {
    if (!advancedUserToggled) setAdvancedOpen(showAdvancedByDefault);
  }, [showAdvancedByDefault, advancedUserToggled]);

  const handleAdvancedToggle = (open: boolean) => {
    setAdvancedUserToggled(true);
    setAdvancedOpen(open);
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
    <div className="space-y-6 max-w-5xl">
      <FounderWelcomeWizard workspaceId={workspace?.id ?? null} />
      {/* Multi-workspace notice */}
      {workspaces.length > 1 && (
        <Card className="border-primary/20 bg-primary/5 rounded-2xl">
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                <Rocket className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">
                  {t('founder.multiWorkspace.title', { defaultValue: 'Tem {{count}} startups associadas', count: workspaces.length })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('founder.multiWorkspace.hint', { defaultValue: 'Está a ver "{{name}}". Selecione outra abaixo.', name: workspace?.startup?.name || '' })}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                {workspaces.map((ws, idx) => (
                  <Button
                    key={ws.id}
                    variant={idx === selectedWorkspaceIdx ? 'default' : 'outline'}
                    size="sm"
                    className="text-xs h-7 px-2.5"
                    onClick={() => setSelectedWorkspaceIdx(idx)}
                  >
                    {ws.startup?.name?.slice(0, 12) || `Startup ${idx + 1}`}
                  </Button>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ★ PENDING CONTRACT — High-priority, blocks everything else when present ★ */}
      <WidgetErrorBoundary name="PendingContract">
        <PendingContractBanner workspaceId={workspace.id} />
      </WidgetErrorBoundary>

      {/* ============================================================
          PRIMARY CALM SCREEN — max 3 cards for beginners
          1) Welcome / context hero
          2) Today's focus (single next-action)
          3) Consultant / next session card
          (+ optional compact setup checklist if incomplete)
          ============================================================ */}

      {/* 1. Warm welcome / context hero */}
      {isBeginner && (
        <Card className="overflow-hidden border-border/60 rounded-2xl shadow-sm">
          <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 sm:p-6">
            <div className="flex items-center gap-4">
              <Avatar className="h-12 w-12 rounded-xl border border-border/50">
                <AvatarImage src={workspace.startup?.logo_url || undefined} className="object-cover" alt={workspace.startup?.name || 'Startup'} />
                <AvatarFallback className="rounded-xl bg-primary/10 text-primary text-sm font-semibold">
                  {workspace.startup?.name?.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground mb-0.5">
                  {t('founder.calmHero.eyebrow', { defaultValue: 'O teu espaço de startup' })}
                </p>
                <h1 className="text-lg sm:text-xl font-semibold truncate">
                  {t('founder.calmHero.greeting', { defaultValue: 'Olá{{name}}, hoje basta um passo.', name: profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : '' })}
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 line-clamp-2">
                  {t('founder.calmHero.subtitle', { defaultValue: 'Sem pressa. Vamos avançar uma coisa de cada vez — e estamos aqui para ajudar.' })}
                </p>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 2. Today's focus — THE single primary CTA */}
      <OneThingToday workspace={workspace} />

      {/* 3. Consultant / next session */}
      <FounderBookingCTA workspaceId={workspace.id} />

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
            className="overflow-hidden border-border/60 rounded-2xl shadow-sm cursor-pointer hover:shadow-md transition-shadow"
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
                  className="text-xs shrink-0"
                >
                  {t('founder.openWorkspace')}
                </Button>
              </div>
            </div>
          </Card>

          {/* Readiness Strip */}
          <WidgetErrorBoundary name="ReadinessStrip">
            <FounderReadinessStrip workspace={workspace} />
          </WidgetErrorBoundary>

          {/* Progress Rings */}
          <WidgetErrorBoundary name="ProgressRings">
            <FounderProgressRings workspaceId={workspace.id} />
          </WidgetErrorBoundary>

          {/* Journey Map / Acceleration */}
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

          {/* Smart Nudges */}
          {nudges.length > 0 && (
            <WidgetErrorBoundary name="SmartNudges">
              <SmartNudgeCard nudges={nudges} />
            </WidgetErrorBoundary>
          )}

          {/* Stage Progress + Investor Readiness + Calendar */}
          <div className="grid gap-6 md:grid-cols-2">
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
}

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