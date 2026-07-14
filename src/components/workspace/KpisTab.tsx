import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { format, startOfMonth, subMonths, addMonths } from 'date-fns';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, CheckCircle, Save, Plus, Trash2, Settings2, Sparkles, Download, Upload, Lock, Unlock, HelpCircle, Zap, LayoutGrid, List, Check } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { 
  useWorkspaceKpiDefinitions, 
  useKpiValues, 
  useUserWorkspaceRole,
  useUpsertKpiValue,
  useMarkCheckinComplete,
  useAllKpiDefinitions,
  useAddWorkspaceKpi,
  useRemoveWorkspaceKpi,
  useApplyStageDefaults,
  useUnlockKpiValue,
  type WorkspaceKpi,
  type KpiValue,
} from '@/hooks/useKpis';
import { useExportKpis, exportToCsv } from '@/hooks/useExportData';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/hooks/useWorkspaces';
import { notify } from "@/lib/notify";
import { triggerKpiCelebration } from '@/lib/confetti';
import { useTranslation } from 'react-i18next';
import { KpiImportDialog } from './KpiImportDialog';
import { QuickHelp, GlossaryTooltip } from '@/components/ui/GlossaryTooltip';
import { Link, useSearchParams } from 'react-router-dom';
import { KpiSparkline } from './KpiSparkline';
import { useQuickWinToast } from '@/hooks/useQuickWinToast';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import { KpiCard } from './kpis/KpiCard';

interface KpisTabProps {
  workspaceId: string;
  canWrite: boolean;
}

// ── Autosave hook ──────────────────────────────────────────────
// G0 fix: reads latest edited value/month/wk via refs — the previous closure
// captured stale editedValues and lost the last keystroke ("150" saved as "15").
function useAutosave(
  editedValues: Record<string, { value: string; notes: string }>,
  monthValues: Record<string, KpiValue>,
  workspaceKpis: WorkspaceKpi[] | undefined,
  selectedMonthStr: string,
  upsertKpi: ReturnType<typeof useUpsertKpiValue>,
  canEdit: boolean,
) {
  const [savedKpis, setSavedKpis] = useState<Set<string>>(new Set());
  const [savingKpis, setSavingKpis] = useState<Set<string>>(new Set());
  const timerRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Keep the freshest snapshot readable synchronously from any closure.
  const editedRef = useRef(editedValues);
  const monthRef = useRef(monthValues);
  const wksRef = useRef(workspaceKpis);
  const monthStrRef = useRef(selectedMonthStr);
  const upsertRef = useRef(upsertKpi);
  const canEditRef = useRef(canEdit);
  editedRef.current = editedValues;
  monthRef.current = monthValues;
  wksRef.current = workspaceKpis;
  monthStrRef.current = selectedMonthStr;
  upsertRef.current = upsertKpi;
  canEditRef.current = canEdit;

  const saveKpi = useCallback(async (kpiId: string) => {
    if (!canEditRef.current) return;
    const edited = editedRef.current[kpiId];
    const existing = monthRef.current[kpiId];
    const wk = wksRef.current?.find(w => w.kpi_definition_id === kpiId);
    if (!wk) return;

    // Fall back to existing value if the row was never edited (e.g. blur flush).
    const valueStr = edited?.value ?? existing?.value?.toString() ?? '';
    const notes = edited?.notes ?? existing?.notes ?? '';
    const value = valueStr === '' ? null : parseFloat(valueStr);

    if (valueStr !== '' && isNaN(value as number)) return;

    setSavingKpis(prev => new Set(prev).add(kpiId));

    try {
      await upsertRef.current.mutateAsync({
        kpi_definition_id: kpiId,
        period_month: monthStrRef.current,
        value,
        target_value: wk.target_value,
        notes: notes || null,
        existingId: existing?.id,
      });

      setSavedKpis(prev => new Set(prev).add(kpiId));
      setTimeout(() => {
        setSavedKpis(prev => {
          const next = new Set(prev);
          next.delete(kpiId);
          return next;
        });
      }, 2000);
    } catch {
      // Silent fail for autosave — user still has data in state
    } finally {
      setSavingKpis(prev => {
        const next = new Set(prev);
        next.delete(kpiId);
        return next;
      });
    }
  }, []);

  const scheduleAutosave = useCallback((kpiId: string) => {
    if (timerRefs.current[kpiId]) clearTimeout(timerRefs.current[kpiId]);
    timerRefs.current[kpiId] = setTimeout(() => {
      saveKpi(kpiId);
      delete timerRefs.current[kpiId];
    }, 1500);
  }, [saveKpi]);

  // Flush pending debounce immediately (used on blur / view switch).
  const flushAutosave = useCallback((kpiId: string) => {
    if (timerRefs.current[kpiId]) {
      clearTimeout(timerRefs.current[kpiId]);
      delete timerRefs.current[kpiId];
    }
    return saveKpi(kpiId);
  }, [saveKpi]);

  useEffect(() => {
    return () => {
      Object.values(timerRefs.current).forEach(clearTimeout);
    };
  }, []);

  return { savedKpis, savingKpis, scheduleAutosave, flushAutosave, saveKpi };
}

export function KpisTab({ workspaceId }: KpisTabProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const { data: workspace } = useWorkspace(workspaceId);
  const { data: workspaceKpis, isLoading: loadingKpis } = useWorkspaceKpiDefinitions(workspaceId);
  const { data: kpiValues, isLoading: loadingValues } = useKpiValues(workspaceId, 12);
  const { data: allKpis } = useAllKpiDefinitions();
  const { data: userRole } = useUserWorkspaceRole(workspaceId);
  const upsertKpi = useUpsertKpiValue(workspaceId);
  const markCheckin = useMarkCheckinComplete(workspaceId);
  const addKpi = useAddWorkspaceKpi(workspaceId);
  const removeKpi = useRemoveWorkspaceKpi(workspaceId);
  const applyDefaults = useApplyStageDefaults(workspaceId);
  const unlockKpi = useUnlockKpiValue(workspaceId);
  const { refetch: fetchExportData } = useExportKpis(workspaceId);
  const { showQuickWin } = useQuickWinToast();

  const handleExport = async () => {
    const { data } = await fetchExportData();
    if (data && data.length > 0) {
      exportToCsv(data, `kpis-${workspaceId}`);
      notify.success(t('kpis.exportedToCsv'));
    } else {
      notify.error(t('kpis.noDataToExport'));
    }
  };

  const [selectedMonth, setSelectedMonth] = useState(() => startOfMonth(new Date()));
  const [editedValues, setEditedValues] = useState<Record<string, { value: string; notes: string }>>({});
  const [showConfigDialog, setShowConfigDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [pendingTargets, setPendingTargets] = useState<Record<string, string>>({});
  const [viewMode, setViewMode] = useState<'cards' | 'checkin'>('cards');

  // B2 Fix: Auto-open config dialog when navigating with ?openAddKpis=1
  useEffect(() => {
    if (searchParams.get('openAddKpis') === '1') {
      setShowConfigDialog(true);
      searchParams.delete('openAddKpis');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const canEditKpis = isAdmin || userRole === 'founder';
  const canConfigureKpis = isAdmin || userRole === 'consultor' || userRole === 'mentor_externo' || userRole === 'founder';

  const selectedMonthStr = format(selectedMonth, 'yyyy-MM-dd');

  const monthValues = useMemo(() => {
    if (!kpiValues) return {};
    return kpiValues
      .filter(v => v.period_month === selectedMonthStr)
      .reduce((acc, v) => {
        acc[v.kpi_definition_id] = v;
        return acc;
      }, {} as Record<string, KpiValue>);
  }, [kpiValues, selectedMonthStr]);

  // ── Autosave integration ──
  const { savedKpis, savingKpis, scheduleAutosave, flushAutosave, saveKpi } = useAutosave(
    editedValues,
    monthValues,
    workspaceKpis,
    selectedMonthStr,
    upsertKpi,
    canEditKpis,
  );

  // ── Progress tracking ──
  const progressInfo = useMemo(() => {
    if (!workspaceKpis?.length) return { filled: 0, total: 0, percent: 0 };
    const total = workspaceKpis.length;
    const filled = workspaceKpis.filter(wk => {
      const kpiId = wk.kpi_definition_id;
      const edited = editedValues[kpiId];
      const existing = monthValues[kpiId];
      const val = edited?.value ?? existing?.value?.toString() ?? '';
      return val !== '';
    }).length;
    return { filled, total, percent: total > 0 ? Math.round((filled / total) * 100) : 0 };
  }, [workspaceKpis, editedValues, monthValues]);

  const chartDataByKpi = useMemo(() => {
    if (!kpiValues || !workspaceKpis) return {};
    
    const result: Record<string, { month: string; value: number | null; label: string }[]> = {};
    
    workspaceKpis.forEach(wk => {
      const kpiId = wk.kpi_definition_id;
      const values = kpiValues.filter(v => v.kpi_definition_id === kpiId);
      
      const months: { month: string; value: number | null; label: string }[] = [];
      for (let i = 11; i >= 0; i--) {
        const monthDate = startOfMonth(subMonths(new Date(), i));
        const monthStr = format(monthDate, 'yyyy-MM-dd');
        const val = values.find(v => v.period_month === monthStr);
        months.push({
          month: monthStr,
          value: val?.value ?? null,
          label: format(monthDate, 'MMM'),
        });
      }
      result[kpiId] = months;
    });
    
    return result;
  }, [kpiValues, workspaceKpis]);

  const handlePrevMonth = () => setSelectedMonth(m => subMonths(m, 1));
  const handleNextMonth = () => {
    const next = addMonths(selectedMonth, 1);
    if (next <= startOfMonth(new Date())) {
      setSelectedMonth(next);
    }
  };

  const handleValueChange = (kpiId: string, field: 'value' | 'notes', val: string) => {
    setEditedValues(prev => ({
      ...prev,
      [kpiId]: {
        ...prev[kpiId],
        value: prev[kpiId]?.value ?? (monthValues[kpiId]?.value?.toString() || ''),
        notes: prev[kpiId]?.notes ?? (monthValues[kpiId]?.notes || ''),
        [field]: val,
      },
    }));
    // Trigger autosave
    scheduleAutosave(kpiId);
  };

  const handleSaveKpi = async (wk: WorkspaceKpi) => {
    const kpiId = wk.kpi_definition_id;
    const edited = editedValues[kpiId];
    const existing = monthValues[kpiId];
    
    const valueStr = edited?.value ?? existing?.value?.toString() ?? '';
    const notes = edited?.notes ?? existing?.notes ?? '';
    const value = valueStr === '' ? null : parseFloat(valueStr);

    if (valueStr !== '' && isNaN(value as number)) {
      notify.error(t('kpis.invalidNumber'));
      return;
    }

    try {
      await upsertKpi.mutateAsync({
        kpi_definition_id: kpiId,
        period_month: selectedMonthStr,
        value,
        target_value: wk.target_value,
        notes: notes || null,
        existingId: existing?.id,
      });
      
      setEditedValues(prev => {
        const newState = { ...prev };
        delete newState[kpiId];
        return newState;
      });
      
      notify.success(t('kpis.kpiSaved'));
      triggerKpiCelebration();
    } catch {
      notify.error(t('kpis.failedToSave'));
    }
  };

  const handleMarkCheckin = async () => {
    // Save any pending edits first
    const pendingKpiIds = Object.keys(editedValues);
    for (const kpiId of pendingKpiIds) {
      await saveKpi(kpiId);
    }

    try {
      await markCheckin.mutateAsync();
      notify.success(t('kpis.checkinComplete'));
      showQuickWin('monthly_wins_submitted');
      setEditedValues({});
    } catch {
      notify.error(t('kpis.failedCheckin'));
    }
  };

  const stageLabel = workspace?.stage
    ? t(`stages.${workspace.stage}`, { defaultValue: workspace.stage })
    : '';

  const handleApplyDefaults = async () => {
    if (!workspace?.stage) return;
    try {
      const result = await applyDefaults.mutateAsync(workspace.stage);
      if (result.length > 0) {
        notify.success(t('kpis.addedDefaults', { count: result.length, stage: stageLabel }));
      } else {
        notify.info(t('kpis.allDefaultsConfigured'));
      }
    } catch {
      notify.error(t('kpis.failedDefaults'));
    }
  };

  const handleAddKpi = async (kpiDefId: string) => {
    try {
      const targetStr = pendingTargets[kpiDefId];
      const target_value = targetStr ? parseFloat(targetStr) : null;
      await addKpi.mutateAsync({ 
        kpi_definition_id: kpiDefId,
        target_value: target_value && !isNaN(target_value) ? target_value : null,
      });
      setPendingTargets(prev => {
        const next = { ...prev };
        delete next[kpiDefId];
        return next;
      });
      notify.success(t('kpis.kpiAdded'));
      showQuickWin('kpi_added');
    } catch {
      notify.error(t('kpis.failedToAdd'));
    }
  };

  const handleRemoveKpi = async (workspaceKpiId: string) => {
    try {
      await removeKpi.mutateAsync(workspaceKpiId);
      notify.success(t('kpis.kpiRemoved'));
    } catch {
      notify.error(t('kpis.failedToRemove'));
    }
  };

  const isLoading = loadingKpis || loadingValues;

  const assignedKpiIds = new Set(workspaceKpis?.map(wk => wk.kpi_definition_id) || []);
  const availableKpis = allKpis?.filter(k => !assignedKpiIds.has(k.id)) || [];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!workspaceKpis?.length) {
    // Stage-specific hint
    const stageKey = workspace?.stage ? `emptyStates.kpis.stage${workspace.stage.charAt(0).toUpperCase() + workspace.stage.slice(1)}` : '';
    const stageHint = stageKey ? t(stageKey, { defaultValue: '' }) : '';

    return (
      <EmptyState
        illustration="chart"
        title={t('emptyStates.kpis.title')}
        description={t('emptyStates.kpis.description')}
        value={stageHint || undefined}
        action={canConfigureKpis ? {
          label: t('kpis.applyDefaults', { stage: stageLabel }),
          onClick: handleApplyDefaults,
          icon: Sparkles,
        } : undefined}
        secondaryAction={canConfigureKpis ? {
          label: t('kpis.configureManually'),
          onClick: () => setShowConfigDialog(true),
        } : undefined}
      />
    );
  }

  const isCurrentMonth = format(selectedMonth, 'yyyy-MM') === format(new Date(), 'yyyy-MM');

  return (
    <div className="space-y-6">
      {/* ── Progress Banner (visible when editing current month) ── */}
      {isCurrentMonth && canEditKpis && (
        <Card className={cn(
          "border transition-colors duration-300",
          progressInfo.percent === 100 
            ? "border-[hsl(var(--success))]/30 bg-[hsl(var(--success))]/50" 
            : "border-primary/20 bg-primary/5"
        )}>
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex-1 min-w-0 w-full">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">
                      {t('kpis.quickCheckin', 'Check-in Mensal')}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-muted-foreground">
                    {progressInfo.filled}/{progressInfo.total}
                  </span>
                </div>
                <Progress value={progressInfo.percent} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1.5">
                  {progressInfo.percent === 100
                    ? t('kpis.allFilled', '✓ Todos os KPIs preenchidos! Pode concluir o check-in.')
                    : t('kpis.autosaveHint', 'Os valores são guardados automaticamente enquanto preenche.')}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {/* View mode toggle */}
                <div className="flex items-center border rounded-lg overflow-hidden">
                  <button
                    onClick={() => setViewMode('cards')}
                    className={cn(
                      "p-1.5 transition-colors",
                      viewMode === 'cards' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
                    )}
                    title={t('kpis.cardView', 'Vista em cartões')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('checkin')}
                    className={cn(
                      "p-1.5 transition-colors",
                      viewMode === 'checkin' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'
                    )}
                    title={t('kpis.checkinView', 'Vista rápida')}
                  >
                    <List className="h-4 w-4" />
                  </button>
                </div>
                <Button
                  size="sm"
                  onClick={handleMarkCheckin}
                  disabled={markCheckin.isPending || progressInfo.filled === 0} loading={markCheckin.isPending}
                  className={cn(
                    "transition-all",
                    progressInfo.percent === 100 && "bg-[hsl(var(--success))] hover:bg-[hsl(var(--success))]"
                  )}
                >
                  <CheckCircle className="h-4 w-4 mr-1.5" />
                  {t('kpis.completeCheckin', 'Concluir')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header with month selector */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handlePrevMonth} aria-label={t('common.previous')}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-[140px] text-center">
              <span className="font-medium">{format(selectedMonth, 'MMMM yyyy')}</span>
              {isCurrentMonth && (
                <Badge variant="secondary" className="ml-2 text-xs">{t('kpis.current')}</Badge>
              )}
            </div>
            <Button 
              variant="outline" 
              size="icon" 
              onClick={handleNextMonth}
              disabled={isCurrentMonth}
             aria-label={t('common.next')}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground border-l pl-3">
            <GlossaryTooltip term="mrr" className="text-xs" />
            <GlossaryTooltip term="cac" className="text-xs" />
            <GlossaryTooltip term="ltv" className="text-xs" />
            <GlossaryTooltip term="runway" className="text-xs" />
            <Link to="/help" className="ml-1 text-primary hover:underline text-xs">
              {t('kpis.viewGlossary', 'Ver glossário')}
            </Link>
          </div>
        </div>

        <div className="flex gap-2">
          {canEditKpis && (
            <Button variant="outline" size="sm" onClick={() => setShowImportDialog(true)}>
              <Upload className="h-4 w-4 mr-2" />
              {t('kpis.import', 'Import')}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            {t('kpis.export')}
          </Button>
          {canConfigureKpis && (
            <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Settings2 className="h-4 w-4 mr-2" />
                  {t('kpis.configure')}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md" aria-describedby={undefined}>
                <DialogHeader>
                  <DialogTitle>{t('kpis.configureKpis')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-sm mb-2">{t('kpis.currentKpis')}</h4>
                    <div className="space-y-2">
                      {workspaceKpis.map(wk => (
                        <div key={wk.id} className="flex items-center justify-between p-2 rounded border">
                          <span className="text-sm">{wk.definition?.name}</span>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleRemoveKpi(wk.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                  {availableKpis.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm mb-2">{t('kpis.addKpis')}</h4>
                      <div className="space-y-3 max-h-[200px] overflow-y-auto">
                        {availableKpis.map(kpi => (
                          <div key={kpi.id} className="p-3 rounded border space-y-2">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="text-sm">{kpi.name}</p>
                                <p className="text-xs text-muted-foreground">{kpi.category} • {kpi.unit}</p>
                              </div>
                              <Button size="sm" variant="ghost" onClick={() => handleAddKpi(kpi.id)}>
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs text-muted-foreground whitespace-nowrap">{t('kpis.target')}:</Label>
                              <Input
                                type="number"
                                placeholder={`${t('kpis.target')} ${kpi.unit || ''}`}
                                className="h-7 text-sm"
                                value={pendingTargets[kpi.id] || ''}
                                onChange={(e) => setPendingTargets(prev => ({ ...prev, [kpi.id]: e.target.value }))}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </DialogContent>
            </Dialog>
          )}
          {/* Legacy mark checkin button for non-current months */}
          {canEditKpis && !isCurrentMonth && (
            <Button 
              variant="outline"
              size="sm"
              onClick={handleMarkCheckin}
              disabled={markCheckin.isPending} loading={markCheckin.isPending}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Quick Check-in Mode (streamlined list) ── */}
      {viewMode === 'checkin' && canEditKpis ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              {t('kpis.quickCheckinMode', 'Modo Check-in Rápido')}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {t('kpis.quickCheckinDesc', 'Preencha os valores abaixo. Cada campo é guardado automaticamente.')}
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-border">
              {workspaceKpis.map((wk, idx) => {
                const def = wk.definition;
                if (!def) return null;

                const kpiId = wk.kpi_definition_id;
                const existing = monthValues[kpiId];
                const edited = editedValues[kpiId];
                const displayValue = edited?.value ?? existing?.value?.toString() ?? '';
                const isLocked = existing?.locked_by_source ?? false;
                const isSaving = savingKpis.has(kpiId);
                const isSaved = savedKpis.has(kpiId);
                const isFilled = displayValue !== '';

                // Last month value for context
                const lastMonthStr = format(subMonths(selectedMonth, 1), 'yyyy-MM-dd');
                const lastMonthVal = kpiValues?.find(
                  v => v.kpi_definition_id === kpiId && v.period_month === lastMonthStr
                );

                return (
                  <div
                    key={wk.id}
                    className={cn(
                      "py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 transition-colors",
                      isSaved && "bg-[hsl(var(--success))]/50"
                    )}
                  >
                    {/* KPI name + context */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0",
                          isFilled
                            ? "bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] "
                            : "bg-muted text-muted-foreground"
                        )}>
                          {isFilled ? <Check className="h-3 w-3" /> : idx + 1}
                        </span>
                        <span className="text-sm font-medium text-foreground truncate">
                          {def.name}
                        </span>
                        {def.unit && (
                          <Badge variant="outline" className="text-[10px] shrink-0">
                            {def.unit}
                          </Badge>
                        )}
                        {isLocked && <Lock className="h-3 w-3 text-[hsl(var(--warning))] shrink-0" />}
                      </div>
                      {/* Historical context */}
                      <div className="flex items-center gap-3 mt-0.5 ml-7">
                        {lastMonthVal?.value != null && (
                          <span className="text-[11px] text-muted-foreground">
                            {t('kpis.lastMonth', 'Mês anterior')}: <strong>{lastMonthVal.value.toLocaleString()}</strong>
                          </span>
                        )}
                        {wk.target_value != null && (
                          <span className="text-[11px] text-muted-foreground">
                            {t('kpis.target')}: <strong>{wk.target_value.toLocaleString()}</strong>
                          </span>
                        )}
                        {/* Inline sparkline */}
                        <div className="hidden sm:block">
                          <KpiSparkline data={(chartDataByKpi[kpiId] || []).map(d => ({ value: d.value ?? null, label: d.label }))} />
                        </div>
                      </div>
                    </div>

                    {/* Input + status */}
                    <div className="flex items-center gap-2 ml-7 sm:ml-0">
                      <Input
                        type="number"
                        inputMode="numeric"
                        value={displayValue}
                        onChange={(e) => handleValueChange(kpiId, 'value', e.target.value)}
                        onBlur={() => flushAutosave(kpiId)}
                        placeholder="—"
                        disabled={isLocked}
                        className="h-9 w-32 text-sm font-medium tabular-nums"
                        data-testid={`kpi-input-${idx}`}
                        autoFocus={idx === 0 && !displayValue}
                      />
                      {/* Save status indicator */}
                      <div className="w-6 flex items-center justify-center">
                        {isSaving && (
                          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                        )}
                        {isSaved && !isSaving && (
                          <Check className="h-4 w-4 text-[hsl(var(--success))] animate-in fade-in duration-200" />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        /* ── Card View (original detailed view with autosave) ── */
        <div className="grid gap-6 md:grid-cols-2">
          {workspaceKpis.map(wk => (
            <KpiCard
              key={wk.id}
              workspaceKpi={wk}
              currentValue={monthValues[wk.kpi_definition_id]}
              editedValue={editedValues[wk.kpi_definition_id]}
              chartData={chartDataByKpi[wk.kpi_definition_id] || []}
              canEdit={canEditKpis}
              isSaving={savingKpis.has(wk.kpi_definition_id)}
              isSaved={savedKpis.has(wk.kpi_definition_id)}
              onValueChange={(field, val) => handleValueChange(wk.kpi_definition_id, field, val)}
              onSave={() => handleSaveKpi(wk)}
              onUnlock={async (kpiValueId) => {
                await unlockKpi.mutateAsync(kpiValueId);
                notify.success(t('kpis.unlocked', 'KPI unlocked for manual editing'));
              }}
            />
          ))}
        </div>
      )}

      {/* Import Dialog */}
      <KpiImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        workspaceId={workspaceId}
      />
    </div>
  );
}

// KpiCard extracted to ./kpis/KpiCard.tsx

