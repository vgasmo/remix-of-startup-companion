import { useState, useEffect, useMemo, useCallback, KeyboardEvent } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Copy, MoreHorizontal, ChevronDown } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAutoMaterializeDeliverables } from '@/hooks/useAutoMaterializeDeliverables';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AccessDenied } from '@/components/ui/AccessDenied';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WorkspaceOverview } from '@/components/workspace/WorkspaceOverview';
import { AgendaTab } from '@/components/workspace/AgendaTab';
import { MilestonesActionsTab } from '@/components/workspace/MilestonesActionsTab';
import { KpisTab } from '@/components/workspace/KpisTab';
import { WidgetErrorBoundary } from '@/components/ui/WidgetErrorBoundary';
// TemplatesTab now rendered inside DocumentsTab as sub-tab
import { DocumentsTab } from '@/components/workspace/DocumentsTab';
import { StartupSettingsTab } from '@/components/workspace/StartupSettingsTab';
import { FundingTrackerTab } from '@/components/workspace/FundingTrackerTab';
import { NotesAndTasksTab } from '@/components/workspace/NotesAndTasksTab';
import { TeamTab } from '@/components/workspace/TeamTab';
// DataroomTab now rendered inside DocumentsTab as sub-tab
import { TimeTrackingTab } from '@/components/workspace/TimeTrackingTab';
import { PlaybooksTab } from '@/components/workspace/PlaybooksTab';
import { ChatTab } from '@/components/workspace/ChatTab';
import { GovernanceTab } from '@/components/workspace/GovernanceTab';
import { BenchmarkDashboard } from '@/components/workspace/BenchmarkDashboard';
import { RelationshipRecapCard } from '@/components/workspace/RelationshipRecapCard';
import { WorkspaceEmailHistoryPanel } from '@/components/workspace/WorkspaceEmailHistoryPanel';
import { PendingWorkspaceView } from '@/components/workspace/PendingWorkspaceView';
import { WorkspaceOnboardingWizard } from '@/components/workspace/WorkspaceOnboardingWizard';
import { useWorkspace } from '@/hooks/useWorkspaces';
import { useAuth } from '@/contexts/AuthContext';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { getVisibleTabs, type WorkspaceTab } from '@/lib/workspaceTabs';
import { useWorkspaceTabBadges } from '@/hooks/useWorkspaceTabBadges';
import { useTrackEngagement, type EngagementTargetType } from '@/hooks/useEngagementEvents';

// Map workspace tab IDs → engagement target types (Phase 7D/7E)
const TAB_TO_TARGET: Record<string, EngagementTargetType> = {
  'kpis': 'kpi',
  'milestones-actions': 'milestone',
  'milestones': 'milestone',
  'actions': 'action',
  'agenda': 'session',
  'documents': 'document',
};

export default function WorkspaceDetail() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const { data: workspace, isLoading, error } = useWorkspace(id);
  const { isAdmin, isConsultor, isMentor, isFounder, isBackoffice, isStaff } = useAuth();
  
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const shouldShowOnboarding = searchParams.get('onboarding') === 'true';
  const canWrite = isAdmin || isConsultor || isMentor || isFounder;
  const tabBadges = useWorkspaceTabBadges(id);

  // Auto-materialize acceleration deliverables at page level (not tab-dependent)
  const programType = workspace?.program ? (workspace.program as { program_type?: string }).program_type : undefined;
  useAutoMaterializeDeliverables(workspace?.id, workspace?.program_id, programType);
  
  useEffect(() => {
    if (shouldShowOnboarding && workspace && isFounder) {
      setShowOnboardingWizard(true);
      searchParams.delete('onboarding');
      setSearchParams(searchParams, { replace: true });
    }
  }, [shouldShowOnboarding, workspace, isFounder, searchParams, setSearchParams]);

  // Extract startup/program early for tab computation
  const startup = workspace?.startup as { id: string; name: string; description: string | null; website: string | null; logo_url: string | null; founded_date: string | null; phone: string | null; address: string | null; nif: string | null; main_contact_name: string | null; main_contact_email: string | null; main_contact_phone: string | null; has_startup_portugal_status: boolean | null; startup_portugal_document_path: string | null } | null ?? null;
  const program = workspace ? (workspace.program as { name: string; program_type?: string } | null) : null;

  // Compute visible tabs
  const { primaryTabs, overflowTabs } = useMemo(
    () => getVisibleTabs({ isAdmin, isConsultor, isMentor, isFounder, isBackoffice }, !!startup, workspace?.stage),
    [isAdmin, isConsultor, isMentor, isFounder, isBackoffice, !!startup, workspace?.stage]
  );
  const allVisibleIds = useMemo(
    () => new Set([...primaryTabs, ...overflowTabs].map(t => t.id)),
    [primaryTabs, overflowTabs]
  );

  // URL-synced tab state
  const currentTab = searchParams.get('tab') || 'overview';
  
  // Redirect legacy tabs
  useEffect(() => {
    if (currentTab === 'dataroom') {
      setSearchParams({ tab: 'documents', sub: 'dataroom' }, { replace: true });
    } else if (currentTab === 'sessions' || currentTab === 'calendar') {
      setSearchParams({ tab: 'agenda' }, { replace: true });
    } else if (currentTab === 'milestones-actions-actions') {
      // Legacy token from older links/emails — canonical is milestones-actions + sub=actions
      setSearchParams({ tab: 'milestones-actions', sub: 'actions' }, { replace: true });
    }
  }, [currentTab, setSearchParams]);
  
  const activeTab = allVisibleIds.has(currentTab) ? currentTab : 'overview';
  
  const handleTabChange = useCallback((value: string) => {
    setSearchParams({ tab: value }, { replace: true });
    // Reset scroll so users land at the top of the newly selected tab content.
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'auto' });
      });
    }
  }, [setSearchParams]);

  // Phase 7D/7E: fire a view event when the user lands on a trackable tab.
  const trackEngagement = useTrackEngagement(id);
  useEffect(() => {
    const targetType = TAB_TO_TARGET[activeTab];
    if (!id || !targetType) return;
    trackEngagement.mutate({ eventType: 'view', targetType, metadata: { tab: activeTab } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, activeTab]);

  // Keyboard navigation for tabs (WAI-ARIA)
  const handleTabKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>, tabs: WorkspaceTab[]) => {
    const currentIndex = tabs.findIndex(t => t.id === activeTab);
    if (currentIndex === -1) return;
    
    let nextIndex = -1;
    if (e.key === 'ArrowRight') {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      nextIndex = 0;
    } else if (e.key === 'End') {
      nextIndex = tabs.length - 1;
    }
    
    if (nextIndex >= 0) {
      e.preventDefault();
      handleTabChange(tabs[nextIndex].id);
      // Focus the next tab button
      const tablist = (e.currentTarget as HTMLElement).closest('[role="tablist"]');
      const buttons = tablist?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      buttons?.[nextIndex]?.focus();
    }
  }, [activeTab, handleTabChange]);

  if (isLoading) {
    return (
      <AppLayout title={t('common.loading')}>
        <div className="space-y-6">
          {/* Structural skeleton matching workspace layout */}
          <Skeleton className="h-10 w-full rounded-md" />
          <Skeleton className="h-32 w-full rounded-lg" />
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
            </div>
            <div className="space-y-3">
              <Skeleton className="h-24 rounded-lg" />
              <div className="grid grid-cols-2 gap-3">
                {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
              </div>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (!workspace || error) {
    return (
      <AppLayout title="Workspace">
        <AccessDenied 
          title={t('workspace.notAccessible')}
          message={t('workspace.noPermission')}
        />
      </AppLayout>
    );
  }

  const workspaceStatus = (workspace as any).status as string | undefined;
  const isPendingWorkspace = workspaceStatus === 'pending';
  
  
  if (isPendingWorkspace && !isStaff && isFounder) {
    return (
      <AppLayout title={startup?.name || 'Workspace'}>
        <PendingWorkspaceView 
          workspace={{
            id: workspace.id,
            stage: workspace.stage,
            created_at: workspace.created_at,
            startup: startup ? { name: startup.name, description: startup.description } : null,
            program: program,
          }}
        />
      </AppLayout>
    );
  }

  const copyWorkspaceLink = () => {
    navigator.clipboard.writeText(window.location.href);
    notify.success(t('common.linkCopied'));
  };

  const isOverflowTabActive = overflowTabs.some(tab => tab.id === activeTab);

  return (
    <AppLayout
      title={startup?.name || 'Workspace'}
      subtitle={program?.name}
      actions={
        <div className="flex gap-1 sm:gap-2">
          <Button variant="outline" size="sm" onClick={copyWorkspaceLink} className="px-2 sm:px-3">
            <Copy className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t('common.copyLink')}</span>
          </Button>
        </div>
      }
    >
      {/* Breadcrumbs */}
      <Breadcrumbs 
        className="mb-4"
        items={[
          { label: t('nav.workspaces'), href: '/my-workspaces' },
          { label: startup?.name || 'Workspace' },
        ]}
      />

      {/* ── WAI-ARIA Tablist ── */}
      <div className="space-y-6">
        <div 
          role="tablist" 
          aria-label={t('workspace.tabs', { defaultValue: 'Workspace sections' })}
          className="bg-muted/30 h-auto gap-0.5 p-1 flex items-center rounded-md overflow-x-auto scrollbar-thin"
        >
          {/* Primary tabs */}
          {primaryTabs.map(tab => (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`tabpanel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => handleTabChange(tab.id)}
              onKeyDown={(e) => handleTabKeyDown(e, primaryTabs)}
              className={cn(
                "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm font-medium ring-offset-background transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1",
                "disabled:pointer-events-none disabled:opacity-50",
                activeTab === tab.id
                  ? "bg-primary/10 text-primary shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-background/50"
              )}
            >
              {t(tab.labelKey)}
              {tabBadges[tab.id] ? (
                <span className="ml-1.5 inline-flex items-center justify-center h-4 min-w-[1rem] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-none">
                  {tabBadges[tab.id] > 99 ? '99+' : tabBadges[tab.id]}
                </span>
              ) : null}
            </button>
          ))}

          {/* Overflow "More" dropdown - only if there are overflow tabs */}
          {overflowTabs.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 py-1.5 text-xs sm:text-sm font-medium gap-1 transition-all",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 focus-visible:ring-offset-1",
                    isOverflowTabActive
                      ? "bg-primary/10 text-primary shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                  )}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="hidden sm:inline">
                    {isOverflowTabActive 
                      ? t(overflowTabs.find(t => t.id === activeTab)?.labelKey || 'common.moreDetails')
                      : t('common.moreDetails', { defaultValue: 'Mais' })
                    }
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                {overflowTabs.map(tab => (
                  <DropdownMenuItem 
                    key={tab.id}
                    onClick={() => handleTabChange(tab.id)} 
                    className={activeTab === tab.id ? 'bg-accent' : ''}
                  >
                    <tab.icon className="h-4 w-4 mr-2" />
                    {t(tab.labelKey)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* ── Tab Panels ── */}
        <div className="animate-fade-in">
          {activeTab === 'overview' && (
            <div role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview">
              {/* AI Relationship Recap — visible to staff only */}
              {isStaff && (
                <div className="mb-6 space-y-4">
                  <RelationshipRecapCard workspaceId={workspace.id} />
                  <WorkspaceEmailHistoryPanel workspaceId={workspace.id} />
                </div>
              )}
              <WorkspaceOverview 
                workspace={{
                  id: workspace.id,
                  startup_id: workspace.startup_id,
                  program_id: workspace.program_id,
                  stage: workspace.stage,
                  stage_id: workspace.stage_id || null,
                  health_score: workspace.health_score,
                  health_score_override: workspace.health_score_override,
                  health_status: workspace.health_status || null,
                  health_notes: workspace.health_notes,
                  startup: startup,
                  program: program,
                  current_week: (workspace as any).current_week ?? null,
                }}
                canWrite={canWrite}
              />
            </div>
          )}
          {(activeTab === 'milestones-actions' || activeTab === 'milestones' || activeTab === 'actions') && (
            <div role="tabpanel" id="tabpanel-milestones-actions" aria-labelledby="tab-milestones-actions">
              <WidgetErrorBoundary name="MilestonesActions">
                <MilestonesActionsTab workspaceId={workspace.id} canWrite={canWrite} isStaff={isStaff} programId={workspace.program_id} programType={programType} currentWeek={(workspace as any).current_week ?? null} />
              </WidgetErrorBoundary>
            </div>
          )}
          {activeTab === 'agenda' && (
            <div role="tabpanel" id="tabpanel-agenda" aria-labelledby="tab-agenda">
              <AgendaTab workspaceId={workspace.id} canWrite={canWrite} startupName={startup?.name} />
            </div>
          )}
          {activeTab === 'documents' && (
            <div role="tabpanel" id="tabpanel-documents" aria-labelledby="tab-documents">
              <WidgetErrorBoundary name="Documents">
                <DocumentsTab workspaceId={workspace.id} canWrite={canWrite} isFounder={isFounder} isStaff={isStaff} isMentor={isMentor} />
              </WidgetErrorBoundary>
            </div>
          )}
          {activeTab === 'kpis' && (
            <div role="tabpanel" id="tabpanel-kpis" aria-labelledby="tab-kpis">
              <WidgetErrorBoundary name="KPIs">
                <KpisTab workspaceId={workspace.id} canWrite={canWrite} />
              </WidgetErrorBoundary>
            </div>
          )}
          {activeTab === 'playbooks' && (
            <div role="tabpanel" id="tabpanel-playbooks" aria-labelledby="tab-playbooks">
              <PlaybooksTab 
                workspaceId={workspace.id} 
                programId={workspace.program_id} 
                currentStage={workspace.stage} 
                canWrite={canWrite} 
              />
            </div>
          )}
          {activeTab === 'chat' && (
            <div role="tabpanel" id="tabpanel-chat" aria-labelledby="tab-chat">
              <ChatTab workspaceId={workspace.id} />
            </div>
          )}
          {activeTab === 'benchmark' && isFounder && (
            <div role="tabpanel" id="tabpanel-benchmark" aria-labelledby="tab-benchmark">
              <BenchmarkDashboard
                workspaceId={workspace.id}
                programId={workspace.program_id}
                currentStage={workspace.stage}
                myHealthScore={null}
                myMilestonesCompleted={0}
                myActionsCompleted={0}
              /> 
            </div>
          )}
          {/* templates tab absorbed into documents sub-tabs */}
          {/* calendar tab absorbed into agenda */}
          {/* dataroom absorbed into documents sub-tabs */}
          {activeTab === 'governance' && (
            <div role="tabpanel" id="tabpanel-governance" aria-labelledby="tab-governance">
              <GovernanceTab 
                workspaceId={workspace.id} 
                programId={workspace.program_id}
                currentStage={workspace.stage}
                canWrite={canWrite}
              />
            </div>
          )}
          {activeTab === 'team' && isFounder && startup && (
            <div role="tabpanel" id="tabpanel-team" aria-labelledby="tab-team">
              <TeamTab startupId={startup.id} canEdit={canWrite} />
            </div>
          )}
          {activeTab === 'funding' && isFounder && startup && (
            <div role="tabpanel" id="tabpanel-funding" aria-labelledby="tab-funding">
              <FundingTrackerTab startupId={startup.id} />
            </div>
          )}
          {activeTab === 'notes' && (isAdmin || isConsultor || isMentor || isBackoffice) && (
            <div role="tabpanel" id="tabpanel-notes" aria-labelledby="tab-notes">
              <NotesAndTasksTab workspaceId={workspace.id} startupId={startup?.id} />
            </div>
          )}
          {activeTab === 'time' && (isAdmin || isConsultor) && (
            <div role="tabpanel" id="tabpanel-time" aria-labelledby="tab-time">
              <TimeTrackingTab workspaceId={workspace.id} />
            </div>
          )}
          {activeTab === 'settings' && startup && (
            <div role="tabpanel" id="tabpanel-settings" aria-labelledby="tab-settings">
              <StartupSettingsTab
                workspaceId={workspace.id}
                startupId={workspace.startup_id}
                startup={startup}
                canEdit={canWrite}
              />
            </div>
          )}
        </div>
      </div>
      
      {/* Founder Onboarding Wizard */}
      {startup && (
        <WorkspaceOnboardingWizard
          open={showOnboardingWizard}
          onOpenChange={setShowOnboardingWizard}
          workspaceId={workspace.id}
          startupId={startup.id}
          stage={workspace.stage}
          startupName={startup.name}
          website={startup.website || ''}
          mainContactName={startup.main_contact_name || ''}
          mainContactEmail={startup.main_contact_email || ''}
          nif={startup.nif || ''}
          isFounderOnboarding={isFounder}
        />
      )}
    </AppLayout>
  );
}
