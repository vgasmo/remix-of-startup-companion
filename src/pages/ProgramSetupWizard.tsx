import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ChevronLeft,
  ChevronRight,
  Save,
  Trash2,
  Check,
  Building2,
  Layers,
  BarChart3,
  BookOpen,
  Bell,
  CheckCircle,
  Rocket,
  CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  useProgramSetupDraft,
  useCreateProgramDraft,
  useUpdateProgramDraft,
  useDiscardProgramDraft,
  usePublishProgramDraft,
  type ProgramSetupDraft,
} from '@/hooks/useProgramSetup';
import { WizardBasicsStep } from '@/components/admin/wizard/WizardBasicsStep';
import { WizardStagesStep } from '@/components/admin/wizard/WizardStagesStep';
import { WizardKpisStep } from '@/components/admin/wizard/WizardKpisStep';
import { WizardPlaybooksStep } from '@/components/admin/wizard/WizardPlaybooksStep';
import { WizardAlertRulesStep } from '@/components/admin/wizard/WizardAlertRulesStep';
import { WizardReviewStep } from '@/components/admin/wizard/WizardReviewStep';
import { WizardWeeksGatesStep } from '@/components/admin/wizard/WizardWeeksGatesStep';
import { WizardStepTransition } from '@/components/ui/WizardStepTransition';
import { WizardIllustration } from '@/components/ui/WizardIllustration';
import { triggerConfetti } from '@/lib/confetti';

type WizardStep = 'basics' | 'stages' | 'weeksGates' | 'kpis' | 'playbooks' | 'alerts' | 'review';

const ALL_STEPS: { key: WizardStep; labelKey: string; icon: React.ElementType }[] = [
  { key: 'basics', labelKey: 'programSetup.steps.basics', icon: Building2 },
  { key: 'stages', labelKey: 'programSetup.steps.stages', icon: Layers },
  { key: 'weeksGates', labelKey: 'programSetup.steps.weeksGates', icon: CalendarDays },
  { key: 'kpis', labelKey: 'programSetup.steps.kpis', icon: BarChart3 },
  { key: 'playbooks', labelKey: 'programSetup.steps.playbooks', icon: BookOpen },
  { key: 'alerts', labelKey: 'programSetup.steps.alerts', icon: Bell },
  { key: 'review', labelKey: 'programSetup.steps.review', icon: CheckCircle },
];

export default function ProgramSetupWizard() {
  const { t } = useTranslation();
  const { id, draftId } = useParams<{ id?: string; draftId?: string }>();
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState<WizardStep>('basics');
  const [prevStep, setPrevStep] = useState<WizardStep>('basics');
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(draftId || null);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // Holds the latest pending updates so Save/Publish can flush before navigating.
  const pendingUpdatesRef = useRef<Partial<ProgramSetupDraft['draft_json']> | null>(null);
  const publishedRef = useRef(false);

  const { data: draft, isLoading: draftLoading } = useProgramSetupDraft(activeDraftId || undefined);
  const createDraft = useCreateProgramDraft();
  const updateDraft = useUpdateProgramDraft();
  const discardDraft = useDiscardProgramDraft();
  const publishDraft = usePublishProgramDraft();

  // Determine which steps to show based on program type + mode + enabled modules
  const programSettings = draft?.draft_json.basics?.settings;
  const isBasicMode = programSettings?.program_mode === 'basic';
  const isAcceleration = draft?.draft_json.basics?.program_type === 'acceleration';
  const showKpisStep = !isAcceleration && (!isBasicMode || !!programSettings?.enable_kpis);
  const showPlaybooksStep = !isAcceleration && (!isBasicMode || !!programSettings?.enable_playbooks || !!programSettings?.enable_milestones);
  const showAlertsStep = !isAcceleration && (!isBasicMode || !!programSettings?.enable_alerts || !!programSettings?.enable_health);
  const showAlertRulesCard = !isBasicMode || !!programSettings?.enable_alerts;
  const showHealthCard = !isBasicMode || !!programSettings?.enable_health;

  const STEPS = ALL_STEPS.filter((step) => {
    switch (step.key) {
      case 'stages':
        return !isAcceleration; // Incubation only
      case 'weeksGates':
        return isAcceleration; // Acceleration only
      case 'kpis':
        return showKpisStep;
      case 'playbooks':
        return showPlaybooksStep;
      case 'alerts':
        return showAlertsStep;
      default:
        return true;
    }
  });

  // Helper for step transitions
  const goToStep = (step: WizardStep) => {
    // Ensure step is valid for current mode
    if (!STEPS.some(s => s.key === step)) return;
    setPrevStep(currentStep);
    setCurrentStep(step);
  };
  
  const direction = STEPS.findIndex(s => s.key === currentStep) > STEPS.findIndex(s => s.key === prevStep) ? 'forward' : 'backward';

  // Create draft on mount if needed
  useEffect(() => {
    if (!activeDraftId && !createDraft.isPending) {
      createDraft.mutate(
        { programId: id },
        {
          onSuccess: (newDraft) => {
            setActiveDraftId(newDraft.id);
            // Update URL without full navigation
            window.history.replaceState(null, '', `/admin/programs/${id ? `${id}/setup` : 'new'}/${newDraft.id}`);
          },
        }
      );
    }
  }, [id, activeDraftId, createDraft]);

  // If current step is not in the filtered STEPS (e.g. basic mode hides standard steps), reset
  const rawStepIndex = STEPS.findIndex((s) => s.key === currentStep);
  useEffect(() => {
    if (rawStepIndex === -1 && STEPS.length > 0) {
      setCurrentStep(STEPS[0].key);
    }
  }, [rawStepIndex, STEPS]);

  const currentStepIndex = rawStepIndex === -1 ? 0 : rawStepIndex;
  const progress = ((currentStepIndex + 1) / STEPS.length) * 100;

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      goToStep(STEPS[nextIndex].key);
    }
  };

  const handleBack = async () => {
    await flushAutosave();
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      goToStep(STEPS[prevIndex].key);
    }
  };

  // localStorage backup key — survives crash / unload before server save.
  const localKey = activeDraftId ? `program-setup-draft:${activeDraftId}` : null;
  const writeLocalBackup = useCallback((updates: Partial<ProgramSetupDraft['draft_json']>) => {
    if (!localKey) return;
    try {
      const prev = localStorage.getItem(localKey);
      const merged = {
        ...(prev ? JSON.parse(prev).data : {}),
        ...updates,
      };
      localStorage.setItem(localKey, JSON.stringify({ data: merged, updatedAt: new Date().toISOString() }));
    } catch { /* noop */ }
  }, [localKey]);

  // Flush any pending debounced autosave immediately. Used before
  // navigation/publish so we never lose the last few seconds of edits.
  const flushAutosave = useCallback(async () => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = undefined;
    }
    const pending = pendingUpdatesRef.current;
    pendingUpdatesRef.current = null;
    if (pending && activeDraftId) {
      setAutosaveStatus('saving');
      try {
        await updateDraft.mutateAsync({ draftId: activeDraftId, draftJson: pending });
        setAutosaveStatus('saved');
        if (localKey) { try { localStorage.removeItem(localKey); } catch { /* noop */ } }
        setTimeout(() => setAutosaveStatus('idle'), 1500);
      } catch {
        setAutosaveStatus('idle');
      }
    }
  }, [activeDraftId, updateDraft, localKey]);

  const handleSaveAndContinue = async () => {
    await flushAutosave();
    handleNext();
    toast.success(t('programSetup.progressSaved'));
  };

  const handleUpdateDraft = useCallback(async (updates: Partial<ProgramSetupDraft['draft_json']>) => {
    if (!activeDraftId) return;
    await updateDraft.mutateAsync({ draftId: activeDraftId, draftJson: updates });
  }, [activeDraftId, updateDraft]);

  // Autosave: debounced save after 2s of inactivity. Pending updates are
  // MERGED (not replaced) so concurrent partial updates from different step
  // components are never dropped. Latest payload is also mirrored to
  // localStorage so a crash/close before the 2s elapses doesn't lose data.
  const handleUpdateDraftWithAutosave = useCallback((updates: Partial<ProgramSetupDraft['draft_json']>) => {
    if (!activeDraftId) return;
    pendingUpdatesRef.current = {
      ...(pendingUpdatesRef.current ?? {}),
      ...updates,
    };
    writeLocalBackup(pendingUpdatesRef.current);
    setAutosaveStatus('saving');
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(async () => {
      const payload = pendingUpdatesRef.current;
      if (!payload) return;
      try {
        await updateDraft.mutateAsync({ draftId: activeDraftId, draftJson: payload });
        pendingUpdatesRef.current = null;
        if (localKey) { try { localStorage.removeItem(localKey); } catch { /* noop */ } }
        setAutosaveStatus('saved');
        setTimeout(() => setAutosaveStatus('idle'), 2000);
      } catch {
        setAutosaveStatus('idle');
      }
    }, 2000);
  }, [activeDraftId, updateDraft, writeLocalBackup, localKey]);

  // Crash recovery: if a localStorage backup exists and is newer than the
  // server-side draft, replay it via debounced autosave so the user's last
  // edits (typed in the seconds before a crash/close) make it back into the
  // server draft. Runs once per (draftId, server updated_at) pair.
  const recoveredKeyRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeDraftId || !localKey || !draft) return;
    const sig = `${activeDraftId}:${draft.updated_at ?? 'na'}`;
    if (recoveredKeyRef.current === sig) return;
    recoveredKeyRef.current = sig;
    try {
      const raw = localStorage.getItem(localKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { data?: Partial<ProgramSetupDraft['draft_json']>; updatedAt?: string };
      if (!parsed?.data || !parsed.updatedAt) return;
      const localTs = new Date(parsed.updatedAt).getTime();
      const serverTs = draft.updated_at ? new Date(draft.updated_at).getTime() : 0;
      if (localTs > serverTs) {
        // Replay through the autosave path so it lands in server + clears local on success.
        handleUpdateDraftWithAutosave(parsed.data);
        toast.info(t('programSetup.restoredFromBackup', 'Restaurámos as últimas edições não guardadas.'));
      } else {
        // Server is newer — backup is stale.
        try { localStorage.removeItem(localKey); } catch { /* noop */ }
      }
    } catch { /* noop */ }
  }, [activeDraftId, localKey, draft, handleUpdateDraftWithAutosave, t]);

  // Flush on tab hide / pagehide / beforeunload / unmount.
  useEffect(() => {
    const onHide = () => { void flushAutosave(); };
    const onVis = () => { if (document.visibilityState === 'hidden') onHide(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
      void flushAutosave();
    };
  }, [flushAutosave]);

  const handleDiscard = async () => {
    if (!activeDraftId) return;
    await discardDraft.mutateAsync(activeDraftId);
    navigate('/admin');
  };

  const handlePublish = async () => {
    if (!activeDraftId || publishedRef.current) return;
    try {
      publishedRef.current = true;
      await flushAutosave();
      triggerConfetti();
      await publishDraft.mutateAsync(activeDraftId);
      toast.success(t('programSetup.publishSuccess'));
      setTimeout(() => navigate('/admin'), 1500);
    } catch (error) {
      publishedRef.current = false;
      // Error handled by mutation
    }
  };

  // Validation for review step
  const getValidationErrors = (): string[] => {
    const errors: string[] = [];
    if (!draft) return errors;

    const { basics, stages, coreKpis, alertRules, healthModel, gates, weeks } = draft.draft_json;
    const programIsBasic = basics?.settings?.program_mode === 'basic';
    const programIsAcceleration = basics?.program_type === 'acceleration';

    if (!basics?.name?.trim()) errors.push(t('programSetup.validation.programNameRequired'));
    
    if (programIsAcceleration) {
      // Acceleration validations
      if (!gates || gates.length === 0) errors.push(t('programSetup.validation.atLeastOneGate', 'At least one gate is required'));
      if (!weeks || weeks.length === 0) errors.push(t('programSetup.validation.atLeastOneWeek', 'At least one week is required'));
      const gatesWithoutNames = gates?.filter(g => !g.name?.trim()) || [];
      if (gatesWithoutNames.length > 0) errors.push(t('programSetup.validation.gateNameRequired', 'All gates must have a name'));
    } else if (!programIsBasic) {
      // Incubation standard mode validations
      const activeStages = stages?.filter((s) => s.is_active) || [];
      if (activeStages.length === 0) errors.push(t('programSetup.validation.atLeastOneStage'));

      const coreCount = coreKpis?.length || 0;
      if (coreCount < 3) errors.push(t('programSetup.validation.minCoreKpis'));
      if (coreCount > 6) errors.push(t('programSetup.validation.maxCoreKpis'));

      // Check alert thresholds
      for (const rule of alertRules || []) {
        if (rule.threshold < 0) errors.push(t('programSetup.validation.negativeThreshold', { ruleType: rule.rule_type }));
      }

      // Check health model weights
      if (healthModel?.is_enabled) {
        const weights = Object.values(healthModel.weights_json || {});
        const sum = weights.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 100) > 0.1) errors.push(t('programSetup.validation.healthWeightsSum', { sum }));
      }
    }

    return errors;
  };

  if (draftLoading || createDraft.isPending) {
    return (
      <AppLayout title={t('programSetup.newProgramSetup')} subtitle={t('programSetup.loading')}>
        <div className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      </AppLayout>
    );
  }

  const isEditing = !!id;
  const title = isEditing ? t('programSetup.editProgram', { name: draft?.draft_json.basics?.name || 'Untitled' }) : t('programSetup.newProgramSetup');

  return (
    <AppLayout 
      title={title} 
      subtitle={t('programSetup.configureStepByStep')}
    >
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Progress Header */}
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" />
                <span className="font-medium">{t('programSetup.setupProgress')}</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={draft?.status === 'draft' ? 'secondary' : 'default'}>
                {draft?.status || 'draft'}
              </Badge>
              {autosaveStatus === 'saving' && (
                <span className="text-xs text-muted-foreground animate-pulse">⏳ {t('programSetup.saving', { defaultValue: 'A guardar...' })}</span>
              )}
              {autosaveStatus === 'saved' && (
                <span className="text-xs text-muted-foreground">💾 {t('programSetup.autoSaved', { defaultValue: 'Guardado' })}</span>
              )}
            </div>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between mt-3">
              {STEPS.map((step, idx) => {
                const Icon = step.icon;
                const isActive = step.key === currentStep;
                const isComplete = idx < currentStepIndex;
                return (
                  <button
                    key={step.key}
                    type="button"
                    onClick={() => goToStep(step.key)}
                    className={`flex flex-col items-center gap-1 text-xs transition-all hover:scale-105 ${
                      isActive
                        ? 'text-primary font-medium'
                        : isComplete
                        ? 'text-primary/70'
                        : 'text-muted-foreground'
                    }`}
                  >
                    <div
                      className={`h-8 w-8 rounded-full flex items-center justify-center ${
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : isComplete
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted'
                      }`}
                    >
                      {isComplete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                    </div>
                    <span className="hidden sm:block">{t(step.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Step Content */}
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row items-start gap-4">
            <WizardIllustration 
              type={currentStep as any} 
              size="sm" 
            />
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                {t(STEPS[currentStepIndex].labelKey)}
              </CardTitle>
              <CardDescription>
                {t(`programSetup.stepDescriptions.${currentStep}`)}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <WizardStepTransition stepKey={currentStep} direction={direction}>
              {draft && (
                <>
                  {currentStep === 'basics' && (
                    <WizardBasicsStep
                      data={draft.draft_json.basics}
                      onUpdate={(basics) => handleUpdateDraftWithAutosave({ basics })}
                    />
                  )}
                  {currentStep === 'stages' && (
                    <WizardStagesStep
                      data={draft.draft_json.stages}
                      onUpdate={(stages) => handleUpdateDraftWithAutosave({ stages })}
                    />
                  )}
                  {currentStep === 'weeksGates' && (
                    <WizardWeeksGatesStep
                      gates={draft.draft_json.gates || []}
                      weeks={draft.draft_json.weeks || []}
                      onUpdate={(gates, weeks) => handleUpdateDraftWithAutosave({ gates, weeks })}
                    />
                  )}
                  {currentStep === 'kpis' && (
                    <WizardKpisStep
                      stages={draft.draft_json.stages}
                      kpis={draft.draft_json.kpis}
                      coreKpis={draft.draft_json.coreKpis}
                      onUpdate={(kpis, coreKpis) => handleUpdateDraftWithAutosave({ kpis, coreKpis })}
                    />
                  )}
                  {currentStep === 'playbooks' && (
                    <WizardPlaybooksStep
                      stages={draft.draft_json.stages}
                      playbooks={draft.draft_json.playbooks}
                      onUpdate={(playbooks) => handleUpdateDraftWithAutosave({ playbooks })}
                    />
                  )}
                  {currentStep === 'alerts' && (
                    <WizardAlertRulesStep
                      alertRules={draft.draft_json.alertRules}
                      healthModel={draft.draft_json.healthModel}
                      onUpdate={(alertRules, healthModel) => handleUpdateDraftWithAutosave({ alertRules, healthModel })}
                    />
                  )}
                  {currentStep === 'review' && (
                    <WizardReviewStep
                      draft={draft}
                      validationErrors={getValidationErrors()}
                      availableSteps={STEPS.map((step) => step.key)}
                      showAlertRulesCard={showAlertRulesCard}
                      showHealthCard={showHealthCard}
                      onNavigateToStep={(step) => goToStep(step as WizardStep)}
                    />
                  )}
                </>
              )}
            </WizardStepTransition>
          </CardContent>
        </Card>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowDiscardDialog(true)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('programSetup.discard')}
            </Button>
          </div>

          <div className="flex gap-2">
            {currentStepIndex > 0 && (
              <Button type="button" variant="outline" onClick={handleBack}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                {t('programSetup.back')}
              </Button>
            )}

            {currentStep !== 'review' ? (
              <Button type="button" onClick={handleSaveAndContinue} disabled={updateDraft.isPending}>
                <Save className="h-4 w-4 mr-1" />
                {t('programSetup.saveAndContinue')}
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handlePublish}
                disabled={publishDraft.isPending || getValidationErrors().length > 0 || publishedRef.current}
                className="bg-green-600 hover:bg-green-700"
              >
                {publishDraft.isPending || publishedRef.current ? (
                  t('programSetup.publishing')
                ) : (
                  <>
                    <Rocket className="h-4 w-4 mr-2" />
                    {t('programSetup.publishProgram')}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Discard Confirmation */}
      <AlertDialog open={showDiscardDialog} onOpenChange={setShowDiscardDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('programSetup.discardDraftTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('programSetup.discardDraftDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('programSetup.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDiscard}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('programSetup.discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}