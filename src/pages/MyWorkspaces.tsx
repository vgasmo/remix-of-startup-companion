/* HMR refresh v2 */
import { useState, useMemo, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  AlertTriangle, 
  Calendar,
  TrendingUp,
  FileText,
  AlertCircle,
  Clock,
  Plus,
  Users,
  ArrowRight,
  X,
  Rocket,
} from 'lucide-react';
import { isToday } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ViewMode } from '@/components/ui/ViewToggle';
import { QuickFilterChips, QuickFilter } from '@/components/ui/QuickFilterChips';
import { WorkspaceCard } from '@/components/dashboard/WorkspaceCard';
import { ConsultorDashboard } from '@/components/dashboard/ConsultorDashboard';
import { AdminDashboard } from '@/components/dashboard/AdminDashboard';
import { MentorDashboard } from '@/components/dashboard/MentorDashboard';
import { FounderDashboard } from '@/components/dashboard/FounderDashboard';
import { CreateStartupDialog } from '@/components/founder/CreateStartupDialog';
import { SmartImportDialog } from '@/components/founder/SmartImportDialog';
import { ClaimedWorkspaceBanner } from '@/components/founder/ClaimedWorkspaceBanner';
import { WorkspaceFilters } from '@/components/workspace/WorkspaceFilters';
import { WorkspaceTable } from '@/components/workspace/WorkspaceTable';
import { WorkspacePagination } from '@/components/workspace/WorkspacePagination';
import { WorkspaceEmptyState } from '@/components/workspace/WorkspaceEmptyState';
import { OnboardingTour } from '@/components/ui/OnboardingTour';
import { SavedFiltersDropdown } from '@/components/workspace/SavedFiltersDropdown';
import { useWorkspaces, usePrograms, useMyPendingWorkspaces, WorkspaceWithDetails, SortOption, WorkspaceFilters as WorkspaceFiltersType } from '@/hooks/useWorkspaces';
import { useRealtimeWorkspaces } from '@/hooks/useRealtimeWorkspaces';
import { useSavedFilters } from '@/hooks/useSavedFilters';
import { StartupStage, HealthScore, WorkspacePriority } from '@/types/database';
import { useAuth } from '@/contexts/AuthContext';
import { useFounderOnboardingState } from '@/hooks/useFounderOnboardingState';

const PAGE_SIZE = 15;

export default function MyWorkspaces() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isConsultor, isMentor, isAdmin, roles } = useAuth();
  const isFounder = roles.includes('founder');
  const isExternalMentor = roles.includes('mentor_externo') && !isConsultor && !isAdmin;
  const founderState = useFounderOnboardingState();
  
  // Consultant view mode - assigned only by default (not for admins)
  const [showAssignedOnly, setShowAssignedOnly] = useState(isConsultor && !isAdmin);
  // Admin can toggle between Admin dashboard and Portfolio view
  const [adminViewMode, setAdminViewMode] = useState<'admin' | 'portfolio'>('admin');
  
  // Filter state
  const [search, setSearch] = useState('');
  const [programFilter, setProgramFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<StartupStage | 'all'>('all');
  const [healthFilter, setHealthFilter] = useState<HealthScore | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<WorkspacePriority | 'all'>('all');
  const [missingKpi, setMissingKpi] = useState(false);
  const [overdueActions, setOverdueActions] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('priority');
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('table');
  const [quickFilters, setQuickFilters] = useState<Record<string, boolean>>({});
  const [showCreateStartup, setShowCreateStartup] = useState(false);
  const [showSmartImport, setShowSmartImport] = useState(false);
  const [showDetailedView, setShowDetailedView] = useState(false);

  // Handle URL filter parameter
  useEffect(() => {
    const filterParam = searchParams.get('filter');
    if (filterParam === 'attention') {
      setQuickFilters({ critical: true, at_risk: true, overdue: true });
      setShowDetailedView(true);
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Enable realtime updates
  useRealtimeWorkspaces();

  // Load saved filters
  const { data: savedFilters } = useSavedFilters();
  
  // Apply default saved filter on load
  useEffect(() => {
    const defaultFilter = savedFilters?.find(f => f.is_default);
    if (defaultFilter && !search && programFilter === 'all' && stageFilter === 'all' && healthFilter === 'all') {
      applyFilters(defaultFilter.filters);
    }
  }, [savedFilters]);

  const applyFilters = useCallback((filters: WorkspaceFiltersType) => {
    setSearch(filters.search || '');
    setProgramFilter(filters.programId || 'all');
    setStageFilter(filters.stage || 'all');
    setHealthFilter(filters.health || 'all');
    setMissingKpi(filters.missingKpi || false);
    setOverdueActions(filters.overdueActions || false);
    if (filters.sortBy) setSortBy(filters.sortBy);
    setCurrentPage(1);
  }, []);

  // Determine which dashboard to show
  const showAdminDashboard = isAdmin && !showDetailedView && adminViewMode === 'admin';
  const showConsultorDashboard = (isConsultor || (isAdmin && adminViewMode === 'portfolio')) && !isAdmin ? !showDetailedView : (isAdmin && adminViewMode === 'portfolio' && !showDetailedView);
  const showMentorDashboard = isExternalMentor && !showDetailedView;
  const showFounderDashboard = isFounder && !isConsultor && !isAdmin && !isExternalMentor && !showDetailedView;
  const showListView = showDetailedView || (!showAdminDashboard && !showConsultorDashboard && !showMentorDashboard && !showFounderDashboard);

  const { data: programs } = usePrograms();
  
  // Founders see active + claimed workspaces; staff sees only operationally active
  const founderStatuses: ('active' | 'claimed')[] = ['active', 'claimed'];
  const staffStatuses: ('active')[] = ['active'];
  const workspaceStatuses = (isFounder && !isConsultor && !isAdmin) ? founderStatuses : staffStatuses;

  // Use assigned workspaces for consultors if showAssignedOnly is true
  const { data: workspaces, isLoading, error } = useWorkspaces({
    search,
    programId: programFilter,
    stage: stageFilter,
    health: healthFilter,
    priority: priorityFilter,
    missingKpi,
    overdueActions,
    sortBy,
  }, showAssignedOnly, workspaceStatuses);
  
  const { data: pendingWorkspaces } = useMyPendingWorkspaces();

  // Calculate dashboard stats
  const dashboardStats = useMemo(() => {
    if (!workspaces) return null;
    
    const healthCounts = { critical: 0, at_risk: 0, stable: 0, healthy: 0, thriving: 0 };
    let meetingsTodayCount = 0;
    let overdueCount = 0;
    
    workspaces.forEach(w => {
      const health = w.health_score_override || w.health_score || 'stable';
      if (health in healthCounts) {
        healthCounts[health as keyof typeof healthCounts]++;
      }
      if (w.nextMeetingDate && isToday(new Date(w.nextMeetingDate))) {
        meetingsTodayCount++;
      }
      if (w.overdueActionsCount > 0) {
        overdueCount++;
      }
    });
    
    return { healthCounts, meetingsTodayCount, overdueCount };
  }, [workspaces]);

  // Quick filter chips data
  const quickFilterChips: QuickFilter[] = useMemo(() => {
    if (!dashboardStats) return [];
    return [
      { id: 'critical', label: t('health.levels.critical', { defaultValue: 'Crítico' }), icon: <AlertCircle className="h-3.5 w-3.5" />, count: dashboardStats.healthCounts.critical, variant: 'destructive' as const, active: quickFilters.critical || false },
      { id: 'at_risk', label: t('health.levels.at_risk', { defaultValue: 'Em Risco' }), icon: <AlertTriangle className="h-3.5 w-3.5" />, count: dashboardStats.healthCounts.at_risk, variant: 'warning' as const, active: quickFilters.at_risk || false },
      { id: 'overdue', label: t('filters.overdueActions', { defaultValue: 'Ações em atraso' }), icon: <Clock className="h-3.5 w-3.5" />, count: dashboardStats.overdueCount, variant: 'destructive' as const, active: quickFilters.overdue || false },
      { id: 'meetings_today', label: t('filters.meetingsToday', { defaultValue: 'Reuniões hoje' }), icon: <Calendar className="h-3.5 w-3.5" />, count: dashboardStats.meetingsTodayCount, variant: 'default' as const, active: quickFilters.meetings_today || false },
    ];
  }, [dashboardStats, quickFilters, t]);

  // Apply quick filters to workspaces
  const filteredWorkspaces = useMemo(() => {
    if (!workspaces) return [];
    let filtered = [...workspaces];

    // Health chips (critical/at_risk) are OR (union) — selecting both shows either
    const healthQuickFilters = [quickFilters.critical && 'critical', quickFilters.at_risk && 'at_risk'].filter(Boolean) as string[];
    if (healthQuickFilters.length > 0) {
      filtered = filtered.filter(w => healthQuickFilters.includes(w.health_score_override || w.health_score || 'stable'));
    }

    // Overdue and meetings_today are AND — combine with health
    if (quickFilters.overdue) {
      filtered = filtered.filter(w => w.overdueActionsCount > 0);
    }
    if (quickFilters.meetings_today) {
      filtered = filtered.filter(w => w.nextMeetingDate && isToday(new Date(w.nextMeetingDate)));
    }

    return filtered;
  }, [workspaces, quickFilters]);

  // Pagination
  const totalItems = filteredWorkspaces.length;
  const totalPages = Math.ceil(totalItems / PAGE_SIZE);
  const paginatedWorkspaces = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredWorkspaces.slice(start, start + PAGE_SIZE);
  }, [filteredWorkspaces, currentPage]);

  // Callbacks
  const handleFilterChange = useCallback(() => setCurrentPage(1), []);
  
  const handleQuickFilterToggle = useCallback((id: string) => {
    setQuickFilters(prev => ({ ...prev, [id]: !prev[id] }));
    handleFilterChange();
  }, [handleFilterChange]);

  const activeFiltersCount = [
    programFilter !== 'all',
    stageFilter !== 'all',
    healthFilter !== 'all',
    missingKpi,
    overdueActions,
  ].filter(Boolean).length;

  const activeQuickFiltersCount = Object.values(quickFilters).filter(Boolean).length;

  const clearFilters = useCallback(() => {
    setProgramFilter('all');
    setStageFilter('all');
    setHealthFilter('all');
    setMissingKpi(false);
    setOverdueActions(false);
    setQuickFilters({});
    handleFilterChange();
  }, [handleFilterChange]);

  const handleRowClick = useCallback((workspaceId: string) => {
    navigate(`/workspace/${workspaceId}`);
  }, [navigate]);

  // Page title/subtitle
  const getPageTitle = () => {
    if (showDetailedView) return t('myWorkspaces.allStartups');
    if (showAdminDashboard) return t('admin.commandCenter');
    if (showConsultorDashboard) return t('myWorkspaces.portfolioOverview');
    if (showMentorDashboard) return t('myWorkspaces.myMentorships');
    if (showFounderDashboard) {
      const onlyWorkspace = (workspaces || []).length === 1 ? (workspaces || [])[0] : null;
      return onlyWorkspace?.startup?.name || t('myWorkspaces.myStartup');
    }
    return t('myWorkspaces.title');
  };

  const getPageSubtitle = () => {
    if (showDetailedView) return t('myWorkspaces.startupsCount', { count: totalItems });
    if (showAdminDashboard) return undefined;
    if (showConsultorDashboard) return t('myWorkspaces.managingStartups', { count: workspaces?.length || 0 });
    if (showMentorDashboard) return t('myWorkspaces.activeMentorships', { count: workspaces?.length || 0 });
    return undefined;
  };

  return (
    <AppLayout 
      title={getPageTitle()}
      subtitle={getPageSubtitle()}
      actions={
        <div className="flex items-center gap-2">
          {/* Founder: Open workspace button when they have exactly 1 */}
          {isFounder && !showDetailedView && (workspaces || []).length === 1 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate(`/workspace/${(workspaces || [])[0].id}`)}
              className="gap-2"
              aria-label={t('founder.openWorkspace', 'Abrir')}
            >
              <ArrowRight className="h-4 w-4" />
              <span className="hidden sm:inline">{t('founder.openWorkspace', 'Abrir')}</span>
            </Button>
          )}
          {/* Consultor: toggle assigned/all startups */}
          {isConsultor && !isAdmin && (
            <Button 
              variant={showAssignedOnly ? "default" : "outline"} 
              size="sm" 
              onClick={() => setShowAssignedOnly(!showAssignedOnly)}
              className="gap-2"
            >
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">{showAssignedOnly ? t('myWorkspaces.myPortfolio') : t('myWorkspaces.allStartups')}</span>
            </Button>
          )}
          {/* View All button for staff dashboards */}
          {(showAdminDashboard || showConsultorDashboard || showMentorDashboard) && (
            <Button variant="outline" size="sm" onClick={() => setShowDetailedView(true)} className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">{t('myWorkspaces.viewAll')}</span>
            </Button>
          )}
          {/* Founder: View All button when they have workspaces */}
          {showFounderDashboard && (workspaces || []).length > 0 && (
            <Button variant="outline" size="sm" onClick={() => setShowDetailedView(true)} className="gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">{t('myWorkspaces.viewAll')}</span>
            </Button>
          )}
          {/* Back to dashboard button when in detailed view */}
          {showDetailedView && (
            <Button variant="outline" size="sm" onClick={() => { setShowDetailedView(false); if (isAdmin) setAdminViewMode('admin'); }} className="gap-2">
              <TrendingUp className="h-4 w-4" />
              <span className="hidden sm:inline">{t('myWorkspaces.dashboard')}</span>
            </Button>
          )}
          {/* Smart Import: founders + staff (consultants/admins) */}
          {(isFounder || isConsultor || isAdmin) && !showMentorDashboard && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSmartImport(true)}
              className="gap-2"
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">{t('smartImport.button', { defaultValue: 'Smart Import (PDF)' })}</span>
              <span className="sm:hidden">{t('smartImport.shortButton', { defaultValue: 'Smart Import' })}</span>
            </Button>
          )}
          {/* P0.1: Claim-first — show "Verify Startup" for founders with no workspaces. Route gate handles redirect, this is a safety fallback. */}
          {isFounder && !showConsultorDashboard && !showMentorDashboard && (workspaces || []).length === 0 && (
            <Button onClick={() => navigate('/claim-startup')} className="gap-2" data-tour="create-workspace">
              <Rocket className="h-4 w-4" />
              <span className="hidden sm:inline">{t('founder.claimFirst.cta', { defaultValue: 'Verificar a Minha Startup' })}</span>
              <span className="sm:hidden">{t('common.verify', { defaultValue: 'Verificar' })}</span>
            </Button>
          )}
        </div>
      }
    >
      <OnboardingTour />
      <CreateStartupDialog open={showCreateStartup} onOpenChange={setShowCreateStartup} />
      <SmartImportDialog open={showSmartImport} onOpenChange={setShowSmartImport} />

      {/* Claimed/Pending state banner for founders */}
      {isFounder && !isConsultor && !isAdmin && founderState.status !== 'loading' && founderState.status !== 'not_founder' && founderState.status !== 'staff_exempt' && (
        (() => {
          // LOCAL detection: even if founderState says "has_active_workspace",
          // check if the actual workspace is "claimed" (not truly active yet).
          const hasClaimedOnly = founderState.status === 'has_active_workspace' &&
            workspaces && workspaces.length > 0 &&
            workspaces.every(w => (w as any).status === 'claimed');
          const showBanner = founderState.status !== 'has_active_workspace' || hasClaimedOnly;
          if (!showBanner) return null;
          return (
            <div className="mb-4">
              {hasClaimedOnly ? (
                <ClaimedWorkspaceBanner founderState={{ ...founderState, status: 'has_pending_workspace', startupName: workspaces[0]?.startup?.name || founderState.startupName }} />
              ) : (
                <ClaimedWorkspaceBanner founderState={founderState} />
              )}
            </div>
          );
        })()
      )}

      {/* Role-Specific Dashboards */}
      {showAdminDashboard && (
        <AdminDashboard 
          workspaces={workspaces || []} 
          isLoading={isLoading} 
          programsCount={programs?.length || 0} 
          onSwitchToPortfolio={() => setAdminViewMode('portfolio')}
        />
      )}
      {showConsultorDashboard && (
        <ConsultorDashboard workspaces={workspaces || []} isLoading={isLoading} programsCount={programs?.length || 0} />
      )}
      {showMentorDashboard && (
        <MentorDashboard workspaces={workspaces || []} isLoading={isLoading} />
      )}
      {showFounderDashboard && (
        <FounderDashboard 
          workspaces={workspaces || []} 
          pendingWorkspaces={pendingWorkspaces || []} 
          isLoading={isLoading} 
          onCreateStartup={() => setShowCreateStartup(true)} 
        />
      )}

      {/* Detailed List View */}
      {showListView && (
        <>
          {/* Quick Filter Chips */}
          {dashboardStats && !isLoading && (
            <div className="mb-4 animate-fade-in flex items-center gap-3 flex-wrap">
              <QuickFilterChips filters={quickFilterChips} onToggle={handleQuickFilterToggle} />
              {activeQuickFiltersCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setQuickFilters({})}
                  className="gap-1.5 text-muted-foreground hover:text-foreground h-8"
                >
                  <X className="h-3.5 w-3.5" />
                  {t('filters.clearQuickFilters', { defaultValue: 'Limpar filtros rápidos' })}
                </Button>
              )}
            </div>
          )}

          {/* Filters */}
          <div data-tour="filters">
            <WorkspaceFilters
              search={search}
              onSearchChange={(v) => { setSearch(v); handleFilterChange(); }}
              programFilter={programFilter}
              onProgramFilterChange={(v) => { setProgramFilter(v); handleFilterChange(); }}
              stageFilter={stageFilter}
              onStageFilterChange={(v) => { setStageFilter(v); handleFilterChange(); }}
              healthFilter={healthFilter}
              onHealthFilterChange={(v) => { setHealthFilter(v); handleFilterChange(); }}
              priorityFilter={priorityFilter}
              onPriorityFilterChange={(v) => { setPriorityFilter(v); handleFilterChange(); }}
              missingKpi={missingKpi}
              onMissingKpiChange={(v) => { setMissingKpi(v); handleFilterChange(); }}
              overdueActions={overdueActions}
              onOverdueActionsChange={(v) => { setOverdueActions(v); handleFilterChange(); }}
              sortBy={sortBy}
              onSortByChange={(v) => { setSortBy(v); handleFilterChange(); }}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              programs={programs || []}
              activeFiltersCount={activeFiltersCount}
              activeQuickFiltersCount={activeQuickFiltersCount}
              onClearFilters={clearFilters}
            />
            <div className="mt-2 flex justify-end">
              <SavedFiltersDropdown 
                currentFilters={{ search, programId: programFilter, stage: stageFilter, health: healthFilter, missingKpi, overdueActions, sortBy }}
                onApplyFilter={applyFilters}
              />
            </div>
          </div>

          {/* Content */}
          {isLoading ? (
            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : error ? (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="flex items-center gap-3 p-6">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <p className="text-destructive">{t('myWorkspaces.loadError')}</p>
              </CardContent>
            </Card>
          ) : filteredWorkspaces.length === 0 ? (
            <WorkspaceEmptyState
              hasFilters={search !== '' || activeFiltersCount > 0 || activeQuickFiltersCount > 0}
              onClearFilters={clearFilters}
              isFounder={isFounder}
              onCreateStartup={() => setShowCreateStartup(true)}
            />
          ) : viewMode === 'card' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {paginatedWorkspaces.map((workspace) => (
                  <WorkspaceCard
                    key={workspace.id}
                    workspace={workspace}
                    onClick={() => handleRowClick(workspace.id)}
                  />
                ))}
              </div>
              <WorkspacePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={totalItems}
                pageSize={PAGE_SIZE}
                onPageChange={setCurrentPage}
                variant="compact"
              />
            </>
          ) : (
            <Card>
              <CardContent className="p-0">
                <WorkspaceTable workspaces={paginatedWorkspaces} onRowClick={handleRowClick} />
                <WorkspacePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  pageSize={PAGE_SIZE}
                  onPageChange={setCurrentPage}
                />
              </CardContent>
            </Card>
          )}
        </>
      )}
    </AppLayout>
  );
}

