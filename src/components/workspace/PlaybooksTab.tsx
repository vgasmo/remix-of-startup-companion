import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Play, CheckCircle, X, Target, ListTodo, Clock, TrendingUp, Rocket, Sparkles, ArrowRight, MessageSquarePlus, Settings, BookOpen, HelpCircle, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { usePlaybooksForStage, useInstantiatePlaybook, useDismissPlaybook, useRestorePlaybook, useWorkspacePlaybookInstances, Playbook, PlaybookItem } from '@/hooks/usePlaybooks';
import { usePlaybookProgress } from '@/hooks/usePlaybookProgress';
import { RequestPlaybookDialog } from '@/components/workspace/RequestPlaybookDialog';
import { PlaybookEvidenceDialog } from '@/components/workspace/PlaybookEvidenceDialog';
import { formatShortDate } from '@/lib/dateUtils';
import { useAuth } from '@/contexts/AuthContext';
import { useConsultantNotes } from '@/hooks/useConsultantNotes';
import { notify } from "@/lib/notify";
import type { Database } from '@/integrations/supabase/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type StartupStage = Database['public']['Enums']['startup_stage'];

interface PlaybooksTabProps {
  workspaceId: string;
  programId?: string;
  currentStage?: StartupStage;
  canWrite?: boolean;
}

export function PlaybooksTab({ workspaceId, currentStage, programId, canWrite }: PlaybooksTabProps) {
  const { t } = useTranslation();
  const [, setSearchParams] = useSearchParams();
  const { isConsultor, isAdmin, user } = useAuth();
  const isStaff = isConsultor || isAdmin;
  
  const stage = currentStage || 'ideation';
  const { data: playbooks, isLoading } = usePlaybooksForStage(stage, programId);
  const { data: instances } = useWorkspacePlaybookInstances(workspaceId);
  const { data: progress } = usePlaybookProgress(workspaceId);
  const { data: consultantNotes } = useConsultantNotes(workspaceId);
  const instantiate = useInstantiatePlaybook();
  const dismiss = useDismissPlaybook();
  const restorePlaybook = useRestorePlaybook();

  const getInstanceStatus = (playbookId: string) => {
    return instances?.find(i => i.playbook_id === playbookId)?.status;
  };

  // Check if founder has requested a specific playbook (via consultant_notes)
  const hasRequestedPlaybook = (playbookId: string) => {
    if (!consultantNotes || !user) return false;
    return consultantNotes.some(note => 
      note.author_id === user.id && 
      note.content.includes('[PLAYBOOK_REQUEST]') &&
      note.content.includes(`playbook_id=${playbookId}`)
    );
  };

  // Get stage display name with i18n
  const getStageLabel = (stageKey: string) => {
    return t(`playbooks.stages.${stageKey}`, stageKey.charAt(0).toUpperCase() + stageKey.slice(1));
  };

  // Handle staff deploy with confirmation
  const handleDeploy = (playbookId: string, playbookTitle: string, milestonesCount: number, actionsCount: number) => {
    instantiate.mutate(
      { workspaceId, playbookId },
      {
        onSuccess: () => {
          notify.success(t('playbooks.staff.deploySuccess', { 
            milestones: milestonesCount, 
            actions: actionsCount 
          }));
        },
        onError: (error: Error) => {
          if (error.message.includes('already')) {
            notify.info(t('playbooks.staff.alreadyDeployed'));
          } else {
            notify.error(t('playbooks.staff.deployFailed'));
          }
        }
      }
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  const availablePlaybooks = playbooks?.filter(p => getInstanceStatus(p.id) !== 'instantiated' && (p.items?.length ?? 0) > 0) || [];
  const instantiatedPlaybooks = instances?.filter(i => i.status === 'instantiated') || [];

  // Extract KPI hints from playbook items metadata
  const getKpiHints = (items: PlaybookItem[] | undefined) => {
    if (!items) return [];
    const kpis = new Set<string>();
    items.forEach(item => {
      const meta = item.metadata_json as Record<string, unknown>;
      if (meta?.kpi_names) {
        (meta.kpi_names as string[]).forEach(k => kpis.add(k));
      }
      if (meta?.kpi_categories) {
        (meta.kpi_categories as string[]).forEach(k => kpis.add(`${t('playbooks.category')}: ${k}`));
      }
    });
    return Array.from(kpis);
  };

  // No playbooks available at all - show appropriate empty state
  if (!playbooks?.length && !instantiatedPlaybooks.length) {
    return (
      <div className="space-y-6">
        <EmptyState
          icon={Rocket}
          title={isStaff ? t('playbooks.staff.emptyTitle') : t('playbooks.emptyTitle')}
          description={isStaff ? t('playbooks.staff.emptyDescription') : t('playbooks.emptyDescription')}
          value={isStaff ? t('playbooks.staff.emptyValue') : t('playbooks.emptyValue')}
        />
        {canWrite && !isStaff && (
          <div className="flex justify-center">
            <RequestPlaybookDialog workspaceId={workspaceId} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Role-based intro card */}
      {isStaff ? (
        // Staff/Consultant view - Management focused
        <Card className="bg-gradient-to-r from-accent/5 to-primary/5 border-accent/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full p-2 bg-accent/10">
                <Settings className="h-5 w-5 text-accent-foreground" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1">
                  {t('playbooks.staff.introTitle')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('playbooks.staff.introDescription')}
                </p>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className="gap-1">
                  <BookOpen className="h-3 w-3" />
                  {availablePlaybooks.length} {t('playbooks.staff.available')}
                </Badge>
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {instantiatedPlaybooks.length} {t('playbooks.staff.deployed')}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        // Founder view - Benefit/value focused
        <Card className="bg-gradient-to-r from-primary/5 to-accent/5 border-primary/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full p-2 bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-foreground mb-1">
                  {t('playbooks.introTitle')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('playbooks.introDescription')}
                </p>
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <HelpCircle className="h-3 w-3" />
                  {t('playbooks.founderHint')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Available/Recommended Playbooks */}
      {availablePlaybooks.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            {isStaff 
              ? t('playbooks.staff.availableFor', { stage: getStageLabel(stage) })
              : t('playbooks.recommended', { stage: getStageLabel(stage) })
            }
          </h3>

          <div className="grid gap-4 md:grid-cols-2">
            {availablePlaybooks.map(playbook => {
              const status = getInstanceStatus(playbook.id);
              const isDismissed = status === 'dismissed';
              const milestones = playbook.items?.filter(i => i.item_type === 'milestone') || [];
              const actions = playbook.items?.filter(i => i.item_type === 'action') || [];
              const kpiHints = getKpiHints(playbook.items);
              const isRequested = hasRequestedPlaybook(playbook.id);
              const estimatedWeeks = Math.max(1, Math.ceil((milestones.length + actions.length) / 4));

              return (
                <Card 
                  key={playbook.id} 
                  className={`hover:shadow-md transition-shadow group ${isDismissed ? 'opacity-60' : ''}`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-lg group-hover:text-primary transition-colors">
                          {playbook.title}
                        </CardTitle>
                        <CardDescription className="line-clamp-2">{playbook.description}</CardDescription>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        {isDismissed && (
                          <Badge variant="secondary" className="text-muted-foreground">
                            {t('playbooks.dismissed')}
                          </Badge>
                        )}
                        {isRequested && !isStaff && !isDismissed && (
                          <Badge variant="outline" className="gap-1 border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))]">
                            <Clock className="h-3 w-3" />
                            {t('playbooks.requested')}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {/* Value metadata - what this creates */}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                      <span className="flex items-center gap-1">
                        <Target className="h-4 w-4 text-primary" />
                        {t('playbooks.milestonesCount', { count: milestones.length })}
                      </span>
                      <span className="flex items-center gap-1">
                        <ListTodo className="h-4 w-4 text-primary" />
                        {t('playbooks.actionsCount', { count: actions.length })}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        {t('playbooks.effortEstimate', { weeks: estimatedWeeks })}
                      </span>
                    </div>

                    {/* KPI Connections - show value */}
                    {kpiHints.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-3">
                        <TrendingUp className="h-3 w-3 text-primary mt-0.5" />
                        {kpiHints.slice(0, 4).map((kpi, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs py-0">
                            {kpi}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Preview items */}
                    {playbook.items && playbook.items.length > 0 && !isDismissed && (
                      <div className="mb-4 p-3 rounded-lg bg-muted/50 max-h-40 overflow-y-auto">
                        <p className="text-xs font-medium mb-2">{t('playbooks.preview')}:</p>
                        {playbook.items.slice(0, 5).map((item) => (
                          <div key={item.id} className="flex items-center gap-2 text-xs py-1">
                            {item.item_type === 'milestone' ? (
                              <Target className="h-3 w-3 text-primary" />
                            ) : (
                              <ListTodo className="h-3 w-3 text-muted-foreground" />
                            )}
                            <span className="truncate">{item.title}</span>
                          <PlaybookEvidenceDialog
                            workspaceId={workspaceId}
                            playbookItemId={item.id}
                            playbookItemTitle={item.title}
                            canWrite={canWrite}
                          />
                            {item.relative_due_days && (
                              <span className="text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                +{item.relative_due_days}d
                              </span>
                            )}
                          </div>
                        ))}
                        {playbook.items.length > 5 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {t('playbooks.moreItems', { count: playbook.items.length - 5 })}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Action buttons - different for dismissed state */}
                    {isDismissed ? (
                      <div className="flex justify-end">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-muted-foreground"
                          onClick={() => restorePlaybook.mutate({ workspaceId, playbookId: playbook.id })}
                          disabled={restorePlaybook.isPending || !canWrite}
                        >
                          {t('playbooks.undoDismiss', { defaultValue: 'Restaurar' })}
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        {isStaff ? (
                          // Staff: Deploy with confirmation
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                className="flex-1 gap-2"
                                disabled={instantiate.isPending || !canWrite}
                              >
                                <Play className="h-4 w-4" />
                                {instantiate.isPending 
                                  ? t('common.creating') 
                                  : t('playbooks.staff.deploy')
                                }
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('playbooks.staff.confirmDeployTitle')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t('playbooks.staff.confirmDeployDesc', {
                                    title: playbook.title,
                                    milestones: milestones.length,
                                    actions: actions.length
                                  })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeploy(playbook.id, playbook.title, milestones.length, actions.length)}
                                >
                                  {t('playbooks.staff.confirmDeploy')}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        ) : (
                          // Founder: Request playbook (disabled if already requested)
                          <RequestPlaybookDialog
                            workspaceId={workspaceId}
                            playbookId={playbook.id}
                            playbookTitle={playbook.title}
                            trigger={
                              <Button
                                className="flex-1 gap-2"
                                variant={isRequested ? "secondary" : "default"}
                                disabled={!canWrite || isRequested}
                              >
                                {isRequested ? (
                                  <>
                                    <Clock className="h-4 w-4" />
                                    {t('playbooks.requested')}
                                  </>
                                ) : (
                                  <>
                                    <MessageSquarePlus className="h-4 w-4" />
                                    {t('playbooks.requestThis')}
                                  </>
                                )}
                              </Button>
                            }
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => dismiss.mutate({ workspaceId, playbookId: playbook.id })}
                          disabled={dismiss.isPending || !canWrite}
                          title={t('playbooks.dismiss')}
                         aria-label={t('common.close')}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* All applied - Role-specific success state */}
      {availablePlaybooks.length === 0 && instantiatedPlaybooks.length > 0 && (
        <Card className="bg-[hsl(var(--success))]/10 border-[hsl(var(--success))]/30">
          <CardContent className="py-6">
            <div className="text-center mb-6">
              <CheckCircle className="h-10 w-10 mx-auto mb-3 text-[hsl(var(--success))]" />
              <h3 className="font-semibold text-[hsl(var(--success))] mb-1">
                {isStaff ? t('playbooks.staff.allDeployedTitle') : t('playbooks.allAppliedTitle')}
              </h3>
              <p className="text-sm text-[hsl(var(--success))]">
                {isStaff ? t('playbooks.staff.allDeployedDescription') : t('playbooks.allAppliedDescription')}
              </p>
            </div>

            {/* Next actions - keep momentum */}
            <div className="flex flex-col sm:flex-row justify-center gap-3">
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={() => setSearchParams({ tab: 'milestones-actions' })}
              >
                <Target className="h-4 w-4" />
                {t('playbooks.reviewMilestones')}
              </Button>
              <Button 
                variant="outline"
                className="gap-2"
                onClick={() => setSearchParams({ tab: 'milestones-actions' })}
              >
                <ListTodo className="h-4 w-4" />
                {t('playbooks.continueActions')}
                <ArrowRight className="h-3 w-3" />
              </Button>
              {canWrite && !isStaff && (
                <RequestPlaybookDialog 
                  workspaceId={workspaceId}
                  trigger={
                    <Button variant="ghost" className="gap-2">
                      <MessageSquarePlus className="h-4 w-4" />
                      {t('playbooks.requestAdvanced')}
                    </Button>
                  }
                />
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Already Instantiated/Deployed */}
      {instantiatedPlaybooks.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-[hsl(var(--success))]" />
            {isStaff ? t('playbooks.staff.deployed') : t('playbooks.applied')}
          </h3>
          <div className="space-y-3">
            {instantiatedPlaybooks.map(instance => {
              const progressData = progress;
              const isActiveInstance = progressData?.activePlaybook?.instanceId === instance.id;

              return (
                <Card
                  key={instance.id}
                  className="border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/50"
                >
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-base">{instance.playbook?.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {isStaff
                            ? t('playbooks.staff.deployedOn', { date: formatShortDate(instance.instantiated_at) })
                            : t('playbooks.appliedOn', { date: formatShortDate(instance.instantiated_at) })
                          }
                        </p>
                      </div>
                      <Badge variant="outline" className="border-[hsl(var(--success))]/30 text-[hsl(var(--success))] gap-1">
                        <CheckCircle className="h-3 w-3" />
                        {isStaff ? t('playbooks.staff.deployedBadge') : t('playbooks.appliedBadge')}
                      </Badge>
                    </div>

                    {/* Progress details for the active playbook */}
                    {isActiveInstance && progressData && (progressData.totalMilestones > 0 || progressData.totalActions > 0) && (
                      <div className="mt-4 space-y-3">
                        {/* Progress bar */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{t('playbooks.progress', { defaultValue: 'Progresso' })}</span>
                            <span className="font-medium">{progressData.progressPercent}%</span>
                          </div>
                          <div className="h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[hsl(var(--success))] transition-all duration-500"
                              style={{ width: `${progressData.progressPercent}%` }}
                            />
                          </div>
                        </div>

                        {/* Milestones and actions summary */}
                        <div className="flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1.5">
                            <Target className="h-4 w-4 text-primary" />
                            <span className="font-medium">{progressData.completedMilestones}/{progressData.totalMilestones}</span>
                            <span className="text-muted-foreground">{t('playbooks.milestones', { defaultValue: 'marcos' })}</span>
                          </span>
                          <span className="flex items-center gap-1.5">
                            <ListTodo className="h-4 w-4 text-primary" />
                            <span className="font-medium">{progressData.completedActions}/{progressData.totalActions}</span>
                            <span className="text-muted-foreground">{t('playbooks.actions', { defaultValue: 'ações' })}</span>
                          </span>
                          {progressData.overdueActions > 0 && (
                            <span className="flex items-center gap-1 text-destructive">
                              <AlertCircle className="h-3.5 w-3.5" />
                              {progressData.overdueActions} {t('playbooks.overdue', { defaultValue: 'atrasadas' })}
                            </span>
                          )}
                        </div>

                        {/* Quick navigation */}
                        <div className="flex gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={() => setSearchParams({ tab: 'milestones-actions' })}
                          >
                            <Target className="h-3.5 w-3.5" />
                            {t('playbooks.reviewMilestones')}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1.5 text-xs"
                            onClick={() => setSearchParams({ tab: 'milestones-actions' })}
                          >
                            <ListTodo className="h-3.5 w-3.5" />
                            {t('playbooks.continueActions')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
