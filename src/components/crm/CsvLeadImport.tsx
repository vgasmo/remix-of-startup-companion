import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabaseClient';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from "@/lib/notify";

interface PreviewRow {
  id: string;
  row_index: number;
  contact_name: string | null;
  contact_email: string | null;
  organization_name: string | null;
  deal_value: number | null;
  valid: boolean;
  error: string | null;
}

export function CsvLeadImport() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [totals, setTotals] = useState<{ total: number; valid: number; invalid: number }>({ total: 0, valid: 0, invalid: 0 });
  const [staging, setStaging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState(false);

  const reset = () => {
    setBatchId(null);
    setPreview([]);
    setTotals({ total: 0, valid: 0, invalid: 0 });
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setStaging(true);
    try {
      const csvText = await file.text();
      const { data, error } = await invokeWithAuth('bulk-import-leads', {
        body: { mode: 'stage', csv_text: csvText, filename: file.name },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      const resp = data as {
        batch_id: string;
        total_rows: number;
        valid_rows: number;
        invalid_rows: number;
        preview: PreviewRow[];
      };
      setBatchId(resp.batch_id);
      setPreview(resp.preview);
      setTotals({ total: resp.total_rows, valid: resp.valid_rows, invalid: resp.invalid_rows });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify.error(msg);
      reset();
    } finally {
      setStaging(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleImport = async () => {
    if (!batchId) return;
    setImporting(true);
    try {
      const { data, error } = await invokeWithAuth('bulk-import-leads', {
        body: { mode: 'commit', batch_id: batchId },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      const resp = data as { committed: number; errors: Array<{ error: string }> };
      notify.success(t('crm.import.success', { count: resp.committed, defaultValue: `${resp.committed} leads importados` }));
      if (resp.errors?.length) {
        notify.error(t('crm.import.partial', { count: resp.errors.length, defaultValue: `${resp.errors.length} falharam` }));
      }
      queryClient.invalidateQueries({ queryKey: ['funnel-items'] });
      queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
      reset();
      setOpen(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      notify.error(msg);
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = 'name,email,phone,organization,source,notes,deal_value\nJoão Silva,joao@example.com,+351912345678,Startup XYZ,website,Interessado em incubação,5000\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leads_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-2" />
          {t('crm.import.button', { defaultValue: 'Importar CSV' })}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            {t('crm.import.title', { defaultValue: 'Importar Leads via CSV' })}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={staging}>
              <Upload className="h-4 w-4 mr-2" />
              {staging
                ? t('crm.import.staging', { defaultValue: 'A validar…' })
                : t('crm.import.selectFile', { defaultValue: 'Selecionar ficheiro' })}
            </Button>
            <Button variant="ghost" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              {t('crm.import.downloadTemplate', { defaultValue: 'Template CSV' })}
            </Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
          </div>

          <p className="text-xs text-muted-foreground">
            {t('crm.import.hint', { defaultValue: 'Colunas aceites: name, email, phone, organization, source, notes, deal_value. Ficheiros CSV com campos entre aspas são suportados.' })}
          </p>

          {batchId && (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle className="h-3 w-3" /> {totals.valid} {t('crm.import.valid', { defaultValue: 'válidos' })}
                </Badge>
                {totals.invalid > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" /> {totals.invalid} {t('crm.import.invalid', { defaultValue: 'inválidos' })}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground ml-2">{t('crm.import.total', { defaultValue: 'Total' })}: {totals.total}</span>
              </div>

              <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader sticky>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead>{t('crm.import.name', { defaultValue: 'Nome' })}</TableHead>
                      <TableHead>{t('common.email', 'Email')}</TableHead>
                      <TableHead>{t('crm.import.org', { defaultValue: 'Org' })}</TableHead>
                      <TableHead>{t('crm.import.value', { defaultValue: 'Valor' })}</TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((lead) => (
                      <TableRow key={lead.id} className={!lead.valid ? 'opacity-60' : ''}>
                        <TableCell className="text-xs text-muted-foreground">{lead.row_index + 1}</TableCell>
                        <TableCell className="text-sm">{lead.contact_name || '—'}</TableCell>
                        <TableCell className="text-sm">{lead.contact_email || '—'}</TableCell>
                        <TableCell className="text-sm">{lead.organization_name || '—'}</TableCell>
                        <TableCell className="text-sm">{lead.deal_value ? `€${lead.deal_value}` : '—'}</TableCell>
                        <TableCell>
                          {lead.valid ? (
                            <CheckCircle className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <span title={lead.error ?? ''}><AlertCircle className="h-3.5 w-3.5 text-destructive" /></span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {totals.total > preview.length && (
                <p className="text-xs text-muted-foreground text-center">
                  {t('crm.import.showing', { defaultValue: 'A mostrar' })} {preview.length} {t('common.of', { defaultValue: 'de' })} {totals.total}
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); setOpen(false); }}>{t('common.cancel')}</Button>
          <Button onClick={handleImport} disabled={importing || !batchId || totals.valid === 0}>
            {importing
              ? t('crm.import.importing', { defaultValue: 'A importar...' })
              : t('crm.import.importButton', { count: totals.valid, defaultValue: `Importar ${totals.valid} leads` })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
