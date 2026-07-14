import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format, isPast, isToday } from 'date-fns';
import { useDateLocale } from '@/lib/dateLocale';
import { 
  Calendar, CalendarDays, 
  CheckCircle2, 
  Target, 
  TrendingUp, 
  TrendingDown,
  FileText,
  Plus,
  Video,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { HealthBadge } from '@/components/ui/HealthBadge';
import { StageBadge } from '@/components/ui/StageBadge';
import { PrioritySelector } from '@/components/workspace/PrioritySelector';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useWorkspaceActions, useWorkspaceKpis, useWorkspaceMilestones, useWorkspaceNextSession, useWorkspaceSessions, useStages } from '@/hooks/useWorkspaceData';
import { HealthScorePanel } from '@/components/workspace/HealthScorePanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { WorkspaceOnboardingWizard } from '@/components/workspace/WorkspaceOnboardingWizard';
import { ProgressTimeline } from '@/components/workspace/ProgressTimeline';
import { ProgressReportView } from '@/components/workspace/ProgressReportView';
import { MonthlyCheckinBanner } from '@/components/checkins/MonthlyCheckinBanner';
import { PendingSurveysBanner } from '@/components/surveys/PendingSurveysBanner';
import { SurveyForm } from '@/components/surveys/SurveyForm';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { WorkspaceAlertsSection } from '@/components/workspace/WorkspaceAlertsSection';
import { HealthScoreCard } from '@/components/workspace/HealthScoreCard';
import { NextBestAction } from '@/components/workspace/NextBestAction';
import { JourneyHeader } from '@/components/workspace/JourneyHeader';
import { EnhancedNextSteps } from '@/components/workspace/EnhancedNextSteps';
import { MobileQuickActions } from '@/components/workspace/MobileQuickActions';
import { QuickKpiModal } from '@/components/workspace/QuickKpiModal';
import { AccelerationProgressCard } from '@/components/dashboard/AccelerationProgressCard';
import { InvestorReadinessChecklist } from '@/components/workspace/InvestorReadinessChecklist';
import { IncubationStatusCard } from '@/components/workspace/IncubationStatusCard';
import { OwnershipCard } from '@/components/workspace/OwnershipCard';
import { ResponsibleConsultantCard } from '@/components/workspace/ResponsibleConsultantCard';
import { PlaybookProgressWidget } from '@/components/workspace/PlaybookProgressWidget';
import { InteractionsCard } from '@/components/workspace/InteractionsCard';
import { LocationContractCard } from '@/components/workspace/LocationContractCard';
import { FirstContactPrepSheet } from '@/components/consultor/FirstContactPrepSheet';
import { TagPicker } from '@/components/tags/TagPicker';
import { useWorkspaceTags, useAddWorkspaceTag, useRemoveWorkspaceTag } from '@/hooks/useGlobalSearch';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { useAutoMaterializeDeliverables } from '@/hooks/useAutoMaterializeDeliverables';
import { notify } from '@/lib/notify';
import { StartupStage, HealthScore, WorkspacePriority } from '@/types/database';
import type { Database } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { FounderHelpNudge } from '@/components/founder/FounderHelpNudge';
import { useWorkspaceOwner } from '@/hooks/useWorkspaceOwner';
import { useWorkspaceMembers, useWorkspaceFounder } from '@/hooks/useWorkspaceMembers';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown } from 'lucide-react';
import { ProgramSwitcher } from '@/components/workspace/ProgramSwitcher';
import { PrivateDocumentsPanel } from '@/components/workspace/PrivateDocumentsPanel';
import { PlanAssistantsCard } from '@/components/workspace/PlanAssistantsCard';

interface WorkspaceOverviewProps {
  workspace: {
    id: string;
    startup_id: string;
    program_id: string;
    stage: StartupStage;
    stage_id: string | null;
    health_score: string | null;
    health_score_override: string | null;
    health_status: string | null;
    health_notes: string | null;
    priority_level?: WorkspacePriority;
    priority_notes?: string | null;
    current_week?: number | null;
    startup: { name: string; description: string | null; logo_url?: string | null } | null;
    program: { name: string; program_type?: string | null } | null;
  };
  canWrite: boolean;
}

export function WorkspaceOverview({ workspace, canWrite }: WorkspaceOverviewProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const [, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { roles, isConsultor, isAdmin, user, profile: authProfile } = useAuth();
  const isFounder = roles.includes('founder');
  const canSetPriority = isConsultor || isAdmin;
  const { data: actions, isLoading: actionsLoading } = useWorkspaceActions(workspace.id);
  const { data: kpiData, isLoading: kpisLoading } = useWorkspaceKpis(workspace.id);
  const { data: milestones, isLoading: milestonesLoading } = useWorkspaceMilestones(workspace.id);
  const { data: nextSession, isLoading: sessionLoading } = useWorkspaceNextSession(workspace.id);
  const { data: sessions, isLoading: sessionsLoading } = useWorkspaceSessions(workspace.id);
  const { data: stages } = useStages(workspace.program_id);
  const { data: workspaceTags = [] } = useWorkspaceTags(workspace.id);
  const addWorkspaceTag = useAddWorkspaceTag();
  const removeWorkspaceTag = useRemoveWorkspaceTag();
  const { data: workspaceOwner } = useWorkspaceOwner(workspace.id);
  const { data: workspaceMembersData } = useWorkspaceMembers(workspace.id);
  const { data: workspaceFounder } = useWorkspaceFounder(workspace.id);
  const isCurrentUserFounder = workspaceMembersData?.some(m => m.user_id === user?.id && m.role === 'founder');
  const founderProfile = workspaceFounder?.profile || (isCurrentUserFounder ? authProfile : undefined);
  const hasConsultant = Boolean(workspaceOwner?.assigned_consultor_id)
    || Boolean(workspaceMembersData?.some(m => m.role === 'consultor'));
  const [founderAdvancedOpen, setFounderAdvancedOpen] = useState(false);
  
  // Auto-materialize acceleration deliverables into workspace milestones/actions
  useAutoMaterializeDeliverables(workspace.id, workspace.program_id, workspace.program?.program_type ?? undefined);

  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [showQuickKpiModal, setShowQuickKpiModal] = useState(false);
  const [activeSurveyId, setActiveSurveyId] = useState<string | null>(null);
  const [showPrepSheet, setShowPrepSheet] = useState(false);
  const effectiveHealth = workspace.health_score_override || workspace.health_score;
  
  // Check if workspace is "empty" and should show onboarding prompt
  const isWorkspaceEmpty = !kpisLoading && !milestonesLoading && !sessionLoading &&
    (kpiData?.current.length === 0) && 
    (milestones?.length === 0) && 
    !nextSession;

  const handleStageChange = async (newStage: StartupStage) => {
    const { error } = await supabase
      .from('workspaces')
      .update({ stage: newStage })
      .eq('id', workspace.id);

    if (error) {
      notify.error(t('workspaceOverview.stageUpdateFailed', { defaultValue: 'Falha ao atualizar fase' }));
    } else {
      notify.success(t('workspaceOverview.stageUpdated', { defaultValue: 'Fase atualizada' }));
      queryClient.invalidateQueries({ queryKey: ['workspace', workspace.id] });
    }
  };

  // Calculate milestone counts
  const milestoneCounts = {
    planned: milestones?.filter(m => m.status === 'not_started').length || 0,
    inProgress: milestones?.filter(m => m.status === 'in_progress').length || 0,
    completed: milestones?.filter(m => m.status === 'completed').length || 0,
    delayed: milestones?.filter(m => m.status === 'delayed').length || 0,
  };
  
  // Calculate action counts
  const actionsCompleted = actions?.filter(a => a.status === 'completed').length || 0;
  const actionsTotal = actions?.length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardContent className="py-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-start gap-4">
              <Avatar className="h-14 w-14 rounded-xl">
                <AvatarImage src={workspace.startup?.logo_url || undefined} className="object-cover" />
                <AvatarFallback className="rounded-xl bg-primary/10 text-primary text-lg font-semibold">
                  {workspace.startup?.name?.slice(0, 2).toUpperCase() || '?'}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="font-heading text-2xl font-bold">{workspace.startup?.name}</h2>
                <p className="text-muted-foreground">{workspace.program?.name}</p>
                {founderProfile && (
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-xs text-muted-foreground">{t('workspaceOverview.founder', { defaultValue: 'Fundador' })}:</span>
                    <div className="flex items-center gap-1.5">
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={founderProfile.avatar_url || undefined} className="object-cover" />
                        <AvatarFallback className="bg-primary/10 text-primary text-[10px]">
                          {founderProfile.full_name?.slice(0, 2).toUpperCase() || founderProfile.email?.slice(0, 2).toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">
                        {founderProfile.full_name || founderProfile.email}
                      </span>
                    </div>
                  </div>
                )}
                {workspace.startup?.description && (
                  <p className="text-sm text-muted-foreground mt-1 max-w-xl line-clamp-2">
                    {workspace.startup.description}
                  </p>
                )}
                {/* Workspace Tags */}
                <div className="mt-2">
                  <TagPicker
                    selectedTags={workspaceTags}
                    onAddTag={(tagId) => addWorkspaceTag.mutate({ workspaceId: workspace.id, tagId })}
                    onRemoveTag={(tagId) => removeWorkspaceTag.mutate({ workspaceId: workspace.id, tagId })}
                    disabled={!canWrite}
                    placeholder={t('workspaceOverview.addTags', { defaultValue: 'Adicionar etiquetas...' })}
                    size="sm"
                  />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {/* Prep Sheet Button — Consultant/Admin only */}
              {(isConsultor || isAdmin) && (
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowPrepSheet(true)}>
                  <ClipboardList className="h-3.5 w-3.5" />
                  {t('workspaceOverview.prepSheet', { defaultValue: 'Preparar Reunião' })}
                </Button>
              )}
              {/* Progress Report Button */}
              <ProgressReportView 
                workspaceId={workspace.id} 
                workspace={workspace}
              />
              {canSetPriority && (
                <ProgramSwitcher
                  workspaceId={workspace.id}
                  currentProgramId={workspace.program_id}
                  size="sm"
                />
              )}
              {canWrite ? (
                <Select value={workspace.stage} onValueChange={(v) => handleStageChange(v as StartupStage)}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(stages && stages.length > 0 ? stages : [
                      { stage_key: 'ideation', name: t('stages.ideation', { defaultValue: 'Ideation' }) },
                      { stage_key: 'validation', name: t('stages.validation', { defaultValue: 'Validation' }) },
                      { stage_key: 'mvp', name: t('stages.mvp', { defaultValue: 'MVP' }) },
                      { stage_key: 'growth', name: t('stages.growth', { defaultValue: 'Growth' }) },
                      { stage_key: 'scale', name: t('stages.scale', { defaultValue: 'Scale' }) },
                    ]).map(stage => (
                      <SelectItem key={stage.stage_key} value={stage.stage_key}>
                        {stage.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <StageBadge stage={workspace.stage} />
              )}
              <HealthBadge score={effectiveHealth as HealthScore | null} size="lg" />
              {canSetPriority && (
                <PrioritySelector
                  workspaceId={workspace.id}
                  currentPriority={workspace.priority_level || 'standard'}
                  currentNotes={workspace.priority_notes}
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Journey Header - Stage + Health + Progress */}
      <JourneyHeader
        workspace={{
          id: workspace.id,
          program_id: workspace.program_id,
          stage: workspace.stage,
          health_score: workspace.health_score,
          health_score_override: workspace.health_score_override,
          health_notes: workspace.health_notes,
        }}
        nextSession={nextSession}
        actionsCompleted={actionsCompleted}
        actionsTotal={actionsTotal}
        milestonesCompleted={milestoneCounts.completed}
        milestonesTotal={(milestoneCounts.planned + milestoneCounts.inProgress + milestoneCounts.completed + milestoneCounts.delayed)}
        canWrite={canWrite}
      />

      {/* Acceleration Progress Card for acceleration programs */}
      {workspace.program?.program_type === 'acceleration' && (
        <AccelerationProgressCard
          programId={workspace.program_id}
          currentWeek={workspace.current_week ?? null}
          workspaceId={workspace.id}
        />
      )}

      {/* Incubation Status Card for incubation programs */}
      {workspace.program?.program_type === 'incubation' && (
        <IncubationStatusCard
          workspaceId={workspace.id}
        />
      )}

      {/* Enhanced Next Steps for Founders */}
      {isFounder && (
        <EnhancedNextSteps 
          workspaceId={workspace.id} 
          programId={workspace.program_id}
          stage={workspace.stage}
          canWrite={canWrite}
        />
      )}

      {/* AI Draft Monthly Update CTA - Founders only, advanced disclosure */}
      {isFounder && canWrite && founderAdvancedOpen && (
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-accent/5 rounded-2xl">
          <CardContent className="py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-sm">{t('workspace.aiDraftUpdate.title', { defaultValue: 'Rascunho de Atualização Mensal com IA' })}</p>
                <p className="text-xs text-muted-foreground">{t('workspace.aiDraftUpdate.description', { defaultValue: 'Sintetiza KPIs, marcos e sessões num resumo pronto a enviar.' })}</p>
              </div>
            </div>
            <Button 
              size="sm" 
              className="gap-1.5 shrink-0"
              onClick={() => setSearchParams({ tab: 'documents', sub: 'all' })}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t('workspace.aiDraftUpdate.cta', { defaultValue: 'Gerar Rascunho' })}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Monthly Check-in Banner for Founders — always visible (self-hides when nothing pending).
          Was gated behind advanced disclosure, which caused the "Submeter check-in" CTA
          from OneThingToday/EnhancedNextSteps/NextBestAction to dead-end. */}
      {isFounder && <MonthlyCheckinBanner workspaceId={workspace.id} />}

      {/* Pending Surveys Banner for Founders — self-hides when empty. */}
      {isFounder && (
        <PendingSurveysBanner 
          workspaceId={workspace.id} 
          onOpenSurvey={setActiveSurveyId} 
        />
      )}

      {/* Survey Form Dialog */}
      <Dialog open={!!activeSurveyId} onOpenChange={() => setActiveSurveyId(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('surveys.completeSurvey', { defaultValue: 'Completar Inquérito' })}</DialogTitle>
            <DialogDescription>
              {t('surveys.pendingSurveysDesc', { defaultValue: 'Tem inquéritos a aguardar resposta' })}
            </DialogDescription>
          </DialogHeader>
          {activeSurveyId && (
            <SurveyForm 
              instanceId={activeSurveyId} 
              onComplete={() => setActiveSurveyId(null)} 
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Onboarding Wizard */}
      <WorkspaceOnboardingWizard
        open={showOnboardingWizard}
        onOpenChange={setShowOnboardingWizard}
        workspaceId={workspace.id}
        stage={workspace.stage}
        startupName={workspace.startup?.name || 'Workspace'}
      />
      
      {/* Onboarding CTA for empty workspaces - FOUNDERS ONLY */}
      {isWorkspaceEmpty && canWrite && isFounder && (
        <Card className="border-dashed border-primary/50 bg-primary/5">
          <CardContent className="py-6">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{t('workspaceOverview.getStarted')}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t('workspaceOverview.getStartedDesc')}
                  </p>
                </div>
              </div>
              <Button onClick={() => setShowOnboardingWizard(true)}>
                <Sparkles className="h-4 w-4 mr-2" />
                {t('workspaceOverview.runSetupWizard')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Next Actions — staff cockpit (founders see EnhancedNextSteps above) */}
        {!isFounder && (
          <Card className="lg:col-span-1 cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSearchParams({ tab: 'milestones-actions' })}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  {t('workspaceOverview.nextActions')}
                </CardTitle>
                <Badge variant="secondary">{actions?.length || 0} {t('workspaceOverview.open')}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {actionsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-14" />)}
                </div>
              ) : actions?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>{t('workspaceOverview.allCaughtUp')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {actions?.slice(0, 5).map(action => (
                    <ActionItem key={action.id} action={action} />
                  ))}
                  {(actions?.length || 0) > 5 && (
                    <p className="text-xs text-muted-foreground text-center pt-2">
                      {t('workspaceOverview.moreActions', { count: (actions?.length || 0) - 5 })}
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* KPIs Snapshot — staff cockpit only above the fold */}
        {!isFounder && (
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSearchParams({ tab: 'kpis' })}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  {t('workspaceOverview.kpisSnapshot')}
                </CardTitle>
                {kpiData?.currentMonth && (
                  <Badge variant="outline">
                    {format(new Date(kpiData.currentMonth), 'MMM yyyy', { locale: dateLocale })}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {kpisLoading ? (
                <div className="grid grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-20" />)}
                </div>
              ) : kpiData?.current.length === 0 ? (
                <EmptyState
                  illustration="chart"
                  title={t('emptyStates.kpis.title')}
                  description={t('emptyStates.kpis.description')}
                  value={getKpiStageSuggestion(workspace.stage, t)}
                  action={{
                    label: t('workspaceOverview.addKpiEntry'),
                    onClick: () => setSearchParams({ tab: 'kpis' }),
                    icon: Plus,
                  }}
                />
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {kpiData?.current.slice(0, 6).map(kpi => (
                    <KpiCard
                      key={kpi.id}
                      kpi={kpi}
                      previousValue={kpiData.previous.find(
                        p => p.kpi_definition_id === kpi.kpi_definition_id
                      )?.value}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Milestones Summary — staff cockpit only above the fold */}
        {!isFounder && (
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSearchParams({ tab: 'milestones-actions' })}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                {t('milestones.title')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {milestonesLoading ? (
                <Skeleton className="h-24" />
              ) : milestones?.length === 0 ? (
                <EmptyState
                  illustration="rocket"
                  title={t('emptyStates.milestones.title')}
                  description={t('emptyStates.milestones.description')}
                  value={getMilestoneStageSuggestion(workspace.stage, t)}
                  action={{
                    label: t('workspace.addFirstMilestone'),
                    onClick: () => setSearchParams({ tab: 'milestones-actions' }),
                    icon: Plus,
                  }}
                />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <MilestoneCount label={t('workspaceOverview.planned')} count={milestoneCounts.planned} color="bg-muted" />
                  <MilestoneCount label={t('workspaceOverview.inProgressMilestone')} count={milestoneCounts.inProgress} color="bg-[hsl(var(--info))]/10 text-[hsl(var(--info))]" />
                  <MilestoneCount label={t('workspaceOverview.completedMilestone')} count={milestoneCounts.completed} color="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" />
                  <MilestoneCount label={t('workspaceOverview.delayed')} count={milestoneCounts.delayed} color="bg-destructive/10 text-destructive" />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Progress Timeline — staff cockpit only above the fold (founders see it inside Show more) */}
        {!isFounder && (
          <ProgressTimeline workspaceId={workspace.id} programId={workspace.program_id} programType={workspace.program?.program_type} currentWeek={(workspace as any).current_week ?? null} />
        )}

        {/* Health Score Card — staff prominent */}
        {(isConsultor || isAdmin) && (
          <HealthScoreCard workspaceId={workspace.id} programId={workspace.program_id} canManage={canWrite} />
        )}

        {/* Ownership & SLA — staff */}
        {(isConsultor || isAdmin) && (
          <OwnershipCard workspaceId={workspace.id} />
        )}

        {/* Location & Contract — staff */}
        {(isConsultor || isAdmin) && (
          <LocationContractCard workspaceId={workspace.id} />
        )}

        {/* Private Documents (CC, IBAN, signatures) — staff only */}
        {(isConsultor || isAdmin) && (
          <PrivateDocumentsPanel workspaceId={workspace.id} />
        )}

        {/* Workspace Alerts — staff */}
        {(isConsultor || isAdmin) && (
          <WorkspaceAlertsSection workspaceId={workspace.id} canManage={canWrite} />
        )}

        {/* Responsible Consultant Card — PRIMARY for founders */}
        {isFounder && (
          <div className="lg:col-span-2">
            <ResponsibleConsultantCard workspaceId={workspace.id} />
          </div>
        )}

        {/* Founder advanced widgets — progressively disclosed */}
        {isFounder && (
          <div className="lg:col-span-2">
            <Collapsible open={founderAdvancedOpen} onOpenChange={setFounderAdvancedOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-between text-sm text-muted-foreground hover:text-foreground border border-dashed border-border/60 rounded-xl"
                >
                  <span>
                    {founderAdvancedOpen
                      ? t('founder.advanced.hide', { defaultValue: 'Esconder detalhes de progresso' })
                      : t('founder.advanced.show', { defaultValue: 'Mostrar mais detalhes de progresso' })}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${founderAdvancedOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="grid gap-6 lg:grid-cols-2 pt-4">
                <ProgressTimeline workspaceId={workspace.id} programId={workspace.program_id} programType={workspace.program?.program_type} currentWeek={(workspace as any).current_week ?? null} />
                <PlaybookProgressWidget workspaceId={workspace.id} />
                <InvestorReadinessChecklist workspaceId={workspace.id} canWrite={canWrite} />
                <HealthScoreCard workspaceId={workspace.id} programId={workspace.program_id} canManage={false} />
                <InteractionsCard
                  workspaceId={workspace.id}
                  onViewAll={() => setSearchParams({ tab: 'communications' })}
                />
                <LocationContractCard workspaceId={workspace.id} />
                <WorkspaceAlertsSection workspaceId={workspace.id} canManage={canWrite} />
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </div>

      {/* Quick KPI Modal */}
      <QuickKpiModal
        open={showQuickKpiModal}
        onOpenChange={setShowQuickKpiModal}
        workspaceId={workspace.id}
        programId={workspace.program_id}
      />

      {/* Recent Sessions - Full Width. For founders, only when "Show more" is open. */}
      {(!isFounder || founderAdvancedOpen) && (
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSearchParams({ tab: 'agenda' })}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                {t('workspaceOverview.recentSessions')}
              </CardTitle>
              <Badge variant="secondary">{sessions?.length || 0} {t('sessions.title').toLowerCase()}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {sessionsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : sessions?.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>{t('workspaceOverview.noSessionsRecorded')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sessions?.map(session => (
                  <SessionItem key={session.id} session={session} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Mobile Quick Actions FAB for Founders */}
      {isFounder && canWrite && (
        <MobileQuickActions
          workspaceId={workspace.id}
          programId={workspace.program_id}
          onAddAction={() => setSearchParams({ tab: 'milestones-actions' })}
          onRequestSession={() => setSearchParams({ tab: 'agenda' })}
          className="md:hidden"
        />
      )}

      {/* First Contact Prep Sheet — Consultant/Admin */}
      {(isConsultor || isAdmin) && (
        <FirstContactPrepSheet
          open={showPrepSheet}
          onOpenChange={setShowPrepSheet}
          workspaceId={workspace.id}
        />
      )}

      {isFounder && (
        <FounderHelpNudge
          workspaceId={workspace.id}
          hasConsultant={hasConsultant}
          pageLabel="workspace_overview"
          aiStarterPrompt={`Estou no workspace da ${workspace.startup?.name || 'minha startup'}. Por onde devo continuar?`}
        />
      )}
    </div>
  );
}

function ActionItem({ action }: { action: any }) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const isOverdue = action.due_date && isPast(new Date(action.due_date)) && !isToday(new Date(action.due_date));
  const isDueToday = action.due_date && isToday(new Date(action.due_date));

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors">
      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${
        action.status === 'in_progress' ? 'bg-[hsl(var(--info))]' : 
        isOverdue ? 'bg-destructive' : 
        isDueToday ? 'bg-[hsl(var(--warning))]' : 'bg-muted-foreground'
      }`} />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{action.title}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {action.due_date && (
            <span className={isOverdue ? 'text-destructive font-medium' : isDueToday ? 'text-[hsl(var(--warning))] font-medium' : ''}>
              {isOverdue ? t('workspaceOverview.overduePrefix', { defaultValue: 'Em atraso: ' }) : isDueToday ? t('workspaceOverview.today', { defaultValue: 'Hoje' }) : ''}
              {!isDueToday && format(new Date(action.due_date), 'dd MMM', { locale: dateLocale })}
            </span>
          )}
          {action.priority && action.priority !== 'medium' && (
            <Badge variant={action.priority === 'urgent' || action.priority === 'high' ? 'destructive' : 'secondary'} className="text-[10px] px-1 py-0">
              {action.priority}
            </Badge>
          )}
        </div>
      </div>
      {action.owner && (
        <Avatar className="h-6 w-6">
          <AvatarImage src={action.owner.avatar_url} />
          <AvatarFallback className="text-[10px]">
            {action.owner.full_name?.slice(0, 2).toUpperCase() || '?'}
          </AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

function KpiCard({ kpi, previousValue }: { kpi: any; previousValue?: number | null }) {
  const definition = kpi.kpi_definition;
  const currentValue = kpi.value;
  const hasChange = previousValue != null && currentValue != null;
  
  let trend: 'up' | 'down' | 'neutral' = 'neutral';
  let trendPercent = 0;
  
  if (hasChange && previousValue !== 0) {
    trendPercent = ((currentValue - previousValue) / Math.abs(previousValue)) * 100;
    trend = trendPercent > 0 ? 'up' : trendPercent < 0 ? 'down' : 'neutral';
  }

  // Determine if trend is good based on direction
  const isGoodTrend = definition?.direction === 'up' ? trend === 'up' : 
                      definition?.direction === 'down' ? trend === 'down' : true;

  const formatValue = (val: number) => {
    if (definition?.unit === '%') return `${val.toFixed(1)}%`;
    if (definition?.unit === '€' || definition?.unit === '$') {
      if (val >= 1000000) return `${definition.unit}${(val/1000000).toFixed(1)}M`;
      if (val >= 1000) return `${definition.unit}${(val/1000).toFixed(0)}k`;
      return `${definition.unit}${val.toFixed(0)}`;
    }
    return val.toLocaleString();
  };

  return (
    <div className="p-3 rounded-lg bg-muted/50 cursor-pointer hover:bg-muted transition-colors">
      <p className="text-xs text-muted-foreground mb-1 truncate">{definition?.name || 'KPI'}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-xl font-bold">
          {currentValue != null ? formatValue(currentValue) : '-'}
        </p>
        {hasChange && trend !== 'neutral' && (
          <div className={`flex items-center text-xs ${isGoodTrend ? 'text-[hsl(var(--success))]' : 'text-destructive'}`}>
            {trend === 'up' ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            <span className="ml-0.5">{Math.abs(trendPercent).toFixed(0)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MilestoneCount({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className={`p-3 rounded-lg text-center cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all ${color}`}>
      <p className="text-2xl font-bold">{count}</p>
      <p className="text-xs">{label}</p>
    </div>
  );
}

function SessionItem({ session }: { session: any }) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  return (
    <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <FileText className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{session.title}</p>
        <p className="text-sm text-muted-foreground">
          {format(new Date(session.scheduled_at), 'dd MMM yyyy', { locale: dateLocale })}
          {session.duration && ` • ${session.duration} min`}
        </p>
      </div>
      {session.notes && (
        <Badge variant="secondary" className="flex-shrink-0">
          {t('workspaceOverview.hasNotes', { defaultValue: 'Com notas' })}
        </Badge>
      )}
    </div>
  );
}

function getKpiStageSuggestion(stage: string, t: any): string {
  const suggestions: Record<string, string> = {
    ideation: t('emptyStates.kpis.stageIdeation', { defaultValue: '💡 Sugestão: Comece com "Entrevistas realizadas" e "Hipóteses validadas"' }),
    validation: t('emptyStates.kpis.stageValidation', { defaultValue: '🧪 Sugestão: Acompanhe "Utilizadores piloto" e "NPS"' }),
    mvp: t('emptyStates.kpis.stageMvp', { defaultValue: '🚀 Sugestão: Meça "MRR", "Churn" e "CAC"' }),
    growth: t('emptyStates.kpis.stageGrowth', { defaultValue: '📈 Sugestão: Foque em "MRR", "LTV/CAC" e "Burn Rate"' }),
    scale: t('emptyStates.kpis.stageScale', { defaultValue: '🏆 Sugestão: Monitorize "ARR", "Margem Bruta" e "NDR"' }),
  };
  return suggestions[stage] || suggestions.ideation;
}

function getMilestoneStageSuggestion(stage: string, t: any): string {
  const suggestions: Record<string, string> = {
    ideation: t('emptyStates.milestones.stageIdeation', { defaultValue: '💡 Comece com: "Completar 10 entrevistas de descoberta"' }),
    validation: t('emptyStates.milestones.stageValidation', { defaultValue: '🧪 Comece com: "Lançar piloto com 20 utilizadores"' }),
    mvp: t('emptyStates.milestones.stageMvp', { defaultValue: '🚀 Comece com: "Atingir 50 clientes pagantes"' }),
    growth: t('emptyStates.milestones.stageGrowth', { defaultValue: '📈 Comece com: "Atingir 10K€ MRR"' }),
    scale: t('emptyStates.milestones.stageScale', { defaultValue: '🏆 Comece com: "Fechar ronda Series A"' }),
  };
  return suggestions[stage] || suggestions.ideation;
}
