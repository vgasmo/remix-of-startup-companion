import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { 
  Upload, FileSpreadsheet, Download, RefreshCw, Calculator, TrendingUp, 
  Loader2, CheckCircle2, AlertTriangle, XCircle, Sparkles, ChevronDown,
  ChevronUp, ArrowRight, Lightbulb, Target, ListChecks, Copy, Calendar,
  TrendingDown, Zap, Clock, Users, FileDown
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { useDateLocale } from '@/lib/dateLocale';
import { useTranslation } from 'react-i18next';
import { notify } from "@/lib/notify";
import { supabase } from '@/lib/supabaseClient';
import { useUploadDocument, useGetDocumentUrl, Document } from '@/hooks/useDocuments';
import {
  useFinancialModelVersions,
  useCreateFinancialModelVersion,
  useParseFinancialModel,
  useSyncFinancialKpis,
  useGenerateFinancialModelReview,
  useCreateActionsFromInsights,
  useCreateActionsFromAIReview,
  useSetActiveFinancialVersion,
  generateInsights,
  FinancialModelVersion,
  KeyMetrics,
  AIReview,
  FinancialInsight,
} from '@/hooks/useFinancialModel';
import { logger } from '@/lib/logger';
import { useFeatureFlag } from '@/hooks/useFeatureFlags';
import { GuidedPlanTab } from './financial-plan/GuidedPlanTab';

interface FinancialModelPanelProps {
  workspaceId: string;
  canWrite: boolean;
  /** Mentors have read-only access to the financial plan — they can review
   *  scenarios and insights but must not edit assumptions. */
  isMentor?: boolean;
}

const SCENARIOS = ['Base', 'Conservative', 'Optimistic', 'Custom'];

function MetricCard({ 
  label, 
  value, 
  unit, 
  trend,
  comparison 
}: { 
  label: string; 
  value: number | null; 
  unit: string;
  trend?: 'up' | 'down' | 'neutral';
  comparison?: { prev: number | null; label: string };
}) {
  const { t, i18n } = useTranslation();
  if (value === null) return null;
  
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : null;
  const trendColor = trend === 'up' ? 'text-[hsl(var(--success))]' : trend === 'down' ? 'text-destructive' : 'text-muted-foreground';
  const locale = i18n.language === 'pt' ? 'pt-PT' : 'en-US';
  const fmt1 = (n: number) => new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
  const fmtCurrency = (n: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  const monthsLabel = Math.abs(value) === 1
    ? t('financialPanel.month', { defaultValue: i18n.language === 'pt' ? 'mês' : 'month' })
    : t('financialPanel.months', { defaultValue: i18n.language === 'pt' ? 'meses' : 'months' });

  return (
    <div className="p-3 rounded-lg border bg-card">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-semibold">
          {unit === '€' ? fmtCurrency(value) : 
           unit === '%' ? `${fmt1(value)}%` :
           unit === 'ratio' ? `${fmt1(value)}x` :
           unit === 'months' ? fmt1(value) :
           new Intl.NumberFormat(locale).format(value)}
        </span>
        {unit === 'months' && <span className="text-xs text-muted-foreground">{monthsLabel}</span>}
      </div>
      {TrendIcon && (
        <div className={`flex items-center gap-1 text-xs mt-1 ${trendColor}`}>
          <TrendIcon className="h-3 w-3" />
          {comparison && comparison.prev !== null && (
            <span>vs {new Intl.NumberFormat(locale).format(comparison.prev)} ({comparison.label})</span>
          )}
        </div>
      )}
    </div>
  );
}

function InsightCard({ insight, onCreateAction, createActionLabel }: { insight: FinancialInsight; onCreateAction?: () => void; createActionLabel?: string }) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const severityConfig = {
    critical: { bg: 'bg-destructive/10', border: 'border-destructive/30', icon: XCircle, color: 'text-destructive' },
    warning: { bg: 'bg-[hsl(var(--warning))]/10', border: 'border-[hsl(var(--warning))]/30', icon: AlertTriangle, color: 'text-[hsl(var(--warning))]' },
    info: { bg: 'bg-[hsl(var(--info))]/10', border: 'border-[hsl(var(--info))]/30', icon: Lightbulb, color: 'text-[hsl(var(--info))]' },
  };
  
  const config = severityConfig[insight.severity];
  const Icon = config.icon;
  
  return (
    <div className={`p-3 rounded-lg border ${config.bg} ${config.border}`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 mt-0.5 ${config.color}`} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{insight.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{insight.description}</p>
          {insight.suggested_action && onCreateAction && (
            <Button size="sm" variant="outline" className="mt-2 h-7 text-xs" onClick={onCreateAction}>
              <ArrowRight className="h-3 w-3 mr-1" />
              {createActionLabel || t('actions.createAction', 'Criar Ação')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function FinancialModelPanel({ workspaceId, canWrite, isMentor = false }: FinancialModelPanelProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const { data: versions, isLoading } = useFinancialModelVersions(workspaceId);
  const uploadMutation = useUploadDocument();
  const createVersion = useCreateFinancialModelVersion(workspaceId);
  const parseModel = useParseFinancialModel();
  const syncKpis = useSyncFinancialKpis(workspaceId);
  const generateReview = useGenerateFinancialModelReview();
  const createActionsFromInsights = useCreateActionsFromInsights(workspaceId);
  const createActionsFromAI = useCreateActionsFromAIReview(workspaceId);
  const setActiveVersion = useSetActiveFinancialVersion(workspaceId);
  const getDocumentUrl = useGetDocumentUrl();

  const [uploadOpen, setUploadOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState('Base');
  const [selectedVersion, setSelectedVersion] = useState<FinancialModelVersion | null>(null);
  const [aiReviewMode, setAiReviewMode] = useState<'full' | 'investor' | 'mentor_prep'>('full');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['metrics', 'insights']));
  const [templateAvailable, setTemplateAvailable] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const latestVersion = versions?.[0];
  const activeVersion = selectedVersion || latestVersion;
  const metrics = activeVersion?.key_metrics_json;
  const aiReview = activeVersion?.ai_review_json;
  const insights = metrics ? generateInsights(metrics) : [];

  // Template download URL (public bucket)
  const TEMPLATE_BUCKET = 'public-assets';
  const TEMPLATE_PATH = 'templates/Template_Avaliacao_Startup_Ecossistema.xlsm';
  
  const getTemplateUrl = () => {
    const { data } = supabase.storage
      .from(TEMPLATE_BUCKET)
      .getPublicUrl(TEMPLATE_PATH);
    return data.publicUrl;
  };

  // Check if template exists on mount - using useEffect instead of useState
  useEffect(() => {
    const checkTemplate = async () => {
      try {
        const url = getTemplateUrl();
        const response = await fetch(url, { method: 'HEAD' });
        setTemplateAvailable(response.ok);
      } catch {
        setTemplateAvailable(false);
      }
    };
    checkTemplate();
  }, []);

  const handleDownloadTemplate = async () => {
    const url = getTemplateUrl();
    const filename = TEMPLATE_PATH.split('/').pop() || 'financial-template.xlsm';

    // XLSM files are treated as macro-enabled and some browsers refuse to
    // preview them — fetch as a blob and click a hidden anchor so we get a
    // real "Save As" dialog on every browser instead of a broken new tab.
    try {
      const response = await fetch(url);
      if (!response.ok) {
        notify.error(t('workspace.templateNotAvailableYetAsk'));
        return;
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      // Free the blob after the download prompt kicks in.
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
    } catch {
      notify.error(t('workspace.templateNotAvailableYetAsk'));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type - check extension first (more reliable than MIME)
    const fileName = file.name.toLowerCase();
    const isValidExtension = /\.(xlsx|xlsm|xls|csv)$/i.test(fileName);
    
    if (!isValidExtension) {
      notify.error(t('workspace.pleaseUploadAnExcelXlsx'));
      return;
    }

    try {
      // Upload document
      const document = await uploadMutation.mutateAsync({
        workspaceId,
        file,
        category: 'Financial Model',
        description: `Financial Model - ${scenarioName} scenario`,
      });

      // Create version
      const version = await createVersion.mutateAsync({
        documentId: document.id,
        scenarioName,
      });

      setUploadOpen(false);
      setScenarioName('Base');
      if (fileInputRef.current) fileInputRef.current.value = '';

      // Auto-parse
      await parseModel.mutateAsync(version.id);
    } catch (error) {
      logger.error('Upload failed', {}, error);
    }
  };

  const handleParse = async () => {
    if (!activeVersion) return;
    await parseModel.mutateAsync(activeVersion.id);
  };

  const handleSyncKpis = async () => {
    if (!activeVersion) return;
    await syncKpis.mutateAsync(activeVersion.id);
  };

  const handleGenerateAIReview = async () => {
    if (!activeVersion) return;
    try {
      await generateReview.mutateAsync({ versionId: activeVersion.id, mode: aiReviewMode });
    } catch {
      // mutation onError already toasts — no additional action needed
    }
  };

  const handleCreateAllInsightActions = async () => {
    const actionsToCreate = insights.filter(i => i.suggested_action);
    if (actionsToCreate.length === 0) {
      notify.info(t('workspace.noActionableInsights'));
      return;
    }
    await createActionsFromInsights.mutateAsync(actionsToCreate);
  };

  const handleCreateAIActions = async () => {
    if (!aiReview?.recommended_actions?.length) return;
    await createActionsFromAI.mutateAsync(aiReview.recommended_actions);
  };

  const handleDownload = async () => {
    if (!activeVersion?.document?.file_path) return;
    try {
      const url = await getDocumentUrl(activeVersion.document.file_path);
      window.open(url, '_blank');
    } catch {
      notify.error(t('workspace.failedToDownload'));
    }
  };

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  };

  const copyInvestorNarrative = () => {
    if (!aiReview?.investor_narrative) return;
    navigator.clipboard.writeText(aiReview.investor_narrative);
    notify.success(t('workspace.copiedToClipboard'));
  };

  // Hooks must run before any conditional return (Rules of Hooks).
  const guidedPlanEnabled = useFeatureFlag('financial_business_plan_coach_v1', undefined, workspaceId);

  if (isLoading) {
    return <Skeleton className="h-64" />;
  }


  return (
    <>
    {guidedPlanEnabled && (
      <div className="mb-4">
        <GuidedPlanTab workspaceId={workspaceId} canWrite={canWrite && !isMentor} />
      </div>
    )}
    <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              {t('financialPanel.title', { defaultValue: 'Financial Model' })}
            </CardTitle>
            <CardDescription>
              {t('financialPanel.description', { defaultValue: 'Upload, parse, and analyze your financial projections' })}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleDownloadTemplate}>
              <FileDown className="h-4 w-4 mr-2" />
              {t('financialPanel.downloadTemplate', { defaultValue: 'Download Template' })}
            </Button>
            {canWrite && !isMentor && (
              <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Upload className="h-4 w-4 mr-2" />
                    {versions?.length ? t('financialPanel.newVersion', { defaultValue: 'New Version' }) : t('financialPanel.uploadModel', { defaultValue: 'Upload Model' })}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t('financialPanel.uploadTitle', { defaultValue: 'Upload Financial Model' })}</DialogTitle>
                    <DialogDescription>
                      {t('financialPanel.uploadDesc', { defaultValue: 'Supports Excel (.xlsx, .xlsm, .xls) and CSV files' })}
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div>
                      <Label>{t('financialPanel.scenario', { defaultValue: 'Scenario' })}</Label>
                      <Select value={scenarioName} onValueChange={setScenarioName}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SCENARIOS.map(s => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>{t('financialPanel.file', { defaultValue: 'File' })}</Label>
                      <Input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xlsm,.xls,.csv"
                        onChange={handleFileUpload}
                        disabled={uploadMutation.isPending || createVersion.isPending}
                      />
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {!versions?.length ? (
          <div className="text-center py-8 border-2 border-dashed rounded-lg">
            <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground mb-2">{t('financialPanel.noModelYet', { defaultValue: 'No financial model uploaded yet' })}</p>
            <p className="text-sm text-muted-foreground">
              {t('financialPanel.noModelDesc', { defaultValue: 'Upload your Excel model to track KPIs, get insights, and AI recommendations' })}
            </p>
          </div>
        ) : (
          <>
            {/* Version Selector */}
            {versions.length > 1 && (
              <div className="flex items-center gap-2">
                <Label className="text-xs">{t('financialPanel.version', { defaultValue: 'Version:' })}</Label>
                <Select 
                  value={activeVersion?.id || ''} 
                  onValueChange={(id) => setSelectedVersion(versions.find(v => v.id === id) || null)}
                >
                  <SelectTrigger className="w-64 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.scenario_name} - {format(new Date(v.uploaded_at), 'MMM d, yyyy HH:mm', { locale: dateLocale })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Current Version Info */}
            {activeVersion && (
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-[hsl(var(--success))]/10 flex items-center justify-center">
                    <FileSpreadsheet className="h-5 w-5 text-[hsl(var(--success))]" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{activeVersion.document?.name || t('financialPanel.title', { defaultValue: 'Financial Model' })}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs h-5">
                        {activeVersion.scenario_name}
                      </Badge>
                      <span>{formatDistanceToNow(new Date(activeVersion.uploaded_at), { addSuffix: true })}</span>
                      <Badge 
                        variant={activeVersion.status === 'parsed' ? 'default' : 
                                activeVersion.status === 'failed' ? 'destructive' : 'secondary'}
                        className="text-xs h-5"
                      >
                        {activeVersion.status === 'parsed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                        {activeVersion.status === 'failed' && <XCircle className="h-3 w-3 mr-1" />}
                        {activeVersion.status === 'parsing' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                        {activeVersion.status}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handleDownload}>
                    <Download className="h-4 w-4" />
                  </Button>
                  {activeVersion.status === 'uploaded' && canWrite && (
                    <Button size="sm" onClick={handleParse} disabled={parseModel.isPending} loading={parseModel.isPending}>
                      {parseModel.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
                      {t('financialPanel.parse', { defaultValue: 'Parse' })}
                    </Button>
                  )}
                  {activeVersion.status === 'failed' && canWrite && (
                    <Button size="sm" variant="outline" onClick={handleParse} disabled={parseModel.isPending} loading={parseModel.isPending}>
                      <RefreshCw className="h-4 w-4 mr-1" />
                      {t('financialPanel.retry', { defaultValue: 'Retry' })}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Parse Error */}
            {activeVersion?.parse_error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-destructive mt-0.5" />
                  <div>
                    <p className="font-medium text-destructive">{t('financialPanel.parseError', { defaultValue: 'Parse Error' })}</p>
                    <p className="text-muted-foreground">{activeVersion.parse_error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Parsed Content */}
            {activeVersion?.status === 'parsed' && metrics && (
              <Tabs defaultValue="metrics" className="space-y-4">
                <TabsList>
                  <TabsTrigger value="metrics">{t('financialPanel.keyMetrics', { defaultValue: 'Key Metrics' })}</TabsTrigger>
                  <TabsTrigger value="insights">
                    {t('financialPanel.insights', { defaultValue: 'Insights' })}
                    {insights.filter(i => i.severity !== 'info').length > 0 && (
                      <Badge variant="secondary" className="ml-1.5 h-5 text-xs">
                        {insights.filter(i => i.severity !== 'info').length}
                      </Badge>
                    )}
                  </TabsTrigger>
                  <TabsTrigger value="ai">{t('financialPanel.aiReview', { defaultValue: 'AI Review' })}</TabsTrigger>
                </TabsList>

                <TabsContent value="metrics" className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <MetricCard label={t('financialPanel.runway', { defaultValue: 'Runway' })} value={metrics.runway_months} unit="months" />
                    <MetricCard label={t('financialPanel.monthlyBurn', { defaultValue: 'Monthly Burn' })} value={metrics.burn_rate_monthly} unit="€" />
                    <MetricCard label={t('financialPanel.grossMargin', { defaultValue: 'Gross Margin' })} value={metrics.gross_margin_pct} unit="%" />
                    <MetricCard label={t('financialPanel.cashBalance', { defaultValue: 'Cash Balance' })} value={metrics.cash_end} unit="€" />
                    <MetricCard label={t('financialPanel.cac', { defaultValue: 'CAC' })} value={metrics.cac} unit="€" />
                    <MetricCard label={t('financialPanel.ltv', { defaultValue: 'LTV' })} value={metrics.ltv} unit="€" />
                    <MetricCard label={t('financialPanel.ltvCac', { defaultValue: 'LTV/CAC' })} value={metrics.ltv_cac} unit="ratio" />
                    <MetricCard label={t('financialPanel.payback', { defaultValue: 'Payback' })} value={metrics.payback_months} unit="months" />
                    <MetricCard label={t('financialPanel.churn', { defaultValue: 'Churn' })} value={metrics.churn_monthly_pct} unit="%" />
                    <MetricCard label={t('financialPanel.treasuryNeed', { defaultValue: 'Treasury Need' })} value={metrics.treasury_need} unit="€" />
                  </div>

                  {canWrite && (
                    <div className="flex justify-end">
                      <Button size="sm" onClick={handleSyncKpis} disabled={syncKpis.isPending} loading={syncKpis.isPending}>
                        {syncKpis.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Target className="h-4 w-4 mr-1" />}
                        {t('financialPanel.syncToKpis', { defaultValue: 'Sync to KPIs' })}
                      </Button>
                    </div>
                  )}
                </TabsContent>

                <TabsContent value="insights" className="space-y-4">
                  {insights.length === 0 ? (
                    <div className="flex flex-col items-center text-center py-6">
                      <div className="h-10 w-10 rounded-full bg-muted/60 flex items-center justify-center mb-2">
                        <Sparkles className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-medium text-foreground mb-0.5">
                        {t('financialPanel.noInsightsTitle', { defaultValue: 'Sem insights disponíveis' })}
                      </p>
                      <p className="text-xs text-muted-foreground max-w-[260px]">
                        {t('financialPanel.notEnoughData', { defaultValue: 'Carregue mais dados ou versões do modelo financeiro para gerar insights automáticos.' })}
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-2">
                        {insights.map((insight, idx) => (
                          <InsightCard 
                            key={idx} 
                            insight={insight}
                            onCreateAction={insight.suggested_action && canWrite ? () => {
                              createActionsFromInsights.mutate([insight]);
                            } : undefined}
                          />
                        ))}
                      </div>

                      {canWrite && insights.some(i => i.suggested_action) && (
                        <div className="flex justify-end">
                          <Button 
                            size="sm" 
                            onClick={handleCreateAllInsightActions}
                            disabled={createActionsFromInsights.isPending} loading={createActionsFromInsights.isPending}
                          >
                            {createActionsFromInsights.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                             <ListChecks className="h-4 w-4 mr-1" />
                           )}
                           {t('financialPanel.createAllActions', { defaultValue: 'Create All Actions' })}
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </TabsContent>

                <TabsContent value="ai" className="space-y-4">
                  {!aiReview ? (
                    <div className="text-center py-6 space-y-4">
                      <Sparkles className="h-8 w-8 mx-auto text-primary/50" />
                      <div>
                       <p className="font-medium">{t('financialPanel.aiFinancialReview', { defaultValue: 'AI Financial Review' })}</p>
                       <p className="text-sm text-muted-foreground">
                         {t('financialPanel.aiReviewDesc', { defaultValue: 'Get AI-powered analysis with actionable recommendations' })}
                       </p>
                      </div>
                      {canWrite && (
                        <div className="flex items-center justify-center gap-2">
                          <Select value={aiReviewMode} onValueChange={(v) => setAiReviewMode(v as typeof aiReviewMode)}>
                            <SelectTrigger className="w-40 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="full">{t('financialPanel.fullReview', { defaultValue: 'Full Review' })}</SelectItem>
                              <SelectItem value="investor">{t('financialPanel.investorFocus', { defaultValue: 'Investor Focus' })}</SelectItem>
                              <SelectItem value="mentor_prep">{t('financialPanel.mentorPrep', { defaultValue: 'Mentor Prep' })}</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button onClick={handleGenerateAIReview} disabled={generateReview.isPending} loading={generateReview.isPending}>
                            {generateReview.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <Sparkles className="h-4 w-4 mr-1" />
                             )}
                             {t('financialPanel.generateReview', { defaultValue: 'Generate Review' })}
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Summary */}
                      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                        <p className="text-sm">{aiReview.summary}</p>
                        {activeVersion.ai_review_generated_at && (
                          <p className="text-xs text-muted-foreground mt-2">
                            Generated {formatDistanceToNow(new Date(activeVersion.ai_review_generated_at), { addSuffix: true })}
                          </p>
                        )}
                      </div>

                      {/* Questions */}
                      {aiReview.questions?.length > 0 && (
                        <Collapsible open={expandedSections.has('questions')}>
                          <CollapsibleTrigger 
                            className="flex items-center gap-2 w-full text-left py-2"
                            onClick={() => toggleSection('questions')}
                          >
                            {expandedSections.has('questions') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            <span className="font-medium text-sm">{t('financialPanel.questionsToExplore', { defaultValue: 'Questions to Explore' })} ({aiReview.questions.length})</span>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-2 pt-2">
                            {aiReview.questions.map((q, idx) => (
                              <div key={idx} className="p-3 rounded-lg border bg-card text-sm">
                                <p className="font-medium">{q.q}</p>
                                <p className="text-xs text-muted-foreground mt-1">{q.why}</p>
                              </div>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {/* Risks */}
                      {aiReview.risks?.length > 0 && (
                        <Collapsible open={expandedSections.has('risks')}>
                          <CollapsibleTrigger 
                            className="flex items-center gap-2 w-full text-left py-2"
                            onClick={() => toggleSection('risks')}
                          >
                            {expandedSections.has('risks') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            <span className="font-medium text-sm">{t('financialPanel.risks', { defaultValue: 'Risks' })} ({aiReview.risks.length})</span>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-2 pt-2">
                            {aiReview.risks.map((r, idx) => (
                              <div key={idx} className="p-3 rounded-lg border bg-card text-sm">
                                <div className="flex items-center gap-2">
                                  <Badge variant={r.severity === 'high' ? 'destructive' : r.severity === 'medium' ? 'secondary' : 'outline'}>
                                    {r.severity}
                                  </Badge>
                                  <span className="font-medium">{r.risk}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{t('financial.mitigation', 'Mitigação')}: {r.mitigation}</p>
                              </div>
                            ))}
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {/* Recommended Actions */}
                      {aiReview.recommended_actions?.length > 0 && (
                        <Collapsible open={expandedSections.has('actions')} defaultOpen>
                          <CollapsibleTrigger 
                            className="flex items-center gap-2 w-full text-left py-2"
                            onClick={() => toggleSection('actions')}
                          >
                            {expandedSections.has('actions') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            <span className="font-medium text-sm">{t('financialPanel.recommendedActions', { defaultValue: 'Recommended Actions' })} ({aiReview.recommended_actions.length})</span>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="space-y-2 pt-2">
                            {aiReview.recommended_actions.map((a, idx) => (
                              <div key={idx} className="p-3 rounded-lg border bg-card text-sm">
                                <div className="flex items-center justify-between">
                                  <span className="font-medium">{a.title}</span>
                                  <div className="flex items-center gap-1">
                                    <Badge variant={a.priority === 'urgent' ? 'destructive' : 'secondary'}>{a.priority}</Badge>
                                    <Badge variant="outline">{a.due_in_days}d</Badge>
                                  </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{a.description}</p>
                              </div>
                            ))}
                            {canWrite && (
                              <Button 
                                size="sm" 
                                className="w-full"
                                onClick={handleCreateAIActions}
                                disabled={createActionsFromAI.isPending} loading={createActionsFromAI.isPending}
                              >
                                {createActionsFromAI.isPending ? (
                                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                                ) : (
                                  <ListChecks className="h-4 w-4 mr-1" />
                                 )}
                                 {t('financialPanel.createAllActions', { defaultValue: 'Create All Actions' })}
                              </Button>
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {/* Next Session Agenda */}
                      {aiReview.next_session_agenda?.length > 0 && (
                        <Collapsible open={expandedSections.has('agenda')}>
                          <CollapsibleTrigger 
                            className="flex items-center gap-2 w-full text-left py-2"
                            onClick={() => toggleSection('agenda')}
                          >
                            {expandedSections.has('agenda') ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            <span className="font-medium text-sm">{t('financialPanel.suggestedAgenda', { defaultValue: 'Suggested Agenda' })} ({aiReview.next_session_agenda.length})</span>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pt-2">
                            <ul className="list-disc list-inside space-y-1 text-sm">
                              {aiReview.next_session_agenda.map((item, idx) => (
                                <li key={idx}>{item}</li>
                              ))}
                            </ul>
                          </CollapsibleContent>
                        </Collapsible>
                      )}

                      {/* Investor Narrative */}
                      {aiReview.investor_narrative && (
                        <div className="p-3 rounded-lg border bg-muted/30">
                          <div className="flex items-center justify-between mb-2">
                             <span className="text-xs font-medium text-muted-foreground">{t('financialPanel.investorSnippet', { defaultValue: 'Investor Update Snippet' })}</span>
                             <Button variant="ghost" size="sm" className="h-6" onClick={copyInvestorNarrative}>
                               <Copy className="h-3 w-3 mr-1" />
                               {t('financialPanel.copy', { defaultValue: 'Copy' })}
                            </Button>
                          </div>
                          <p className="text-sm italic">{aiReview.investor_narrative}</p>
                        </div>
                      )}

                      {/* Regenerate */}
                      {canWrite && (
                        <div className="flex items-center justify-end gap-2 pt-2">
                          <Select value={aiReviewMode} onValueChange={(v) => setAiReviewMode(v as typeof aiReviewMode)}>
                            <SelectTrigger className="w-36 h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                               <SelectItem value="full">{t('financialPanel.fullReview', { defaultValue: 'Full Review' })}</SelectItem>
                               <SelectItem value="investor">{t('financialPanel.investorFocus', { defaultValue: 'Investor Focus' })}</SelectItem>
                               <SelectItem value="mentor_prep">{t('financialPanel.mentorPrep', { defaultValue: 'Mentor Prep' })}</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="sm" variant="outline" onClick={handleGenerateAIReview} disabled={generateReview.isPending} loading={generateReview.isPending}>
                             {generateReview.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                             {t('financialPanel.regenerate', { defaultValue: 'Regenerate' })}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </>
        )}
      </CardContent>
    </Card>
    </>
  );
}
