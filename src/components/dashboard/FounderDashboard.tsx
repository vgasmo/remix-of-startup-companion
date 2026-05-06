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
import { NextBestAction } from '@/components/workspace/NextBestAction';
import { InvestorReadinessWidget } from '@/components/workspace/InvestorReadinessWidget';
import { QuickActionsFab } from '@/components/workspace/QuickActionsFab';
import { QuickKpiModal } from '@/components/workspace/QuickKpiModal';
import { AiPulseCard } from '@/components/dashboard/AiPulseCard';
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
import { NextBestActionFounder } from '@/components/dashboard/NextBestActionPanels';

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

  // Auto-materialize acceleration deliverables into workspace milestones/actions
  useAutoMaterializeDeliverables(workspace?.id, workspace?.program_id, workspace?.program?.program_type ?? undefined);
  const hasMentor = useMemo(() => {
    if (!workspaceMembers) return false;
    return workspaceMembers.some(m => m.role === 'mentor_externo');
  }, [workspaceMembers]);
  
  const hasProfile = Boolean(profile?.full_name);
  const hasStartup = Boolean(workspace);
  const hasKpis = Boolean(workspace?.hasCurrentMonthKpi);
  const hasDocuments = Boolean(workspace?.lastSession);

  // Founder maturity drives progressive disclosure.
  const { maturity, isBeginner, showAdvancedByDefault } = useFounderMaturity(workspace);
  const setupComplete = hasProfile && hasStartup && hasKpis && hasDocuments;
  const [advancedOpen, setAdvancedOpen] = useState(showAdvancedByDefault);

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

      {/* ★ READINESS STRIP — Quick status overview ★ */}
      <WidgetErrorBoundary name="ReadinessStrip">
        <FounderReadinessStrip workspace={workspace} />
      </WidgetErrorBoundary>

      {/* Stream F: Next Best Action (read-only, derived) */}
      <WidgetErrorBoundary name="NextBestActionFounder">
        <NextBestActionFounder workspace={workspace} />
      </WidgetErrorBoundary>

      {/* ★ PROGRESS RINGS — Visual health at a glance ★ */}
      <WidgetErrorBoundary name="ProgressRings">
        <FounderProgressRings workspaceId={workspace.id} />
      </WidgetErrorBoundary>

      {/* ★ PENDING CONTRACT — High-priority CTA for unsigned contracts ★ */}
      <WidgetErrorBoundary name="PendingContract">
        <PendingContractBanner workspaceId={workspace.id} />
      </WidgetErrorBoundary>

      {/* ★ JOURNEY MAP / ACCELERATION PROGRESS — Adaptive to program type ★ */}
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

      {/* ★ HERO: Next Best Actions — the ABSOLUTE FIRST thing founders see ★ */}
      <NextBestAction
        workspaceId={workspace.id}
        programId={workspace.program_id}
        stage={workspace.stage}
        canWrite={true}
      />

      {/* ★ Smart Nudges — passive AI suggestions ★ */}
      {nudges.length > 0 && (
        <WidgetErrorBoundary name="SmartNudges">
          <SmartNudgeCard nudges={nudges} />
        </WidgetErrorBoundary>
      )}

      {/* Welcome Panel with Checklist (dismissible) */}
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

      <section className="space-y-4">
        {/* One Thing Today - Single focus action */}
        <OneThingToday workspace={workspace} />

        {/* PRIMARY BOOKING CTA */}
        <FounderBookingCTA workspaceId={workspace.id} />
      </section>

      {/* Quick Guide Banner */}
      <QuickGuideBanner />

      {/* Startup Card - Journey-first */}
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
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-lg font-semibold truncate">{workspace.startup?.name}</h1>
              </div>
              <div className="flex items-center gap-2">
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

      {/* Progress + Calendar */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-4">
          <StageProgressCard workspace={workspace} />
          <InvestorReadinessWidget workspaceId={workspace.id} compact />
        </div>
        <CalendarWidget />
      </div>

      {/* Streak */}
      <StreakHero streakWeeks={streakWeeks} />

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