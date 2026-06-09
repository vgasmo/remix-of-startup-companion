import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { clickableProps } from '@/lib/clickable';
import { FileText, ChevronRight, Check, Save, FolderOpen, Calculator, Send, MessageSquare, CheckCircle2, Sparkles, LayoutGrid, Target, Users, Crosshair, TrendingUp, DollarSign, Rocket, BarChart3, Map, Upload, HelpCircle, Loader2, WifiOff, CircleCheck, CircleAlert } from 'lucide-react';
import { useTemplateDraftAutosave, type AutosaveStatus } from '@/hooks/useTemplateDraftAutosave';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { 
  useTemplates, 
  useTemplateInstances, 
  useCompleteTemplateInstance,
  useSubmitForReview,
  useReviewTemplateInstance,
  type Template,
  type TemplateInstance,
  type TemplateField,
} from '@/hooks/useTemplates';
import { useAuth } from '@/contexts/AuthContext';
import { UnitEconomicsCalculator } from './UnitEconomicsCalculator';
import { TemplateCoachPanel } from './TemplateCoachPanel';
import { CanvasTemplate, CanvasType, getCanvasType } from './CanvasTemplate';
import { getLocalizedTemplateMeta, getLocalizedCategoryLabel } from '@/lib/templateCatalogI18n';
import { notify } from "@/lib/notify";
import { useDocuments, useUploadDocument } from '@/hooks/useDocuments';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';

interface TemplatesTabProps {
  workspaceId: string;
  canWrite: boolean;
  isFounder?: boolean;
}

export function TemplatesTab({ workspaceId, canWrite, isFounder = false }: TemplatesTabProps) {
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: templates, isLoading: loadingTemplates } = useTemplates();
  const { data: instances, isLoading: loadingInstances } = useTemplateInstances(workspaceId);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [selectedInstance, setSelectedInstance] = useState<TemplateInstance | null>(null);
  const [activeTab, setActiveTab] = useState('templates');
  const hasAutoOpened = useRef(false);

  // Group templates by category KEY (stable for grouping, then display localized label)
  const templatesByCategory = useMemo(() => {
    if (!templates) return {};
    return templates.reduce((acc, tmpl) => {
      const cat = tmpl.category || 'Other';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(tmpl);
      return acc;
    }, {} as Record<string, Template[]>);
  }, [templates]);

  // Map instances by template ID
  const instancesByTemplateId = useMemo(() => {
    if (!instances) return {};
    return instances.reduce((acc, i) => {
      acc[i.template_id] = i;
      return acc;
    }, {} as Record<string, TemplateInstance>);
  }, [instances]);

  // Auto-open a specific template when navigated from DataroomChecklist
  useEffect(() => {
    if (hasAutoOpened.current || !templates?.length || loadingTemplates || loadingInstances) return;
    const openTemplateId = searchParams.get('openTemplate');
    if (!openTemplateId) return;

    const template = templates.find(t => t.id === openTemplateId);
    if (!template) return;

    hasAutoOpened.current = true;

    // Clean up the URL param
    const newParams = new URLSearchParams(searchParams);
    newParams.delete('openTemplate');
    setSearchParams(newParams, { replace: true });

    // Check if it's the Unit Economics calculator
    if (template.name === 'Unit Economics') {
      setActiveTab('calculator');
      return;
    }

    // Check if it's a canvas template
    const canvasType = getCanvasType(template.name);
    if (canvasType) {
      setActiveTab(canvasType);
      return;
    }

    // Regular template - open the editor dialog
    const existingInstance = instancesByTemplateId[template.id];
    setSelectedTemplate(template);
    setSelectedInstance(existingInstance || null);
  }, [templates, loadingTemplates, loadingInstances, searchParams, setSearchParams, instancesByTemplateId]);

  useEffect(() => {
    if (loadingTemplates || loadingInstances) return;
    const openTemplateId = searchParams.get('openTemplate');
    if (!openTemplateId) {
      hasAutoOpened.current = false;
    }
  }, [loadingTemplates, loadingInstances, searchParams]);

  const handleOpenTemplate = (template: Template) => {
    // If it's a canvas template, switch to the appropriate tab instead of opening dialog
    const canvasType = getCanvasType(template.name);
    if (canvasType) {
      setActiveTab(canvasType);
      return;
    }
    
    const existingInstance = instancesByTemplateId[template.id];
    setSelectedTemplate(template);
    setSelectedInstance(existingInstance || null);
  };

  const handleCloseEditor = () => {
    setSelectedTemplate(null);
    setSelectedInstance(null);
  };

  if (loadingTemplates || loadingInstances) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
        </div>
      </div>
    );
  }

  if (!templates?.length) {
    const handleAskAi = () => {
      try {
        window.dispatchEvent(new CustomEvent('copilot:open', {
          detail: {
            prompt: t('templates.emptyAiPrompt', {
              defaultValue: 'Que template devo começar primeiro para a minha startup?',
            }),
          },
        }));
      } catch { /* ignore */ }
    };
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4">
        <div className="h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center mb-4">
          <FileText className="h-5 w-5 text-muted-foreground" />
        </div>
        <h3 className="text-base font-medium text-foreground mb-1">
          {t('templates.emptyStateTitle', 'No templates yet')}
        </h3>
        <p className="text-sm text-muted-foreground text-center max-w-xs mb-4">
          {t('templates.emptyStateDesc', 'Templates help you structure your thinking and track progress.')}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" variant="default" onClick={handleAskAi} className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            {t('templates.emptyAskAi', { defaultValue: 'Perguntar à IA' })}
          </Button>
          <Button size="sm" variant="outline" asChild className="gap-1.5">
            <a href="/guide">
              <HelpCircle className="h-3.5 w-3.5" />
              {t('templates.emptyOpenGuide', { defaultValue: 'Abrir Guia' })}
            </a>
          </Button>
        </div>
      </div>
    );
  }

  const categories = Object.keys(templatesByCategory).sort();

  // Find canvas templates for dedicated tabs
  const findCanvasTemplate = (type: CanvasType) => 
    templates?.find(t => getCanvasType(t.name) === type);
  
  // Short labels for canvas tabs with translation support
  const getCanvasTabLabel = (type: CanvasType): string => {
    const labels: Record<CanvasType, { short: string; full: string }> = {
      bmc: { short: 'BMC', full: t('templates.canvas.bmc.title') },
      lean: { short: 'Lean', full: t('templates.canvas.lean.title') },
      value_prop: { short: 'VP', full: t('templates.canvas.value_prop.title') },
      empathy: { short: t('templates.canvas.empathy.title', 'Empathy'), full: t('templates.canvas.empathy.title') },
      swot: { short: 'SWOT', full: t('templates.canvas.swot.title') },
      gtm: { short: 'GTM', full: t('templates.canvas.gtm.title') },
      icp: { short: 'ICP', full: t('templates.canvas.icp.title') },
      pricing: { short: t('templates.canvasTabLabels.pricing', 'Pricing'), full: t('templates.canvas.pricing.title') },
      growth_loops: { short: t('templates.canvasTabLabels.growth', 'Growth'), full: t('templates.canvas.growth_loops.title') },
      okrs: { short: 'OKRs', full: t('templates.canvas.okrs.title') },
      fundraising: { short: t('templates.canvasTabLabels.fundraising', 'Fund'), full: t('templates.canvas.fundraising.title') },
      sales_pipeline: { short: t('templates.canvasTabLabels.pipeline', 'Pipeline'), full: t('templates.canvas.sales_pipeline.title') },
      roadmap: { short: 'Roadmap', full: t('templates.canvas.roadmap.title') },
    };
    return labels[type]?.short || type;
  };

  const canvasTemplates: { type: CanvasType; template: Template | undefined; icon: React.ReactNode }[] = [
    { type: 'bmc', template: findCanvasTemplate('bmc'), icon: <LayoutGrid className="h-4 w-4" /> },
    { type: 'lean', template: findCanvasTemplate('lean'), icon: <LayoutGrid className="h-4 w-4" /> },
    { type: 'value_prop', template: findCanvasTemplate('value_prop'), icon: <Target className="h-4 w-4" /> },
    { type: 'empathy', template: findCanvasTemplate('empathy'), icon: <Users className="h-4 w-4" /> },
    { type: 'swot', template: findCanvasTemplate('swot'), icon: <Crosshair className="h-4 w-4" /> },
    { type: 'gtm', template: findCanvasTemplate('gtm'), icon: <Rocket className="h-4 w-4" /> },
    { type: 'icp', template: findCanvasTemplate('icp'), icon: <Users className="h-4 w-4" /> },
    { type: 'pricing', template: findCanvasTemplate('pricing'), icon: <DollarSign className="h-4 w-4" /> },
    { type: 'growth_loops', template: findCanvasTemplate('growth_loops'), icon: <TrendingUp className="h-4 w-4" /> },
    { type: 'okrs', template: findCanvasTemplate('okrs'), icon: <Target className="h-4 w-4" /> },
    { type: 'fundraising', template: findCanvasTemplate('fundraising'), icon: <DollarSign className="h-4 w-4" /> },
    { type: 'sales_pipeline', template: findCanvasTemplate('sales_pipeline'), icon: <BarChart3 className="h-4 w-4" /> },
    { type: 'roadmap', template: findCanvasTemplate('roadmap'), icon: <Map className="h-4 w-4" /> },
  ];

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
      <TabsList className="flex-wrap h-auto gap-1">
        <TabsTrigger value="templates" className="gap-2">
          <FileText className="h-4 w-4" />
          {t('templates.title')}
        </TabsTrigger>
        {canvasTemplates.map(({ type, template, icon }) => 
          template && (
            <TabsTrigger key={type} value={type} className="gap-2">
              {icon}
              {getCanvasTabLabel(type)}
            </TabsTrigger>
          )
        )}
        <TabsTrigger value="calculator" className="gap-2">
          <Calculator className="h-4 w-4" />
          {t('templates.unitEconomics', 'Unit Economics')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="calculator">
        <UnitEconomicsCalculator workspaceId={workspaceId} />
      </TabsContent>

      {/* Canvas Tabs */}
      {canvasTemplates.map(({ type, template }) => 
        template && (
          <TabsContent key={type} value={type}>
            <CanvasTemplateWrapper
              template={template}
              instance={instancesByTemplateId[template.id] || null}
              workspaceId={workspaceId}
              canWrite={canWrite}
              type={type}
              isFounder={isFounder}
            />
          </TabsContent>
        )
      )}

      <TabsContent value="templates" className="space-y-6">
      {categories.map(category => {
        // Get localized category label using our helper
        const categoryLabel = getLocalizedCategoryLabel(category, t);
        
        return (
          <div key={category} className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-2 px-1">
              <FolderOpen className="h-3.5 w-3.5" />
              {categoryLabel}
            </h3>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {templatesByCategory[category].map(template => {
                const instance = instancesByTemplateId[template.id];
                const isCompleted = instance?.status === 'completed';
                const isStarted = !!instance;
                const reviewStatus = instance?.review_status;
                
                // Get fully localized template metadata
                const meta = getLocalizedTemplateMeta(template, t);

                // Compact status indicator
                const getStatusIndicator = () => {
                  if (isCompleted) return { color: 'bg-[hsl(var(--success))]', label: t('templates.approved') };
                  if (reviewStatus === 'pending_review') return { color: 'bg-[hsl(var(--warning))]', label: t('templates.pendingReview') };
                  if (reviewStatus === 'approved') return { color: 'bg-[hsl(var(--success))]', label: t('templates.approved') };
                  if (reviewStatus === 'needs_changes') return { color: 'bg-destructive', label: t('templates.needsChanges') };
                  if (isStarted) return { color: 'bg-[hsl(var(--info))]', label: t('templates.inProgress') };
                  return null;
                };
                const status = getStatusIndicator();

                return (
                  <div 
                    key={template.id}
                    className={`group relative flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all duration-200 hover:shadow-sm ${
                      isCompleted 
                        ? 'border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/50 ' 
                        : 'border-border/60 hover:border-primary/30 hover:bg-muted/40'
                    }`}
                    {...clickableProps(() => handleOpenTemplate(template))}
                  >
                    {/* Status dot */}
                    {status && (
                      <div 
                        className={`absolute top-2 right-2 h-2 w-2 rounded-full ${status.color}`} 
                        title={status.label}
                      />
                    )}
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0 pr-4">
                      <h4 className="font-medium text-sm leading-snug text-foreground group-hover:text-primary transition-colors">
                        {meta.title}
                      </h4>
                      {meta.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate" title={meta.description}>
                          {meta.description}
                        </p>
                      )}
                    </div>
                    
                    {/* Chevron */}
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 transition-transform group-hover:translate-x-0.5 group-hover:text-primary/60" />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      </TabsContent>

      {/* Template Editor Dialog - outside TabsContent to avoid ref issues */}
      <TemplateEditorDialog
        template={selectedTemplate}
        instance={selectedInstance}
        workspaceId={workspaceId}
        canWrite={canWrite}
        isFounder={isFounder}
        onClose={handleCloseEditor}
      />
    </Tabs>
  );
}

// Wrapper for canvas templates with save functionality
interface CanvasTemplateWrapperProps {
  template: Template;
  instance: TemplateInstance | null;
  workspaceId: string;
  canWrite: boolean;
  type: CanvasType;
  isFounder?: boolean;
}

function CanvasTemplateWrapper({ template, instance, workspaceId, canWrite, type, isFounder = false }: CanvasTemplateWrapperProps) {
  const { t } = useTranslation();
  const { roles, user } = useAuth();
  const submitForReview = useSubmitForReview(workspaceId);
  const reviewInstance = useReviewTemplateInstance(workspaceId);
  const [reviewNotes, setReviewNotes] = useState('');

  const canReview = roles.includes('admin') || roles.includes('consultor') || roles.includes('mentor_externo');
  const isPendingReview = instance?.review_status === 'pending_review';

  const autosave = useTemplateDraftAutosave({
    workspaceId,
    templateId: template.id,
    userId: user?.id,
    instance,
    disabled: !canWrite,
  });

  // Surface the local-only toast once per transition.
  const prevStatusRef = useRef<AutosaveStatus>('idle');
  useEffect(() => {
    if (autosave.status === 'local_only' && prevStatusRef.current !== 'local_only') {
      notify.warn(t('templates.autosave.localOnlyToast'));
    }
    prevStatusRef.current = autosave.status;
  }, [autosave.status, t]);

  const handleCanvasChange = (next: Record<string, string>) => {
    autosave.setAll(next);
  };

  const handleSubmitForReview = async () => {
    const ok = await autosave.flush();
    if (!ok) {
      notify.error(t('templates.submitFailed'));
      return;
    }
    const id = autosave.instanceId;
    if (!id) {
      notify.error(t('templates.submitFailed'));
      return;
    }
    try {
      await submitForReview.mutateAsync(id);
      notify.success(t('templates.submittedForReview'));
    } catch {
      notify.error(t('templates.submitFailed'));
    }
  };

  const handleReview = async (status: 'approved' | 'needs_changes') => {
    const id = autosave.instanceId ?? instance?.id;
    if (!id) return;
    try {
      await reviewInstance.mutateAsync({
        instanceId: id,
        review_status: status,
        review_notes: reviewNotes.trim() || undefined,
      });
      notify.success(status === 'approved' ? t('templates.approved') : t('templates.requestChanges'));
      setReviewNotes('');
    } catch {
      notify.error(t('templates.submitFailed'));
    }
  };

  return (
    <div className="space-y-4">
      {autosave.restoredFromLocal && (
        <Alert>
          <CircleAlert className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between gap-3">
            <span>{t('templates.autosave.restoredBanner')}</span>
            <Button variant="ghost" size="sm" onClick={autosave.dismissRestoredBanner}>
              {t('templates.autosave.restoredBannerDismiss')}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-between">
        <AutosaveBadge status={autosave.status} lastSavedAt={autosave.lastSavedAt} />
        <div />
      </div>
      <CanvasTemplate
        type={type}
        data={(autosave.data as Record<string, string>) || {}}
        onChange={handleCanvasChange}
        disabled={!canWrite || (canReview && !isFounder)}
        reviewStatus={instance?.review_status as 'draft' | 'pending_review' | 'approved' | 'needs_changes' | undefined}
        onSubmitForReview={canWrite && isFounder ? handleSubmitForReview : undefined}
      />

      {/* AI Coach Panel for consultants/mentors when reviewing */}
      {canReview && (autosave.instanceId ?? instance?.id) && (
        <TemplateCoachPanel
          instanceId={(autosave.instanceId ?? instance?.id) as string}
          workspaceId={workspaceId}
          onCopyToNotes={(notes) => setReviewNotes(notes)}
          showReviewActions={isPendingReview}
          onApplyReview={(recommendation, notes) => {
            setReviewNotes(notes);
            handleReview(recommendation);
          }}
        />
      )}

      {/* Review section for consultants/mentors */}
      {canReview && isPendingReview && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('templates.canvasReviewSection')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label>{t('templates.reviewNotesOptional')}</Label>
            <Textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder={t('templates.feedbackPlaceholder')}
              rows={2}
            />
            <div className="flex gap-2">
              <Button onClick={() => handleReview('approved')} className="flex-1">
                <CheckCircle2 className="h-4 w-4 mr-1" />
                {t('templates.approve')}
              </Button>
              <Button variant="outline" onClick={() => handleReview('needs_changes')} className="flex-1">
                {t('templates.requestChanges')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Small inline component for autosave status feedback.
function AutosaveBadge({ status, lastSavedAt }: { status: AutosaveStatus; lastSavedAt: Date | null }) {
  const { t } = useTranslation();
  const time = lastSavedAt
    ? lastSavedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  if (status === 'saving') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        {t('templates.autosave.saving')}
      </div>
    );
  }
  if (status === 'local_only') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--warning))]">
        <WifiOff className="h-3 w-3" />
        {t('templates.autosave.localOnly')}
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-destructive">
        <CircleAlert className="h-3 w-3" />
        {t('templates.autosave.failed')}
      </div>
    );
  }
  if (status === 'saved' && time) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CircleCheck className="h-3 w-3 text-[hsl(var(--success))]" />
        {t('templates.autosave.savedAt', { time })}
      </div>
    );
  }
  return <div className="h-4" />;
}

interface TemplateEditorDialogProps {
  template: Template | null;
  instance: TemplateInstance | null;
  workspaceId: string;
  canWrite: boolean;
  isFounder: boolean;
  onClose: () => void;
}

function TemplateEditorDialog({
  template,
  instance,
  workspaceId,
  canWrite,
  isFounder,
  onClose,
}: TemplateEditorDialogProps) {
  const { t } = useTranslation();
  const { roles, user } = useAuth();
  const completeInstance = useCompleteTemplateInstance(workspaceId);
  const submitForReview = useSubmitForReview(workspaceId);
  const reviewInstance = useReviewTemplateInstance(workspaceId);
  const uploadDocument = useUploadDocument();
  const { data: documents } = useDocuments(workspaceId);

  const [reviewNotes, setReviewNotes] = useState('');
  const { confirm: confirmClose, dialogProps: confirmCloseProps } = useConfirmDialog();

  const canReview = roles.includes('admin') || roles.includes('consultor') || roles.includes('mentor_externo');

  // Map templates to their dataroom document categories for upload support
  const TEMPLATE_CATEGORY_MAP: Record<string, { category: string; labelKey: string; defaultLabel: string }> = {
    'Pitch Deck Checklist': { category: 'pitch_deck', labelKey: 'dataroomChecklist.uploadPitchDeck', defaultLabel: 'Upload do Pitch Deck' },
    'One-Pager Checklist': { category: 'one_pager', labelKey: 'dataroomChecklist.uploadOnePager', defaultLabel: 'Upload do One-Pager' },
    'Modelo Financeiro Checklist': { category: 'financial_model', labelKey: 'dataroomChecklist.uploadFinancialModel', defaultLabel: 'Upload do Modelo Financeiro' },
    'Apresentação da Equipa Checklist': { category: 'team', labelKey: 'dataroomChecklist.uploadTeamDeck', defaultLabel: 'Upload da Apresentação da Equipa' },
    'Relatório de Tração Checklist': { category: 'traction', labelKey: 'dataroomChecklist.uploadTractionReport', defaultLabel: 'Upload do Relatório de Tração' },
  };
  const templateUploadConfig = template?.name ? TEMPLATE_CATEGORY_MAP[template.name] : null;
  const existingUploadDoc = templateUploadConfig
    ? documents?.find(d => d.category === templateUploadConfig.category)
    : null;

  const autosave = useTemplateDraftAutosave({
    workspaceId,
    templateId: template?.id ?? null,
    userId: user?.id,
    instance,
    disabled: !canWrite || !template,
  });

  // Local-only toast (once per transition).
  const prevStatusRef = useRef<AutosaveStatus>('idle');
  useEffect(() => {
    if (autosave.status === 'local_only' && prevStatusRef.current !== 'local_only') {
      notify.warn(t('templates.autosave.localOnlyToast'));
    }
    prevStatusRef.current = autosave.status;
  }, [autosave.status, t]);

  const performClose = useCallback(() => {
    onClose();
    setReviewNotes('');
  }, [onClose]);

  const guardedClose = useCallback(async () => {
    // Try to flush first; never discard dirty data silently.
    const ok = await autosave.flush();
    if (!ok && autosave.status !== 'idle') {
      confirmClose({
        title: t('templates.autosave.unsavedExitTitle'),
        description: t('templates.autosave.unsavedExitDescription'),
        confirmLabel: t('templates.autosave.unsavedExitConfirm'),
        variant: 'destructive',
        onConfirm: performClose,
      });
      return;
    }
    performClose();
  }, [autosave, confirmClose, performClose, t]);

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    void guardedClose();
  };

  const handleFieldChange = (fieldId: string, value: unknown) => {
    autosave.setField(fieldId, value);
  };

  const handleSaveNow = async () => {
    const ok = await autosave.flush();
    if (ok) notify.success(t('templates.autosave.saved'));
    else notify.warn(t('templates.autosave.localOnlyToast'));
  };

  const requireFlushed = async (): Promise<string | null> => {
    const ok = await autosave.flush();
    if (!ok) {
      notify.error(t('templates.autosave.failed'));
      return null;
    }
    return autosave.instanceId;
  };

  const handleMarkComplete = async () => {
    const id = await requireFlushed();
    if (!id) return;
    try {
      await completeInstance.mutateAsync(id);
      notify.success(t('templates.completed'));
    } catch {
      notify.error(t('templates.submitFailed'));
    }
  };

  const handleSubmitForReview = async () => {
    const id = await requireFlushed();
    if (!id) return;
    try {
      await submitForReview.mutateAsync(id);
      notify.success(t('templates.submittedForReview'));
    } catch {
      notify.error(t('templates.submitFailed'));
    }
  };

  const handleReview = async (status: 'approved' | 'needs_changes') => {
    const id = autosave.instanceId ?? instance?.id;
    if (!id) return;
    try {
      await reviewInstance.mutateAsync({
        instanceId: id,
        review_status: status,
        review_notes: reviewNotes.trim() || undefined,
      });
      notify.success(status === 'approved' ? t('templates.approved') : t('templates.requestChanges'));
      setReviewNotes('');
    } catch {
      notify.error(t('templates.submitFailed'));
    }
  };

  const openHelp = () => {
    // Re-use existing global AI assistant trigger if available; otherwise no-op gracefully.
    try {
      window.dispatchEvent(new CustomEvent('open-ai-assistant'));
    } catch {
      /* noop */
    }
  };

  if (!template) return null;

  const formData = autosave.data;
  const busyFlush = autosave.status === 'saving';
  const actionsBlocked = busyFlush || autosave.status === 'local_only';

  const schema = template.schema_json;
  if (!schema?.sections) {
    return (
      <>
        <Dialog open={!!template} onOpenChange={handleOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{template.name}</DialogTitle>
            </DialogHeader>
            <div className="py-8 text-center text-muted-foreground">
              {t('templates.noSchemaConfigured', 'This template has no form schema configured.')}
            </div>
          </DialogContent>
        </Dialog>
        <ConfirmDialog {...confirmCloseProps} />
      </>
    );
  }

  return (
    <>
    <Dialog open={!!template} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] !flex !flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="shrink-0 px-6 pt-6 pb-3 border-b">
          <DialogTitle className="flex items-center justify-between gap-3">
            <span className="truncate">{getLocalizedTemplateMeta(template, t).title}</span>
            <div className="flex items-center gap-2 shrink-0">
              <AutosaveBadge status={autosave.status} lastSavedAt={autosave.lastSavedAt} />
              {instance?.status === 'completed' && (
                <Badge className="bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]">{t('templates.completed', 'Completed')}</Badge>
              )}
              <Button variant="ghost" size="sm" onClick={openHelp} className="gap-1">
                <HelpCircle className="h-4 w-4" />
                <span className="hidden sm:inline">{t('templates.autosave.needHelp')}</span>
              </Button>
            </div>
          </DialogTitle>
          {template.description && (
            <p className="text-sm text-muted-foreground">{getLocalizedTemplateMeta(template, t).description}</p>
          )}
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-6">
          <div className="space-y-6 py-4">
            {autosave.restoredFromLocal && (
              <Alert>
                <CircleAlert className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span>{t('templates.autosave.restoredBanner')}</span>
                  <Button variant="ghost" size="sm" onClick={autosave.dismissRestoredBanner}>
                    {t('templates.autosave.restoredBannerDismiss')}
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {/* Document Upload Section (for dataroom-linked templates) */}
            {templateUploadConfig && (
              <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 space-y-3">
                <div>
                  <h3 className="font-medium text-sm flex items-center gap-2">
                    <Upload className="h-4 w-4" />
                    {t(templateUploadConfig.labelKey, { defaultValue: templateUploadConfig.defaultLabel })}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t('dataroomChecklist.uploadDesc', { defaultValue: 'Faça upload do seu ficheiro. A checklist abaixo serve como guia do conteúdo que deve incluir.' })}
                  </p>
                </div>
                {existingUploadDoc ? (
                  <div className="flex items-center gap-3 p-3 rounded-md bg-muted/50">
                    <FileText className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{existingUploadDoc.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('dataroomChecklist.docUploaded', { defaultValue: 'Documento carregado' })}
                      </p>
                    </div>
                    {canWrite && (
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          className="hidden"
                          accept=".pdf,.ppt,.pptx,.key,.doc,.docx,.xls,.xlsx"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            try {
                              await uploadDocument.mutateAsync({
                                workspaceId,
                                file,
                                category: templateUploadConfig.category,
                              });
                            } catch { /* handled by hook */ }
                          }}
                        />
                        <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                          {t('common.replace', { defaultValue: 'Substituir' })}
                        </Badge>
                      </label>
                    )}
                  </div>
                ) : canWrite ? (
                  <label className="cursor-pointer flex items-center justify-center gap-2 p-4 rounded-md border border-dashed border-primary/30 hover:bg-primary/5 transition-colors">
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.ppt,.pptx,.key,.doc,.docx,.xls,.xlsx"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          await uploadDocument.mutateAsync({
                            workspaceId,
                            file,
                            category: templateUploadConfig.category,
                          });
                        } catch { /* handled by hook */ }
                      }}
                    />
                    <Upload className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-primary">
                      {t('dataroomChecklist.selectFile', { defaultValue: 'Selecionar ficheiro' })}
                    </span>
                  </label>
                ) : null}
              </div>
            )}
            {schema.sections.length > 1 && (
              <nav
                aria-label={t('templates.sectionNav', { defaultValue: 'Sections' })}
                className="sticky top-0 z-10 -mx-6 px-6 py-2 bg-background/95 backdrop-blur border-b flex flex-wrap gap-2"
              >
                {schema.sections.map((section, sIdx) => (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => {
                      const el = document.getElementById(`tpl-section-${sIdx}`);
                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }}
                    className="text-xs px-2.5 py-1 rounded-full border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {sIdx + 1}. {translateSectionTitle(section.title, t)}
                  </button>
                ))}
              </nav>
            )}
            {schema.sections.map((section, sIdx) => (
              <div key={sIdx} id={`tpl-section-${sIdx}`} className="space-y-4 scroll-mt-16">
                <div>
                  <h3 className="font-medium text-sm">{translateSectionTitle(section.title, t)}</h3>
                  {section.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{section.description}</p>
                  )}
                </div>
                <div className="space-y-4 pl-4 border-l-2 border-muted">
                  {section.fields.map(field => (
                    <TemplateFormField
                      key={field.id}
                      field={field}
                      value={formData[field.id]}
                      onChange={(val) => handleFieldChange(field.id, val)}
                      onBlur={() => { void autosave.flush(); }}
                      disabled={!canWrite}
                    />
                  ))}
                </div>
              </div>
            ))}

            {/* Review feedback display */}
            {instance?.review_status === 'needs_changes' && instance.review_notes && (
              <Alert className="border-[hsl(var(--warning))]/30 bg-[hsl(var(--warning))]/10">
                <MessageSquare className="h-4 w-4 text-[hsl(var(--warning))]" />
                <AlertDescription className="text-sm">
                  <strong>{t('templates.reviewerFeedback', 'Reviewer feedback')}:</strong> {instance.review_notes}
                </AlertDescription>
              </Alert>
            )}

            {/* AI Coach Panel for consultants/mentors */}
            {canReview && (autosave.instanceId ?? instance?.id) && (
              <TemplateCoachPanel
                instanceId={(autosave.instanceId ?? instance?.id) as string}
                workspaceId={workspaceId}
                onCopyToNotes={(notes) => setReviewNotes(notes)}
                showReviewActions={instance?.review_status === 'pending_review'}
                onApplyReview={(recommendation, notes) => {
                  setReviewNotes(notes);
                  handleReview(recommendation);
                }}
              />
            )}

            {/* Review section for consultants/mentors */}
            {canReview && instance?.review_status === 'pending_review' && (
              <div className="border-t pt-4 space-y-3">
                <Label>{t('templates.reviewNotesOptional', 'Review Notes (optional)')}</Label>
                <Textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder={t('templates.feedbackPlaceholder', 'Add feedback for the founder...')}
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button onClick={() => handleReview('approved')} className="flex-1">
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    {t('templates.approve', 'Approve')}
                  </Button>
                  <Button variant="outline" onClick={() => handleReview('needs_changes')} className="flex-1">
                    {t('templates.requestChanges', 'Request Changes')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer actions - role-specific */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-6 py-3 border-t bg-background">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="outline" onClick={() => void guardedClose()}>
              {t('common.close', 'Close')}
            </Button>
            <AutosaveBadge status={autosave.status} lastSavedAt={autosave.lastSavedAt} />
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            {canWrite && isFounder && (
              <Button
                variant="outline"
                onClick={handleSaveNow}
                disabled={busyFlush}
              >
                <Save className="h-4 w-4 mr-1" />
                {t('templates.autosave.saveNow')}
              </Button>
            )}
            {canWrite && isFounder && instance?.review_status !== 'pending_review' && instance?.review_status !== 'approved' && (
              <Button
                variant="outline"
                onClick={handleSubmitForReview}
                disabled={actionsBlocked || submitForReview.isPending}
              >
                <Send className="h-4 w-4 mr-1" />
                {t('templates.submitForReview')}
              </Button>
            )}
            {canWrite && isFounder && instance?.status !== 'completed' && (
              <Button
                onClick={handleMarkComplete}
                disabled={actionsBlocked || completeInstance.isPending}
              >
                <Check className="h-4 w-4 mr-1" />
                {t('templates.markComplete', 'Mark Complete')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
    <ConfirmDialog {...confirmCloseProps} />
    </>
  );
}

interface TemplateFormFieldProps {
  field: TemplateField;
  value: unknown;
  onChange: (value: unknown) => void;
  onBlur?: () => void;
  disabled: boolean;
}

// Map database field IDs/labels to translation keys
const FIELD_LABEL_MAP: Record<string, string> = {
  'investor_name': 'investorName',
  'meeting_date': 'meetingDate',
  'meeting_type': 'meetingType',
  'investor_focus': 'investorFocus',
  'portfolio_companies': 'portfolioCompanies',
  'recent_investments': 'recentInvestments',
  'unique_angle': 'uniqueAngle',
  'expected_questions': 'expectedQuestions',
  'your_questions': 'yourQuestions',
  'meeting_details': 'meetingDetails',
  'research': 'research',
  'key_messages': 'keyMessages',
  'summary': 'summary',
  'highlights': 'highlights',
  'challenges': 'challenges',
  'next_steps': 'nextSteps',
  'metrics': 'metrics',
  'goals': 'goals',
  'notes': 'notes',
  'description': 'description',
  'status': 'status',
  'priority': 'priority',
  'due_date': 'dueDate',
  'assignee': 'assignee',
  'category': 'category',
  'tags': 'tags',
  'comments': 'comments',
};

// Map section titles to translation keys
const SECTION_TITLE_MAP: Record<string, string> = {
  'Meeting Details': 'meetingDetails',
  'Research': 'research',
  'Key Messages': 'keyMessages',
  'Summary': 'summary',
  'Highlights': 'highlights',
  'Challenges': 'challenges',
  'Next Steps': 'nextSteps',
  'Metrics': 'metrics',
  'Goals': 'goals',
};

function TemplateFormField({ field, value, onChange, onBlur, disabled }: TemplateFormFieldProps) {
  const { t } = useTranslation();
  
  // Try to get translated label
  const translationKey = FIELD_LABEL_MAP[field.id];
  const translatedLabel = translationKey 
    ? t(`templates.formFields.${translationKey}`, field.label)
    : field.label;

  const renderField = () => {
    switch (field.type) {
      case 'text':
        return (
          <Input
            value={(value as string) || ''}
            onChange={e => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder={field.placeholder}
            disabled={disabled}
          />
        );
      
      case 'textarea':
        return (
          <Textarea
            value={(value as string) || ''}
            onChange={e => onChange(e.target.value)}
            onBlur={onBlur}
            placeholder={field.placeholder}
            rows={field.rows || 3}
            disabled={disabled}
          />
        );
      
      case 'number':
        return (
          <Input
            type="number"
            value={(value as number) ?? ''}
            onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : null)}
            onBlur={onBlur}
            placeholder={field.placeholder}
            disabled={disabled}
          />
        );
      
      case 'checkbox':
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              checked={!!value}
              onCheckedChange={checked => onChange(checked)}
              disabled={disabled}
            />
            <span className="text-sm">{field.placeholder}</span>
          </div>
        );
      
      case 'checklist': {
        const checkedItems = (value as string[]) || [];
        return (
          <div className="space-y-2">
            {field.options?.map((option, idx) => (
              <div key={idx} className="flex items-start gap-2">
                <Checkbox
                  checked={checkedItems.includes(option)}
                  onCheckedChange={checked => {
                    if (checked) {
                      onChange([...checkedItems, option]);
                    } else {
                      onChange(checkedItems.filter(i => i !== option));
                    }
                  }}
                  disabled={disabled}
                  className="mt-0.5"
                />
                <span className="text-sm">{option}</span>
              </div>
            ))}
          </div>
        );
      }
      
      default:
        return null;
    }
  };

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {translatedLabel}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </Label>
      {renderField()}
    </div>
  );
}

// Helper to translate section titles
export function translateSectionTitle(title: string, t: ReturnType<typeof useTranslation>['t']): string {
  const translationKey = SECTION_TITLE_MAP[title];
  return translationKey ? t(`templates.formFields.${translationKey}`) || title : title;
}
