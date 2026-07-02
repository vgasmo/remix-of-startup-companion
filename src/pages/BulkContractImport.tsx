import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Upload, FileText, Sparkles, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft,
  Download, Trash2, Eye, Loader2, FilePlus2, RefreshCcw,
} from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { useAuth } from '@/contexts/AuthContext';
import { usePrograms } from '@/hooks/useAdminData';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { notify } from "@/lib/notify";
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

type WizardStep = 'upload' | 'review' | 'done';

interface BatchRow {
  id: string;
  pdf_filename: string;
  pdf_path: string;
  status: string;
  extracted_json: Record<string, any> | null;
  edited_json: Record<string, any> | null;
  matched_startup_id: string | null;
  matched_workspace_id: string | null;
  match_method: string | null;
  ai_confidence: number | null;
  error_message: string | null;
  selected: boolean;
  created_contract_id: string | null;
}

const EDITABLE_FIELDS: Array<{ key: string; label: string; type?: 'date' | 'number' | 'text' }> = [
  { key: 'startup_name', label: 'Startup name' },
  { key: 'nif', label: 'NIF' },
  { key: 'contract_number', label: 'Contract #' },
  { key: 'typology_name', label: 'Typology' },
  { key: 'status', label: 'Status' },
  { key: 'signed_at', label: 'Signed at', type: 'date' },
  { key: 'start_date', label: 'Start', type: 'date' },
  { key: 'end_date', label: 'End', type: 'date' },
  { key: 'monthly_fee', label: 'Monthly €', type: 'number' },
  { key: 'discount_percentage', label: 'Discount %', type: 'number' },
  { key: 'square_meters', label: 'm²', type: 'number' },
  { key: 'space_code', label: 'Space code' },
  { key: 'address', label: 'Address' },
  { key: 'postal_code', label: 'Postal code' },
  { key: 'city', label: 'City' },
  { key: 'main_contact_name', label: 'Contact name' },
  { key: 'main_contact_email', label: 'Contact email' },
  { key: 'main_contact_phone', label: 'Contact phone' },
  { key: 'legal_representative_name', label: 'Legal rep' },
  { key: 'legal_representative_email', label: 'Legal rep email' },
];

export default function BulkContractImport() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { confirm, dialogProps } = useConfirmDialog();
  const [step, setStep] = useState<WizardStep>('upload');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [programId, setProgramId] = useState<string>('');
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 });
  const [extractProgress, setExtractProgress] = useState({ done: 0, total: 0 });
  const [extracting, setExtracting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [editingRow, setEditingRow] = useState<BatchRow | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const cancelRef = useRef(false);

  const { data: programs = [], isLoading: programsLoading } = usePrograms();
  const activePrograms = (programs as Array<{ id: string; name: string; is_active?: boolean | null; status?: string | null }>)
    .filter(p => p.is_active !== false && p.status !== 'archived');
  const selectedProgramName = activePrograms.find(p => p.id === programId)?.name || '';

  // Refresh rows from DB
  const refreshRows = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from('bulk_import_rows')
      .select('*')
      .eq('batch_id', id)
      .order('created_at', { ascending: true });
    if (error) {
      notify.error(t('bulkImport.errors.loadFailed', 'Failed to load rows'));
      return;
    }
    setRows((data as BatchRow[]) || []);
  }, [t]);

  useEffect(() => {
    if (!batchId || step !== 'review') return;
    refreshRows(batchId);
  }, [batchId, step, refreshRows]);

  // ============ STEP 1: UPLOAD ============
  const onDrop = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    const dropped = Array.from(event.dataTransfer.files).filter(f =>
      f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    setFiles(prev => [...prev, ...dropped].slice(0, 50));
  }, []);

  const onPick = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files || []).filter(f =>
      f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
    setFiles(prev => [...prev, ...picked].slice(0, 50));
    event.target.value = '';
  }, []);

  const removeFile = (idx: number) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const startBatch = async () => {
    if (!user || files.length === 0) return;
    if (!programId) {
      notify.error(t('bulkImport.errors.programRequired'));
      return;
    }
    setUploading(true);
    setUploadProgress({ done: 0, total: files.length });
    cancelRef.current = false;

    try {
      // 1) Create batch row — programme is required so new workspaces are never orphaned.
      const { data: batch, error: batchErr } = await supabase
        .from('bulk_import_batches')
        .insert({
          created_by: user.id,
          status: 'uploading',
          total_files: files.length,
          program_id: programId,
        })
        .select('id')
        .single();
      if (batchErr || !batch) throw new Error(batchErr?.message || 'Batch creation failed');

      const newBatchId = batch.id;
      setBatchId(newBatchId);

      // 2) Upload PDFs to storage and create rows
      const rowInserts: Array<{ batch_id: string; pdf_path: string; pdf_filename: string }> = [];
      for (let i = 0; i < files.length; i++) {
        if (cancelRef.current) break;
        const file = files[i];
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${newBatchId}/${Date.now()}_${i}_${safeName}`;
        const { error: upErr } = await supabase.storage
          .from('contract-imports')
          .upload(path, file, { contentType: 'application/pdf', upsert: false });
        if (upErr) {
          logger.warn('Upload failed', { file: file.name, err: upErr.message });
          notify.error(`${file.name}: ${upErr.message}`);
          continue;
        }
        rowInserts.push({ batch_id: newBatchId, pdf_path: path, pdf_filename: file.name });
        setUploadProgress({ done: i + 1, total: files.length });
      }

      if (rowInserts.length === 0) {
        notify.error(t('bulkImport.errors.noUploads', 'No files uploaded successfully'));
        setUploading(false);
        return;
      }

      const { error: insertErr } = await supabase
        .from('bulk_import_rows')
        .insert(rowInserts);
      if (insertErr) throw new Error(insertErr.message);

      await supabase
        .from('bulk_import_batches')
        .update({ status: 'extracting' })
        .eq('id', newBatchId);

      setUploading(false);
      setStep('review');
      // 3) Trigger extraction
      await runExtraction(newBatchId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      notify.error(`${t('bulkImport.errors.uploadFailed', 'Upload failed')}: ${msg}`);
      setUploading(false);
    }
  };

  // ============ STEP 2: EXTRACT (background) ============
  const runExtraction = async (id: string) => {
    setExtracting(true);
    const { data: pendingRows, error } = await supabase
      .from('bulk_import_rows')
      .select('id')
      .eq('batch_id', id)
      .in('status', ['pending', 'extracting']);
    if (error || !pendingRows) {
      setExtracting(false);
      return;
    }
    setExtractProgress({ done: 0, total: pendingRows.length });

    // Sequential to avoid AI rate limits — Gemini Pro is slow but accurate
    for (let i = 0; i < pendingRows.length; i++) {
      if (cancelRef.current) break;
      const rowId = pendingRows[i].id;
      try {
        await invokeWithAuth('bulk-import-extract', { body: { row_id: rowId } });
      } catch (e) {
        logger.warn('Extract failed', { rowId, err: e });
      }
      setExtractProgress({ done: i + 1, total: pendingRows.length });
      await refreshRows(id);
    }
    setExtracting(false);
    notify.success(t('bulkImport.extractComplete', 'Extraction complete'));
  };

  // ============ ROW EDITING ============
  const updateRow = async (rowId: string, patch: Partial<BatchRow>) => {
    setRows(prev => prev.map(r => (r.id === rowId ? { ...r, ...patch } : r)));
    await supabase.from('bulk_import_rows').update(patch).eq('id', rowId);
  };

  const updateEditedField = async (row: BatchRow, key: string, value: string) => {
    const merged = { ...(row.edited_json || row.extracted_json || {}), [key]: value };
    await updateRow(row.id, { edited_json: merged });
  };

  const openPdfPreview = async (row: BatchRow) => {
    const { data, error } = await supabase.storage
      .from('contract-imports')
      .createSignedUrl(row.pdf_path, 60 * 5);
    if (error || !data) {
      notify.error(t('bulkImport.errors.previewFailed', 'Cannot open PDF'));
      return;
    }
    setPreviewUrl(data.signedUrl);
  };

  // ============ STEP 3: COMMIT ============
  const commitBatch = () => {
    if (!batchId) return;
    const selectedReady = rows.filter(r =>
      r.selected && (r.status === 'will_create' || r.status === 'will_update')
    );
    if (selectedReady.length === 0) {
      notify.error(t('bulkImport.errors.nothingToCommit', 'No rows ready to commit'));
      return;
    }
    confirm({
      title: t('bulkImport.confirmCommitTitle'),
      description: t('bulkImport.confirmCommit', { count: selectedReady.length }),
      variant: 'warning',
      confirmLabel: t('common.confirm'),
      onConfirm: async () => {
        setCommitting(true);
        try {
          const { data, error } = await invokeWithAuth<{ committed: number; failed: number; errors: Array<{ row_id: string; error: string }> }>(
            'bulk-import-commit',
            { body: { batch_id: batchId } }
          );
          if (error) throw error;
          notify.success(
            t('bulkImport.commitSuccess', `Imported ${data?.committed ?? 0} contracts (${data?.failed ?? 0} failed)`)
          );
          await refreshRows(batchId);
          setStep('done');
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Unknown error';
          notify.error(`${t('bulkImport.errors.commitFailed', 'Commit failed')}: ${msg}`);
        } finally {
          setCommitting(false);
        }
      },
    });
  };

  // ============ ERROR EXPORT ============
  const downloadErrorsCsv = () => {
    const failed = rows.filter(r => r.status === 'error');
    if (failed.length === 0) {
      notify.info(t('bulkImport.noErrors', 'No errors to export'));
      return;
    }
    const header = 'filename,error,extracted_startup_name,extracted_nif\n';
    const body = failed.map(r => {
      const data = r.edited_json || r.extracted_json || {};
      return [
        JSON.stringify(r.pdf_filename),
        JSON.stringify(r.error_message || ''),
        JSON.stringify(data.startup_name || ''),
        JSON.stringify(data.nif || ''),
      ].join(',');
    }).join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bulk-import-errors-${batchId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ============ ACCESS CHECK ============
  if (!isAdmin) {
    return (
      <AppLayout title={t('bulkImport.title', 'Bulk Contract Import')}>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{t('bulkImport.adminOnly.title', 'Admin only')}</AlertTitle>
          <AlertDescription>{t('bulkImport.adminOnly.desc', 'Only administrators can use this tool.')}</AlertDescription>
        </Alert>
      </AppLayout>
    );
  }

  // ============ STATUS COUNTS ============
  const counts = {
    total: rows.length,
    extracted: rows.filter(r => ['will_create', 'will_update'].includes(r.status)).length,
    willCreate: rows.filter(r => r.status === 'will_create').length,
    willUpdate: rows.filter(r => r.status === 'will_update').length,
    committed: rows.filter(r => r.status === 'committed').length,
    errors: rows.filter(r => r.status === 'error').length,
    pending: rows.filter(r => ['pending', 'extracting'].includes(r.status)).length,
  };

  return (
    <AppLayout title={t('bulkImport.title', 'Bulk Contract Import')}>
      <div className="space-y-6">
        {/* Stepper */}
        <div className="flex items-center gap-2 text-sm">
          <StepDot active={step === 'upload'} done={step !== 'upload'} label={t('bulkImport.steps.upload', '1. Upload PDFs')} />
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <StepDot active={step === 'review'} done={step === 'done'} label={t('bulkImport.steps.review', '2. Review extracted data')} />
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <StepDot active={step === 'done'} done={false} label={t('bulkImport.steps.done', '3. Done')} />
        </div>

        {/* STEP 1: UPLOAD */}
        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                {t('bulkImport.upload.title', 'Upload signed contract PDFs')}
              </CardTitle>
              <CardDescription>
                {t('bulkImport.upload.desc', 'Drop up to 50 PDFs at once. AI will extract startup name, NIF, dates, pricing, and more. You will review everything before committing.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Programme picker — required, drives program_id on bulk_import_batches.
                  When no active programmes exist we hard-block uploads so a batch
                  can never be created without a programme to attach workspaces to. */}
              {!programsLoading && activePrograms.length === 0 ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{t('bulkImport.noPrograms.title', 'No active programmes')}</AlertTitle>
                  <AlertDescription className="space-y-2">
                    <p>{t('bulkImport.noPrograms.desc', 'Create or activate a programme before importing contracts in bulk. Every imported workspace must be attached to a programme.')}</p>
                    <Button size="sm" variant="outline" onClick={() => navigate('/admin?tab=programs')}>
                      {t('bulkImport.noPrograms.cta', 'Go to programmes')}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="bulk-program">{t('bulkImport.program.label')} <span className="text-destructive">*</span></Label>
                  <Select value={programId} onValueChange={setProgramId} disabled={uploading || programsLoading}>
                    <SelectTrigger id="bulk-program">
                      <SelectValue placeholder={t('bulkImport.program.placeholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      {activePrograms.map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('bulkImport.program.help')}</p>
                </div>
              )}

              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDrop}
                className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors"
              >
                <FilePlus2 className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground mb-3">
                  {t('bulkImport.upload.drop', 'Drag & drop PDFs here, or')}
                </p>
                <Label htmlFor="pdf-input">
                  <Input id="pdf-input" type="file" accept="application/pdf" multiple onChange={onPick} className="hidden" />
                  <Button variant="outline" asChild>
                    <span className="cursor-pointer">{t('bulkImport.upload.browse', 'Browse files')}</span>
                  </Button>
                </Label>
              </div>

              {files.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {t('bulkImport.upload.filesSelected', '{{count}} files selected', { count: files.length })}
                    </p>
                    <Button variant="ghost" size="sm" onClick={() => setFiles([])}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      {t('bulkImport.upload.clearAll', 'Clear all')}
                    </Button>
                  </div>
                  <ScrollArea className="h-48 border rounded-md p-2">
                    {files.map((f, i) => (
                      <div key={i} className="flex items-center justify-between py-1 text-sm">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="truncate">{f.name}</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            ({(f.size / 1024).toFixed(0)} KB)
                          </span>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeFile(i)} aria-label={t('common.delete')}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </ScrollArea>
                </div>
              )}

              {uploading && (
                <div>
                  <p className="text-sm mb-1">
                    {t('bulkImport.upload.uploading', 'Uploading {{done}} / {{total}}...', uploadProgress)}
                  </p>
                  <Progress value={(uploadProgress.done / Math.max(uploadProgress.total, 1)) * 100} />
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => navigate('/admin')}>
                  {t('common.cancel', 'Cancel')}
                </Button>
                <Button
                  onClick={startBatch}
                  disabled={files.length === 0 || uploading || !programId} loading={uploading}
                >
                  {uploading ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('bulkImport.upload.uploading', 'Uploading...')}</>
                  ) : (
                    <><Sparkles className="h-4 w-4 mr-2" />{t('bulkImport.upload.start', 'Upload & extract with AI')}</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* STEP 2: REVIEW */}
        {step === 'review' && batchId && (
          <>
            {selectedProgramName && (
              <Badge variant="secondary" className="text-xs">
                {t('bulkImport.program.selected', { name: selectedProgramName })}
              </Badge>
            )}
            {/* Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <SummaryStat label={t('bulkImport.stats.total', 'Total')} value={counts.total} />
              <SummaryStat label={t('bulkImport.stats.willCreate', 'Will create')} value={counts.willCreate} tone="primary" />
              <SummaryStat label={t('bulkImport.stats.willUpdate', 'Will update')} value={counts.willUpdate} tone="info" />
              <SummaryStat label={t('bulkImport.stats.errors', 'Errors')} value={counts.errors} tone={counts.errors > 0 ? 'destructive' : 'muted'} />
              <SummaryStat label={t('bulkImport.stats.pending', 'Processing')} value={counts.pending} tone="muted" />
              <SummaryStat label={t('bulkImport.stats.committed', 'Committed')} value={counts.committed} tone="success" />
            </div>

            {extracting && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertTitle>{t('bulkImport.extracting.title', 'AI is reading your contracts')}</AlertTitle>
                <AlertDescription>
                  <Progress value={(extractProgress.done / Math.max(extractProgress.total, 1)) * 100} className="mt-2" />
                  <p className="text-xs mt-1">{extractProgress.done} / {extractProgress.total}</p>
                </AlertDescription>
              </Alert>
            )}

            {/* Review table */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>{t('bulkImport.review.title', 'Review extracted data')}</CardTitle>
                  <CardDescription>
                    {t('bulkImport.review.desc', 'Click any row to edit. Uncheck to skip. Errors won\'t be committed.')}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => batchId && refreshRows(batchId)}>
                    <RefreshCcw className="h-4 w-4 mr-1" />
                    {t('common.refresh', 'Refresh')}
                  </Button>
                  {!extracting && counts.pending > 0 && (
                    <Button variant="outline" size="sm" onClick={() => batchId && runExtraction(batchId)}>
                      <Sparkles className="h-4 w-4 mr-1" />
                      {t('bulkImport.review.retryExtract', 'Retry extraction')}
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="border rounded-md overflow-auto max-h-[60vh]">
                  <Table>
                    <TableHeader sticky>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={rows.length > 0 && rows.every(r => r.selected)}
                            onCheckedChange={(checked) => {
                              const sel = !!checked;
                              setRows(prev => prev.map(r => ({ ...r, selected: sel })));
                              if (batchId) {
                                supabase.from('bulk_import_rows').update({ selected: sel }).eq('batch_id', batchId);
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead>{t('bulkImport.cols.file', 'File')}</TableHead>
                        <TableHead>{t('bulkImport.cols.startup', 'Startup')}</TableHead>
                        <TableHead>{t('bulkImport.cols.nif', 'NIF')}</TableHead>
                        <TableHead>{t('bulkImport.cols.typology', 'Typology')}</TableHead>
                        <TableHead>{t('bulkImport.cols.fee', 'Monthly')}</TableHead>
                        <TableHead>{t('bulkImport.cols.status', 'Status')}</TableHead>
                        <TableHead>{t('bulkImport.cols.action', 'Action')}</TableHead>
                        <TableHead>{t('bulkImport.cols.confidence', 'AI')}</TableHead>
                        <TableHead className="w-32"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(row => {
                        const data = row.edited_json || row.extracted_json || {};
                        return (
                          <TableRow key={row.id} className={cn(row.status === 'error' && 'bg-destructive/5')}>
                            <TableCell>
                              <Checkbox
                                checked={row.selected}
                                onCheckedChange={(c) => updateRow(row.id, { selected: !!c })}
                                disabled={row.status === 'committed'}
                              />
                            </TableCell>
                            <TableCell className="text-xs max-w-[160px] truncate">{row.pdf_filename}</TableCell>
                            <TableCell className="font-medium">{data.startup_name || '—'}</TableCell>
                            <TableCell className="text-xs">{data.nif || '—'}</TableCell>
                            <TableCell className="text-xs">{data.typology_name || '—'}</TableCell>
                            <TableCell className="text-xs">{data.monthly_fee ? `€${data.monthly_fee}` : '—'}</TableCell>
                            <TableCell className="text-xs">{data.status || '—'}</TableCell>
                            <TableCell><StatusBadge status={row.status} method={row.match_method} /></TableCell>
                            <TableCell>
                              {row.ai_confidence !== null && (
                                <Badge variant={row.ai_confidence >= 0.8 ? 'default' : row.ai_confidence >= 0.6 ? 'secondary' : 'destructive'}>
                                  {Math.round(row.ai_confidence * 100)}%
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" onClick={() => openPdfPreview(row)} aria-label={t('common.view')}>
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => setEditingRow(row)}>
                                  {t('common.edit', 'Edit')}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {rows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                            {t('bulkImport.review.empty', 'No rows yet')}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex items-center justify-between mt-4">
                  <div className="flex gap-2">
                    {counts.errors > 0 && (
                      <Button variant="outline" size="sm" onClick={downloadErrorsCsv}>
                        <Download className="h-4 w-4 mr-1" />
                        {t('bulkImport.downloadErrors', 'Download errors CSV')}
                      </Button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setStep('upload')}>
                      <ArrowLeft className="h-4 w-4 mr-1" />
                      {t('common.back', 'Back')}
                    </Button>
                    <Button
                      onClick={commitBatch}
                      disabled={committing || extracting || counts.extracted === 0}
                    >
                      {committing ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('bulkImport.committing', 'Importing...')}</>
                      ) : (
                        <><CheckCircle2 className="h-4 w-4 mr-2" />
                        {t('bulkImport.commit', 'Import {{count}} contracts', { count: rows.filter(r => r.selected && ['will_create', 'will_update'].includes(r.status)).length })}</>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* STEP 3: DONE */}
        {step === 'done' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                {t('bulkImport.done.title', 'Import complete')}
              </CardTitle>
              <CardDescription>
                {t('bulkImport.done.desc', 'Contracts have been created. Founders can claim their workspaces from the public claim page.')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedProgramName && (
                <Badge variant="secondary" className="text-xs">
                  {t('bulkImport.program.selected', { name: selectedProgramName })}
                </Badge>
              )}
              <div className="grid grid-cols-3 gap-3">
                <SummaryStat label={t('bulkImport.stats.committed', 'Committed')} value={counts.committed} tone="success" />
                <SummaryStat label={t('bulkImport.stats.errors', 'Errors')} value={counts.errors} tone="destructive" />
                <SummaryStat label={t('bulkImport.stats.skipped', 'Skipped')} value={rows.filter(r => !r.selected).length} tone="muted" />
              </div>
              {counts.errors > 0 && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>{t('bulkImport.done.errorsTitle', 'Some rows failed')}</AlertTitle>
                  <AlertDescription>
                    {t('bulkImport.done.errorsDesc', 'Download the errors CSV, fix the source PDFs, and re-import them.')}
                    <div className="mt-2">
                      <Button variant="outline" size="sm" onClick={downloadErrorsCsv}>
                        <Download className="h-4 w-4 mr-1" />
                        {t('bulkImport.downloadErrors', 'Download errors CSV')}
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => {
                  setStep('upload');
                  setFiles([]);
                  setRows([]);
                  setBatchId(null);
                  setProgramId('');
                }}>
                  {t('bulkImport.done.startNew', 'Start new batch')}
                </Button>
                <Button onClick={() => navigate('/admin')}>
                  {t('bulkImport.done.backAdmin', 'Back to admin')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Edit dialog */}
        <Dialog open={!!editingRow} onOpenChange={(open) => !open && setEditingRow(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRow?.pdf_filename}</DialogTitle>
            </DialogHeader>
            {editingRow && (
              <div className="grid grid-cols-2 gap-3">
                {EDITABLE_FIELDS.map(f => {
                  const data = editingRow.edited_json || editingRow.extracted_json || {};
                  return (
                    <div key={f.key}>
                      <Label className="text-xs">{f.label}</Label>
                      <Input
                        type={f.type || 'text'}
                        defaultValue={data[f.key] ?? ''}
                        onBlur={(e) => {
                          if (e.target.value !== String(data[f.key] ?? '')) {
                            updateEditedField(editingRow, f.key, e.target.value);
                          }
                        }}
                      />
                    </div>
                  );
                })}
                <div className="col-span-2">
                  <Label className="text-xs">{t('bulkImport.edit.notes', 'Notes')}</Label>
                  <Textarea
                    rows={3}
                    defaultValue={(editingRow.edited_json || editingRow.extracted_json || {}).notes ?? ''}
                    onBlur={(e) => updateEditedField(editingRow, 'notes', e.target.value)}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => editingRow && openPdfPreview(editingRow)}>
                <Eye className="h-4 w-4 mr-1" />
                {t('bulkImport.edit.viewPdf', 'View PDF')}
              </Button>
              <Button onClick={() => {
                if (editingRow) {
                  refreshRows(batchId!);
                }
                setEditingRow(null);
              }}>
                {t('common.done', 'Done')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* PDF preview */}
        <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
          <DialogContent className="max-w-5xl h-[85vh] p-0">
            <DialogHeader className="p-4 pb-0">
              <DialogTitle>{t('bulkImport.preview.title', 'Contract PDF')}</DialogTitle>
            </DialogHeader>
            {previewUrl && (
              <iframe src={previewUrl} className="w-full h-full border-0 rounded-b-lg" title="PDF preview" />
            )}
          </DialogContent>
        </Dialog>
      </div>
      <ConfirmDialog {...dialogProps} />
    </AppLayout>
  );
}

// ============ HELPERS ============

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-1 rounded-full',
      active && 'bg-primary text-primary-foreground',
      done && !active && 'bg-muted text-muted-foreground',
      !active && !done && 'text-muted-foreground'
    )}>
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

function SummaryStat({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'primary' | 'info' | 'destructive' | 'success' | 'muted' }) {
  const toneClass = {
    default: 'text-foreground',
    primary: 'text-primary',
    info: 'text-blue-600 dark:text-blue-400',
    destructive: 'text-destructive',
    success: 'text-green-600 dark:text-green-400',
    muted: 'text-muted-foreground',
  }[tone];
  return (
    <Card>
      <CardContent className="pt-4 pb-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-2xl font-bold', toneClass)}>{value}</p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, method }: { status: string; method: string | null }) {
  if (status === 'will_create') return <Badge variant="default">New</Badge>;
  if (status === 'will_update') return <Badge variant="secondary">Update{method ? ` (${method})` : ''}</Badge>;
  if (status === 'committed') return <Badge variant="default" className="bg-green-600">✓ Done</Badge>;
  if (status === 'error') return <Badge variant="destructive">Error</Badge>;
  if (status === 'extracting') return <Badge variant="outline"><Loader2 className="h-3 w-3 mr-1 animate-spin" />…</Badge>;
  if (status === 'pending') return <Badge variant="outline">Queued</Badge>;
  if (status === 'skipped') return <Badge variant="outline">Skipped</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}
