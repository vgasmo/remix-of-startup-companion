// Guided Financial Plan tab.
// Sits alongside "Key Metrics / Insights / AI Review" inside FinancialModelPanel.
// Feature-flagged via `financial_business_plan_coach_v1`.

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { notify } from '@/lib/notify';
import {
  ArrowRight, CheckCircle2, ChevronRight, HelpCircle, Sparkles, ThumbsDown, ThumbsUp,
  FileSpreadsheet, Save, SkipForward, Trash2, Wand2, Download, Loader2,
} from 'lucide-react';
import {
  useFinancialPlanSession, useUpsertFinancialPlanSession,
  useFinancialAssumptions, useSaveAssumption, useDeleteAssumption,
  usePrefillProposals, useResolvePrefillProposal,
  useGeneratePrefill, useExportGuidedPlanXlsm,
  PlanScenario, AssumptionSource, PrefillResult,
} from '@/hooks/useFinancialPlan';
import { QUESTION_PACKS, packById, QuestionDef, DIAGNOSTIC_KEYS } from './questionPacks';
import { ScenarioSensitivityPanel } from './ScenarioSensitivityPanel';

interface Props {
  workspaceId: string;
  canWrite: boolean;
}

const SOURCE_LABEL: Record<AssumptionSource, string> = {
  founder: 'Founder',
  prefill_profile: 'Profile',
  prefill_kpi: 'KPI',
  prefill_ai: 'AI',
  imported_xlsm: 'Imported',
};

function SourceBadge({ source }: { source: AssumptionSource }) {
  const variant = source === 'founder' ? 'default' : source === 'imported_xlsm' ? 'secondary' : 'outline';
  return <Badge variant={variant} className="text-[10px] uppercase tracking-wide">{SOURCE_LABEL[source]}</Badge>;
}

function scenarioLabel(t: (k: string, opts?: any) => string, s: PlanScenario) {
  return t(`financialPlan.scenario.${s}`, { defaultValue: s.charAt(0).toUpperCase() + s.slice(1) });
}

export function GuidedPlanTab({ workspaceId, canWrite }: Props) {
  const { t } = useTranslation();
  const [scenario, setScenario] = useState<PlanScenario>('base');

  const sessionQ = useFinancialPlanSession(workspaceId, scenario);
  const assumptionsQ = useFinancialAssumptions(workspaceId, scenario);
  const proposalsQ = usePrefillProposals(workspaceId, scenario);
  const upsertSession = useUpsertFinancialPlanSession(workspaceId);
  const saveAssumption = useSaveAssumption(workspaceId);
  const deleteAssumption = useDeleteAssumption(workspaceId);
  const resolveProposal = useResolvePrefillProposal(workspaceId);
  const generatePrefill = useGeneratePrefill(workspaceId);
  const exportXlsm = useExportGuidedPlanXlsm(workspaceId);

  const session = sessionQ.data;
  const assumptions = assumptionsQ.data ?? [];
  const proposals = proposalsQ.data ?? [];

  const diagnostic = (session?.diagnostic_json ?? {}) as Record<string, string>;
  const completedPacks = session?.completed_packs ?? [];
  const diagnosticDone = DIAGNOSTIC_KEYS.every(k => diagnostic[k]);

  // First pack that isn't complete
  const activePackId = useMemo(() => {
    return QUESTION_PACKS.find(p => !completedPacks.includes(p.id))?.id ?? null;
  }, [completedPacks]);
  const activePack = activePackId ? packById(activePackId) : null;

  // Coverage %
  const totalQuestions = QUESTION_PACKS.reduce((a, p) => a + p.questions.length, 0);
  const answered = new Set(assumptions.map(a => a.key));
  const answeredCount = QUESTION_PACKS.reduce((a, p) => a + p.questions.filter(q => answered.has(q.key)).length, 0);
  const coverage = totalQuestions ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  const saveDiagnostic = async (key: string, value: string) => {
    await upsertSession.mutateAsync({
      scenario,
      current_step: 'diagnostic',
      diagnostic_json: { ...diagnostic, [key]: value },
      completed_packs: completedPacks,
      active_version_id: session?.active_version_id ?? null,
    });
  };

  const markPackComplete = async (packId: string) => {
    if (completedPacks.includes(packId)) return;
    await upsertSession.mutateAsync({
      scenario,
      current_step: `pack:${packId}:done`,
      diagnostic_json: diagnostic,
      completed_packs: [...completedPacks, packId],
      active_version_id: session?.active_version_id ?? null,
    });
  };

  if (sessionQ.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header: scenario selector + coverage */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {t('financialPlan.title', { defaultValue: 'Guided plan' })}
              </CardTitle>
              <CardDescription className="text-xs">
                {t('financialPlan.subtitle', {
                  defaultValue: 'Answer one decision at a time. Every value is yours to confirm — nothing is saved silently.',
                })}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Label className="text-xs text-muted-foreground">
                {t('financialPlan.scenarioLabel', { defaultValue: 'Scenario' })}
              </Label>
              <Select value={scenario} onValueChange={(v) => setScenario(v as PlanScenario)}>
                <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="base">{scenarioLabel(t, 'base')}</SelectItem>
                  <SelectItem value="conservative">{scenarioLabel(t, 'conservative')}</SelectItem>
                  <SelectItem value="optimistic">{scenarioLabel(t, 'optimistic')}</SelectItem>
                </SelectContent>
              </Select>
              {canWrite && (
                <Button
                  size="sm" variant="outline" className="h-8"
                  disabled={generatePrefill.isPending}
                  onClick={async () => {
                    try {
                      const res = await generatePrefill.mutateAsync(scenario);
                      if (res.proposals_created > 0) {
                        notify.success(t('financialPlan.prefillCreated', {
                          defaultValue: '{{count}} suggestion(s) ready to review',
                          count: res.proposals_created,
                        }));
                      } else {
                        notify.info(t('financialPlan.prefillEmpty', {
                          defaultValue: 'No new suggestions — everything already covered.',
                        }));
                      }
                      if (res.warnings?.length) {
                        // Non-fatal: surface as info toast for transparency.
                        notify.info(res.warnings.join(' · '));
                      }
                    } catch (e: any) {
                      notify.error(e?.message ?? t('financialPlan.prefillFailed', { defaultValue: 'Prefill failed' }));
                    }
                  }}
                >
                  {generatePrefill.isPending
                    ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                    : <Wand2 className="h-3.5 w-3.5 mr-1" />}
                  {t('financialPlan.prefill', { defaultValue: 'Prefill' })}
                </Button>
              )}
              <Button
                size="sm" variant="outline" className="h-8"
                disabled={exportXlsm.isPending || assumptions.length === 0}
                onClick={async () => {
                  try {
                    const res = await exportXlsm.mutateAsync(scenario);
                    window.open(res.download_url, '_blank', 'noopener');
                    notify.success(t('financialPlan.exportReady', {
                      defaultValue: 'XLSM export ready — {{n}} cells filled',
                      n: res.patch_count,
                    }));
                  } catch (e: any) {
                    notify.error(e?.message ?? t('financialPlan.exportFailed', { defaultValue: 'Export failed' }));
                  }
                }}
              >
                {exportXlsm.isPending
                  ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  : <Download className="h-3.5 w-3.5 mr-1" />}
                {t('financialPlan.exportXlsm', { defaultValue: 'Export XLSM' })}
              </Button>
            </div>

          </div>
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {t('financialPlan.coverage', { defaultValue: 'Coverage' })}: {answeredCount}/{totalQuestions}
            </span>
            <span>{coverage}%</span>
          </div>
          <Progress value={coverage} className="h-2" />
        </CardContent>
      </Card>

      {/* Pending prefill proposals */}
      {proposals.length > 0 && (
        <Card className="border-primary/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">
              {t('financialPlan.pendingProposals', { defaultValue: 'Suggestions waiting for you' })} · {proposals.length}
            </CardTitle>
            <CardDescription className="text-xs">
              {t('financialPlan.pendingProposalsDesc', {
                defaultValue: 'These values were prefilled from your profile, KPIs, or the AI. Confirm each before it becomes an assumption.',
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {proposals.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 p-2 border rounded-md">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">{p.key}</span>
                    <SourceBadge source={p.source} />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {p.proposed_value_numeric ?? JSON.stringify(p.proposed_value_json ?? {})}
                    {p.unit ? ` ${p.unit}` : ''}
                  </p>
                </div>
                {canWrite && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline"
                      onClick={() => resolveProposal.mutate({ proposal: p, action: 'accept' })}>
                      <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                      {t('financialPlan.accept', { defaultValue: 'Accept' })}
                    </Button>
                    <Button size="sm" variant="ghost"
                      onClick={() => resolveProposal.mutate({ proposal: p, action: 'reject' })}>
                      <ThumbsDown className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Diagnostic step */}
      {!diagnosticDone && (
        <DiagnosticSection
          diagnostic={diagnostic}
          canWrite={canWrite}
          onChange={saveDiagnostic}
          saving={upsertSession.isPending}
        />
      )}

      {/* Question packs */}
      {diagnosticDone && activePack && (
        <PackRunner
          pack={activePack}
          canWrite={canWrite}
          scenario={scenario}
          assumptions={assumptions}
          onSave={(input) => saveAssumption.mutateAsync(input)}
          onSkip={() => markPackComplete(activePack.id)}
          onComplete={() => {
            markPackComplete(activePack.id);
            notify.success(t('financialPlan.packComplete', { defaultValue: 'Section saved' }));
          }}
        />
      )}

      {/* All-done state */}
      {diagnosticDone && !activePack && (
        <Card>
          <CardContent className="py-6 flex flex-col items-center text-center gap-2">
            <CheckCircle2 className="h-8 w-8 text-primary" />
            <p className="text-sm font-medium">
              {t('financialPlan.allDone', { defaultValue: 'All sections captured' })}
            </p>
            <p className="text-xs text-muted-foreground max-w-md">
              {t('financialPlan.allDoneDesc', {
                defaultValue: 'You can revisit any assumption below, or export the workbook to feed the canonical XLSM.',
              })}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Scenario sensitivity — live projection from the assumptions register */}
      {diagnosticDone && assumptions.length > 0 && (
        <ScenarioSensitivityPanel
          workspaceId={workspaceId}
          canWrite={canWrite}
          assumptions={assumptions}
        />
      )}

      {/* Assumptions register */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {t('financialPlan.registerTitle', { defaultValue: 'Assumptions register' })}
          </CardTitle>
          <CardDescription className="text-xs">
            {t('financialPlan.registerDesc', {
              defaultValue: 'Every value that will feed the financial model. Sources are tracked and auditable.',
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {assumptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {t('financialPlan.registerEmpty', { defaultValue: 'No assumptions saved yet.' })}
            </p>
          ) : (
            <div className="divide-y">
              {assumptions.map(a => (
                <div key={a.id} className="py-2 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{a.key}</span>
                      <SourceBadge source={a.source} />
                    </div>
                    {a.rationale && <p className="text-xs text-muted-foreground truncate">{a.rationale}</p>}
                  </div>
                  <div className="text-sm tabular-nums whitespace-nowrap">
                    {a.value_numeric ?? '—'}{a.unit ? ` ${a.unit}` : ''}
                  </div>
                  {canWrite && (
                    <Button size="icon" variant="ghost" className="h-7 w-7"
                      onClick={() => deleteAssumption.mutate(a.id)}
                      aria-label={t('common.delete', { defaultValue: 'Delete' }) as string}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// -------- Diagnostic section ------------------------------------------------

function DiagnosticSection({
  diagnostic, canWrite, onChange, saving,
}: {
  diagnostic: Record<string, string>;
  canWrite: boolean;
  onChange: (key: string, value: string) => Promise<void> | void;
  saving: boolean;
}) {
  const { t } = useTranslation();
  const fields: Array<{ key: string; label: string; options: Array<{ v: string; l: string }> }> = [
    { key: 'activity', label: t('financialPlan.diag.activity', { defaultValue: 'Activity type' }),
      options: [
        { v: 'saas', l: 'SaaS' },
        { v: 'services', l: t('financialPlan.diag.services', { defaultValue: 'Services' }) },
        { v: 'product', l: t('financialPlan.diag.product', { defaultValue: 'Physical product' }) },
        { v: 'marketplace', l: 'Marketplace' },
        { v: 'other', l: t('common.other', { defaultValue: 'Other' }) },
      ] },
    { key: 'sector', label: t('financialPlan.diag.sector', { defaultValue: 'Sector' }),
      options: [
        { v: 'tech', l: 'Tech' }, { v: 'health', l: 'Health' }, { v: 'industry', l: 'Industry' },
        { v: 'consumer', l: 'Consumer' }, { v: 'other', l: t('common.other', { defaultValue: 'Other' }) },
      ] },
    { key: 'stage', label: t('financialPlan.diag.stage', { defaultValue: 'Stage' }),
      options: [
        { v: 'ideation', l: 'Ideation' }, { v: 'validation', l: 'Validation' },
        { v: 'mvp', l: 'MVP' }, { v: 'growth', l: 'Growth' }, { v: 'scale', l: 'Scale' },
      ] },
    { key: 'revenue_model', label: t('financialPlan.diag.revenueModel', { defaultValue: 'Revenue model' }),
      options: [
        { v: 'subscription', l: t('financialPlan.diag.subscription', { defaultValue: 'Subscription' }) },
        { v: 'transactional', l: t('financialPlan.diag.transactional', { defaultValue: 'Transactional' }) },
        { v: 'one_off', l: t('financialPlan.diag.oneOff', { defaultValue: 'One-off' }) },
        { v: 'mixed', l: t('financialPlan.diag.mixed', { defaultValue: 'Mixed' }) },
      ] },
    { key: 'traction', label: t('financialPlan.diag.traction', { defaultValue: 'Traction' }),
      options: [
        { v: 'pre_revenue', l: t('financialPlan.diag.preRevenue', { defaultValue: 'Pre-revenue' }) },
        { v: 'early_revenue', l: t('financialPlan.diag.earlyRevenue', { defaultValue: 'Early revenue' }) },
        { v: 'recurring', l: t('financialPlan.diag.recurring', { defaultValue: 'Recurring revenue' }) },
      ] },
    { key: 'horizon_months', label: t('financialPlan.diag.horizon', { defaultValue: 'Planning horizon' }),
      options: [{ v: '12', l: '12m' }, { v: '24', l: '24m' }, { v: '36', l: '36m' }, { v: '60', l: '60m' }] },
    { key: 'objective', label: t('financialPlan.diag.objective', { defaultValue: 'Primary objective' }),
      options: [
        { v: 'fundraising', l: t('financialPlan.diag.fundraising', { defaultValue: 'Fundraising' }) },
        { v: 'operational', l: t('financialPlan.diag.operational', { defaultValue: 'Operational planning' }) },
        { v: 'grant', l: t('financialPlan.diag.grant', { defaultValue: 'Grant application' }) },
        { v: 'internal', l: t('financialPlan.diag.internal', { defaultValue: 'Internal alignment' }) },
      ] },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">
          {t('financialPlan.diag.title', { defaultValue: '5-minute diagnostic' })}
        </CardTitle>
        <CardDescription className="text-xs">
          {t('financialPlan.diag.desc', {
            defaultValue: 'These answers decide which question packs run.',
          })}
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-0 grid gap-3 sm:grid-cols-2">
        {fields.map(f => (
          <div key={f.key} className="space-y-1">
            <Label className="text-xs">{f.label}</Label>
            <Select
              disabled={!canWrite || saving}
              value={diagnostic[f.key] ?? ''}
              onValueChange={(v) => onChange(f.key, v)}
            >
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                {f.options.map(o => (
                  <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// -------- Question pack runner ---------------------------------------------

function PackRunner({
  pack, canWrite, scenario, assumptions, onSave, onSkip, onComplete,
}: {
  pack: ReturnType<typeof packById> & object;
  canWrite: boolean;
  scenario: PlanScenario;
  assumptions: ReturnType<typeof useFinancialAssumptions>['data'];
  onSave: (input: any) => Promise<any>;
  onSkip: () => void;
  onComplete: () => void;
}) {
  const { t } = useTranslation();
  const rows = assumptions ?? [];
  const map = new Map(rows.map(a => [a.key, a] as const));

  // Find first unanswered question in the pack
  const currentIdx = pack.questions.findIndex(q => !map.has(q.key));
  const doneCount = pack.questions.length - (currentIdx === -1 ? 0 : pack.questions.length - currentIdx);
  const q: QuestionDef | undefined = currentIdx >= 0 ? pack.questions[currentIdx] : undefined;

  const [value, setValue] = useState<string>('');
  const [rationale, setRationale] = useState<string>('');
  const [saving, setSaving] = useState(false);

  if (!q) {
    return (
      <Card>
        <CardContent className="py-4 flex items-center justify-between">
          <p className="text-sm">
            <CheckCircle2 className="h-4 w-4 text-primary inline mr-1.5 align-[-2px]" />
            {t('financialPlan.packAllAnswered', { defaultValue: 'Section complete' })}: <b>{pack.defaultLabel}</b>
          </p>
          <Button size="sm" onClick={onComplete}>
            {t('financialPlan.continue', { defaultValue: 'Continue' })}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  const submit = async (skipValue: boolean) => {
    if (!canWrite) return;
    if (skipValue) { onSkip(); return; }
    if (!value.trim()) return;
    setSaving(true);
    try {
      let numeric: number | null = null;
      let json: Record<string, unknown> | null = null;
      if (q.kind === 'text') {
        json = { text: value };
      } else {
        // Locale-safe: accept "1.234,56" and "1,234.56"
        const cleaned = value.replace(/[€\s]/g, '');
        const lastComma = cleaned.lastIndexOf(',');
        const lastDot = cleaned.lastIndexOf('.');
        let normalized = cleaned;
        if (lastComma > lastDot) normalized = cleaned.replace(/\./g, '').replace(',', '.');
        else if (lastDot > lastComma) normalized = cleaned.replace(/,/g, '');
        const n = Number(normalized);
        if (!Number.isFinite(n)) { notify.error(t('financialPlan.invalidNumber', { defaultValue: 'Enter a valid number' })); setSaving(false); return; }
        numeric = n;
      }
      await onSave({
        key: q.key,
        scenario,
        value_numeric: numeric,
        value_json: json,
        unit: q.unit ?? null,
        source: 'founder' as AssumptionSource,
        rationale: rationale.trim() || null,
      });
      setValue(''); setRationale('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-sm">{pack.defaultLabel}</CardTitle>
            <CardDescription className="text-xs">{pack.defaultDescription}</CardDescription>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {Math.max(0, doneCount)}/{pack.questions.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div>
          <Label className="text-sm font-medium">{q.defaultLabel}</Label>
          {q.excelHint && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <FileSpreadsheet className="h-3 w-3" />
              {q.excelHint}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder={q.unit ? q.unit : q.kind === 'text' ? '' : '0'}
            disabled={!canWrite || saving}
            inputMode={q.kind === 'text' ? undefined : 'decimal'}
          />
        </div>
        <Textarea
          value={rationale}
          onChange={e => setRationale(e.target.value)}
          placeholder={t('financialPlan.rationalePlaceholder', {
            defaultValue: 'Why this value? Cite source, benchmark, or reasoning (optional).',
          }) as string}
          disabled={!canWrite || saving}
          rows={2}
          className="text-xs"
        />
        <div className="flex flex-wrap gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => submit(true)} disabled={!canWrite || saving}>
            <SkipForward className="h-4 w-4 mr-1" />
            {t('financialPlan.skipSection', { defaultValue: 'Skip section' })}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setValue('')} disabled={!canWrite || saving}>
            {t('financialPlan.idk', { defaultValue: "I don't know yet" })}
          </Button>
          <Button size="sm" onClick={() => submit(false)} disabled={!canWrite || saving || !value.trim()}>
            <Save className="h-4 w-4 mr-1" />
            {t('financialPlan.saveNext', { defaultValue: 'Save & next' })}
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
