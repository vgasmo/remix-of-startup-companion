// AdminDataImportV2
// Feature-flagged rebuild of the HubSpot importer:
// Upload → Column Mapping → Reconciliation → Approval/Commit → Results
// All parsing, matching and writes happen server-side via
// `prepare-hubspot-import` and `commit-hubspot-import` edge functions.
// No mutation of funnel_items/startups/workspaces/contracts from this page.

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, Loader2, ShieldAlert, Download, PlayCircle, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft } from 'lucide-react';
import { usePrograms } from '@/hooks/useWorkspaces';
import { supabase } from '@/lib/supabaseClient';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { notify } from '@/lib/notify';
import { cn } from '@/lib/utils';

type Step = 'upload' | 'mapping' | 'reconcile' | 'commit' | 'results';
type ImportSource = 'hubspot' | 'phc';

interface PrepareResponse {
  success: boolean;
  job_id: string;
  counts: { insert: number; update: number; conflict: number; invalid: number; suggested?: number };
  total_rows: number;
  detected_headers: string[];
  column_mapping?: Record<string, string | null>;
  header_map?: Record<string, string>;
  available_sheets: string[];
}

interface ImportRow {
  id: string;
  row_number: number;
  raw_json: Record<string, string>;
  normalized_json: Record<string, any>;
  proposed_action: 'insert' | 'update' | 'suggested' | 'conflict' | 'invalid' | 'skip';
  match_method: string | null;
  match_confidence: number | null;
  approval_state: string;
  approve_toggles_json: Record<string, boolean>;
  commit_result_json: any;
  validation_errors_json: string[];
}

const INTERNAL_FIELDS = [
  'organization_name', 'contact_name', 'contact_email', 'phone', 'nif',
  'deal_id', 'contact_id', 'company_id', 'deal_stage', 'owner_name',
  'owner_email', 'owner_id', 'sector', 'building', 'service', 'activity_description',
] as const;

async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.byteLength; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as any);
  }
  return btoa(binary);
}

export default function AdminDataImportV2() {
  const { t } = useTranslation();
  const { data: programs } = usePrograms();

  const [step, setStep] = useState<Step>('upload');
  const [source, setSource] = useState<ImportSource>('hubspot');
  const [file, setFile] = useState<File | null>(null);
  const [programId, setProgramId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [prepared, setPrepared] = useState<PrepareResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [stageMap, setStageMap] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [filter, setFilter] = useState<'all' | 'insert' | 'update' | 'suggested' | 'conflict' | 'invalid'>('all');
  const [commitSummary, setCommitSummary] = useState<any | null>(null);
  const [globalToggles, setGlobalToggles] = useState({ crm: true, startup: false, workspace: false, contract_proposal: false });

  const onFile = useCallback((f: File | null) => {
    setFile(f);
    setPrepared(null); setRows([]); setCommitSummary(null);
  }, []);

  const loadRows = useCallback(async (jobId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('data_import_rows')
        .select('*')
        .eq('job_id', jobId)
        .order('row_number', { ascending: true });
      if (error) throw error;
      setRows((data ?? []) as any);
    } catch (e: any) {
      notify.error(e?.message ?? 'Load rows failed');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const onPrepare = useCallback(async () => {
    if (!file) return;
    setIsLoading(true);
    try {
      const content_base64 = await fileToBase64(file);
      const fn = source === 'phc' ? 'prepare-phc-import' : 'prepare-hubspot-import';
      const body: any = {
        filename: file.name,
        content_base64,
        mime_type: file.type,
        program_id: programId,
      };
      if (source === 'hubspot') {
        body.stage_map = stageMap;
        body.config = { default_stage: 'new' };
      } else {
        body.config = { default_stage: 'customer' };
      }
      const { data, error } = await invokeWithAuth<PrepareResponse>(fn, { body });
      if (error) throw error;
      setPrepared(data!);
      setMapping(data!.column_mapping ?? {});
      setStep(source === 'phc' ? 'reconcile' : 'mapping');
      if (source === 'phc') await loadRows(data!.job_id);
      notify.success(t('dataImportV2.prepared', 'File analyzed: {{n}} rows', { n: data!.total_rows }));
    } catch (e: any) {
      notify.error(e?.message ?? 'Prepare failed');
    } finally {
      setIsLoading(false);
    }
  }, [file, source, programId, stageMap, t, loadRows]);

  const goReconcile = useCallback(async () => {
    if (!prepared) return;
    await loadRows(prepared.job_id);
    setStep('reconcile');
  }, [prepared, loadRows]);

  // Auto-approve only rows whose match confidence clears the safety threshold.
  // Anything below stays 'pending' so a human explicitly reviews the fuzzy /
  // name-only matches (which are the ones that historically corrupted data).
  const MIN_AUTO_APPROVE_CONFIDENCE = 0.9;

  const approveAllValid = useCallback(async () => {
    if (!prepared) return;
    setIsLoading(true);
    try {
      const eligible = rows.filter(r => r.proposed_action === 'insert' || r.proposed_action === 'update');
      const confident = eligible.filter(r =>
        // Inserts have no match to score — trust them (no clobber risk).
        // Updates must clear the confidence gate.
        r.proposed_action === 'insert'
        || (typeof r.match_confidence === 'number' && r.match_confidence >= MIN_AUTO_APPROVE_CONFIDENCE),
      );
      const held = eligible.length - confident.length;
      const ids = confident.map(r => r.id);
      if (ids.length === 0) {
        notify.info(t('dataImportV2.noneConfident', {
          defaultValue: 'No rows clear the {{pct}}% confidence bar — review each match manually.',
          pct: Math.round(MIN_AUTO_APPROVE_CONFIDENCE * 100),
        }));
        return;
      }
      const { error } = await supabase
        .from('data_import_rows')
        .update({ approval_state: 'approved', approve_toggles_json: globalToggles })
        .in('id', ids);
      if (error) throw error;
      await loadRows(prepared.job_id);
      if (held > 0) {
        notify.success(t('dataImportV2.approvedHeld', {
          defaultValue: 'Approved {{n}} rows · {{held}} held for manual review (< {{pct}}% match)',
          n: ids.length, held, pct: Math.round(MIN_AUTO_APPROVE_CONFIDENCE * 100),
        }));
      } else {
        notify.success(t('dataImportV2.approved', { defaultValue: 'Approved {{n}} rows', n: ids.length }));
      }
    } catch (e: any) {
      notify.error(e?.message ?? 'Approve failed');
    } finally {
      setIsLoading(false);
    }
  }, [prepared, rows, globalToggles, loadRows, t]);

  const onCommit = useCallback(async () => {
    if (!prepared) return;
    setIsLoading(true);
    try {
      const { data, error } = await invokeWithAuth<{ success: boolean; summary: any }>(
        'commit-crm-import',
        { body: { job_id: prepared.job_id } },
      );
      if (error) throw error;
      setCommitSummary(data!.summary);
      await loadRows(prepared.job_id);
      setStep('results');
      notify.success(t('dataImportV2.commitDone', 'Import committed'));
    } catch (e: any) {
      notify.error(e?.message ?? 'Commit failed');
    } finally {
      setIsLoading(false);
    }
  }, [prepared, loadRows, t]);

  const downloadExceptions = useCallback(() => {
    if (!rows.length) return;
    const headers = ['row_number', 'proposed_action', 'match_method', 'confidence', 'approval_state', 'errors', 'organization_name', 'contact_email', 'deal_id', 'company_id'];
    const lines = [headers.join(',')];
    for (const r of rows) {
      const n = r.normalized_json ?? {};
      const cells = [
        r.row_number,
        r.proposed_action,
        r.match_method ?? '',
        r.match_confidence ?? '',
        r.approval_state,
        JSON.stringify(r.validation_errors_json ?? []).replace(/,/g, ';'),
        (n.organization_name ?? '').replace(/,/g, ' '),
        (n.contact_email ?? '').replace(/,/g, ' '),
        (n.deal_id ?? ''),
        (n.company_id ?? ''),
      ];
      lines.push(cells.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `hubspot-import-${prepared?.job_id ?? 'job'}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }, [rows, prepared]);

  const visibleRows = useMemo(() => filter === 'all' ? rows : rows.filter(r => r.proposed_action === filter), [rows, filter]);

  const counts = prepared?.counts;

  return (
    <AppLayout
      title={t('dataImportV2.title', 'HubSpot Importer v2')}
      subtitle={t('dataImportV2.subtitle', 'Staged, server-side, idempotent import with full audit trail')}
    >
      <div className="space-y-4 max-w-6xl">
        <Alert>
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>{t('dataImportV2.contractBannerTitle', 'No contracts are activated or signed by this import.')}</AlertTitle>
          <AlertDescription>
            {t('dataImportV2.contractBannerDesc', 'Startups, workspaces and contract proposals are opt-in per row. Committed data can be reverted from the audit.')}
          </AlertDescription>
        </Alert>

        {/* Stepper */}
        <div className="flex items-center gap-2 text-xs">
          {(['upload', 'mapping', 'reconcile', 'commit', 'results'] as Step[]).map((s, i) => (
            <div key={s} className={cn('px-2 py-1 rounded-md border', step === s ? 'bg-primary text-primary-foreground border-primary' : 'text-muted-foreground')}>
              {i + 1}. {t(`dataImportV2.step.${s}`, s)}
            </div>
          ))}
        </div>

        {/* Upload */}
        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('dataImportV2.upload.title', 'Upload CRM export')}</CardTitle>
              <CardDescription>{t('dataImportV2.upload.desc', 'CSV or XLSX/XLSM only. Legacy .xls is not supported.')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 max-w-sm">
                <Label className="text-xs">{t('dataImportV2.source', 'Source system')}</Label>
                <Select value={source} onValueChange={v => setSource(v as ImportSource)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hubspot">HubSpot</SelectItem>
                    <SelectItem value="phc">PHC — Clientes por Tipologia</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Input type="file" accept=".csv,.xlsx,.xlsm" onChange={e => onFile(e.target.files?.[0] ?? null)} />
              <div className="grid gap-2 max-w-sm">
                <Label className="text-xs">{t('common.program', 'Program')}</Label>
                <Select value={programId ?? '__none__'} onValueChange={v => setProgramId(v === '__none__' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder={t('dataImportV2.selectProgram', 'Select program (optional)')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {(programs ?? []).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {source === 'phc' && (
                <Alert>
                  <ShieldAlert className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    {t('dataImportV2.phc.notice', 'PHC import is strict CRM-only. Building, service and price-list fields are stored as hints — never as fees or buildings. Column mapping is derived automatically from the PHC headers.')}
                  </AlertDescription>
                </Alert>
              )}
              <Button disabled={!file || isLoading} onClick={onPrepare}>
                {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                {t('dataImportV2.analyze', 'Analyze file')}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Mapping */}
        {step === 'mapping' && prepared && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('dataImportV2.mapping.title', 'Column mapping')}</CardTitle>
              <CardDescription>
                {t('dataImportV2.mapping.desc', 'Confirm which upload column feeds each internal field. Leave empty to ignore.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {INTERNAL_FIELDS.map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <Label className="text-xs w-40 shrink-0">{f}</Label>
                    <Select
                      value={mapping[f] ?? '__none__'}
                      onValueChange={v => setMapping(m => ({ ...m, [f]: v === '__none__' ? null : v }))}
                    >
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {prepared.detected_headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <Separator className="my-2" />
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('upload')}>
                  <ArrowLeft className="h-4 w-4 mr-2" />{t('common.back', 'Back')}
                </Button>
                <Button onClick={goReconcile} disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                  {t('dataImportV2.toReconcile', 'Continue to reconciliation')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Reconciliation */}
        {step === 'reconcile' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                {t('dataImportV2.reconcile.title', 'Reconciliation preview')}
                {counts && (
                  <div className="flex gap-1 text-xs">
                    <Badge variant="outline">insert: {counts.insert}</Badge>
                    <Badge variant="outline">update: {counts.update}</Badge>
                    <Badge variant="destructive">conflict: {counts.conflict}</Badge>
                    <Badge variant="secondary">invalid: {counts.invalid}</Badge>
                  </div>
                )}
              </CardTitle>
              <CardDescription>{t('dataImportV2.reconcile.desc', 'Every match method and confidence is shown. Nothing is written until you approve and commit.')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                {(['all', 'insert', 'update', 'conflict', 'invalid'] as const).map(f => (
                  <Button key={f} variant={filter === f ? 'default' : 'outline'} size="sm" onClick={() => setFilter(f)}>{f}</Button>
                ))}
                <div className="ml-auto flex gap-2 flex-wrap">
                  <label className="flex items-center gap-1 text-xs"><Switch checked={globalToggles.crm} onCheckedChange={v => setGlobalToggles(t => ({ ...t, crm: v }))} />CRM</label>
                  <label className="flex items-center gap-1 text-xs"><Switch checked={globalToggles.startup} onCheckedChange={v => setGlobalToggles(t => ({ ...t, startup: v }))} />Startup</label>
                  <label className="flex items-center gap-1 text-xs"><Switch checked={globalToggles.workspace} onCheckedChange={v => setGlobalToggles(t => ({ ...t, workspace: v }))} />Workspace</label>
                  <label className="flex items-center gap-1 text-xs"><Switch checked={globalToggles.contract_proposal} onCheckedChange={v => setGlobalToggles(t => ({ ...t, contract_proposal: v }))} />Contract proposal</label>
                </div>
              </div>
              <ScrollArea className="h-[420px] border rounded-md">
                <div className="divide-y">
                  {visibleRows.map(r => {
                    const n = r.normalized_json ?? {};
                    return (
                      <div key={r.id} className="p-2 text-xs flex items-center gap-3">
                        <div className="w-10 tabular-nums text-muted-foreground">#{r.row_number}</div>
                        <Badge variant={
                          r.proposed_action === 'insert' ? 'default' :
                          r.proposed_action === 'update' ? 'secondary' :
                          r.proposed_action === 'conflict' ? 'destructive' : 'outline'
                        }>{r.proposed_action}</Badge>
                        <div className="flex-1 min-w-0">
                          <div className="truncate font-medium">{n.organization_name ?? '—'}</div>
                          <div className="truncate text-muted-foreground">
                            {n.contact_email ?? '—'} · deal:{n.deal_id ?? '—'} · company:{n.company_id ?? '—'}
                          </div>
                        </div>
                        <div className="w-40 text-right text-muted-foreground">
                          {r.match_method ?? 'none'} {r.match_confidence != null ? `(${Math.round(Number(r.match_confidence) * 100)}%)` : ''}
                        </div>
                        <Badge variant="outline" className="w-20 justify-center">{r.approval_state}</Badge>
                      </div>
                    );
                  })}
                  {visibleRows.length === 0 && <div className="p-4 text-xs text-muted-foreground">{t('dataImportV2.noRows', 'No rows in this filter.')}</div>}
                </div>
              </ScrollArea>
              <div className="flex justify-between gap-2 flex-wrap">
                <Button variant="outline" onClick={() => setStep('mapping')}><ArrowLeft className="h-4 w-4 mr-2" />{t('common.back', 'Back')}</Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={downloadExceptions}><Download className="h-4 w-4 mr-2" />{t('dataImportV2.download', 'Download report')}</Button>
                  <Button variant="outline" onClick={approveAllValid} disabled={isLoading}>{t('dataImportV2.approveAll', 'Approve valid rows')}</Button>
                  <Button onClick={() => setStep('commit')} disabled={isLoading || rows.every(r => r.approval_state !== 'approved')}>
                    <ArrowRight className="h-4 w-4 mr-2" />{t('dataImportV2.toCommit', 'Continue to commit')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'commit' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('dataImportV2.commit.title', 'Commit approved rows')}</CardTitle>
              <CardDescription>{t('dataImportV2.commit.desc', 'Only admins can commit. Rows are processed atomically; failures are recorded per row and safe to resume.')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Alert variant="default">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  {t('dataImportV2.commit.warning', 'Contracts, occupied offices and consultant assignments require a separate staff review — never inferred from HubSpot.')}
                </AlertDescription>
              </Alert>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep('reconcile')}><ArrowLeft className="h-4 w-4 mr-2" />{t('common.back', 'Back')}</Button>
                <Button onClick={onCommit} disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-2" />}
                  {t('dataImportV2.commitNow', 'Commit now')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 'results' && commitSummary && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                {t('dataImportV2.results.title', 'Import committed')}
              </CardTitle>
              <CardDescription>
                {t('dataImportV2.results.desc', 'Summary and downloadable exception report.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex gap-2 flex-wrap">
                <Badge>committed: {commitSummary.committed}</Badge>
                <Badge variant="outline">inserted: {commitSummary.inserted}</Badge>
                <Badge variant="outline">updated: {commitSummary.updated}</Badge>
                <Badge variant="secondary">skipped: {commitSummary.skipped}</Badge>
                <Badge variant="secondary">stale: {commitSummary.stale}</Badge>
                <Badge variant="destructive">failed: {commitSummary.failed}</Badge>
              </div>
              <Button variant="outline" onClick={downloadExceptions}><Download className="h-4 w-4 mr-2" />{t('dataImportV2.download', 'Download report')}</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
