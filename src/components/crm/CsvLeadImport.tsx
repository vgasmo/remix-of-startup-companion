import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, FileText, CheckCircle, AlertCircle, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from "@/lib/notify";

interface ParsedLead {
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  organization_name?: string;
  source?: string;
  notes?: string;
  deal_value?: number;
  valid: boolean;
  error?: string;
}

export function CsvLeadImport() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<ParsedLead[]>([]);
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState(false);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        notify.error(t('crm.import.noData', { defaultValue: 'CSV vazio ou sem dados' }));
        return;
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
      const nameIdx = headers.findIndex(h => ['name', 'nome', 'contact_name', 'nome completo'].includes(h));
      const emailIdx = headers.findIndex(h => ['email', 'contact_email', 'e-mail'].includes(h));
      const phoneIdx = headers.findIndex(h => ['phone', 'telefone', 'contact_phone', 'tel'].includes(h));
      const orgIdx = headers.findIndex(h => ['organization', 'empresa', 'startup', 'organization_name', 'organização'].includes(h));
      const sourceIdx = headers.findIndex(h => ['source', 'origem', 'fonte'].includes(h));
      const notesIdx = headers.findIndex(h => ['notes', 'notas', 'observações'].includes(h));
      const valueIdx = headers.findIndex(h => ['deal_value', 'valor', 'value'].includes(h));

      if (nameIdx === -1 && emailIdx === -1) {
        notify.error(t('crm.import.missingColumns', { defaultValue: 'CSV precisa de coluna "name" ou "email"' }));
        return;
      }

      const leads: ParsedLead[] = [];
      const seenEmails = new Set<string>();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map(c => c.trim().replace(/^["']|["']$/g, ''));
        const name = nameIdx >= 0 ? cols[nameIdx] : '';
        const email = emailIdx >= 0 ? cols[emailIdx] : '';
        const phone = phoneIdx >= 0 ? cols[phoneIdx] : '';
        const org = orgIdx >= 0 ? cols[orgIdx] : '';
        const source = sourceIdx >= 0 ? cols[sourceIdx] : '';
        const notes = notesIdx >= 0 ? cols[notesIdx] : '';
        const value = valueIdx >= 0 ? parseFloat(cols[valueIdx]) : undefined;

        const hasIdentity = !!(name || email);
        const emailValid = !email || emailRegex.test(email);
        const isDuplicate = email && seenEmails.has(email.toLowerCase());
        const valid = hasIdentity && emailValid && !isDuplicate;
        
        let error: string | undefined;
        if (!hasIdentity) error = t('crm.import.errorNoIdentity', { defaultValue: 'Nome ou email em falta' });
        else if (!emailValid) error = t('crm.import.errorInvalidEmail', { defaultValue: 'Email inválido' });
        else if (isDuplicate) error = t('crm.import.errorDuplicate', { defaultValue: 'Email duplicado' });
        
        if (email) seenEmails.add(email.toLowerCase());
        
        leads.push({
          contact_name: name,
          contact_email: email,
          contact_phone: phone || undefined,
          organization_name: org || undefined,
          source: source || undefined,
          notes: notes || undefined,
          deal_value: value && !isNaN(value) ? value : undefined,
          valid,
          error,
        });
      }

      setParsed(leads);
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    const validLeads = parsed.filter(l => l.valid);
    if (validLeads.length === 0) return;

    setImporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const rows = validLeads.map(l => ({
        contact_name: l.contact_name || null,
        contact_email: l.contact_email || null,
        contact_phone: l.contact_phone || null,
        organization_name: l.organization_name || null,
        source: l.source || 'csv_import',
        notes: l.notes || null,
        deal_value: l.deal_value || null,
        stage: 'new' as const,
        type: 'lead' as const,
        owner_consultant_id: user?.id || null,
      }));

      const { error } = await supabase.from('funnel_items').insert(rows);
      if (error) throw error;

      notify.success(t('crm.import.success', { count: validLeads.length, defaultValue: `${validLeads.length} leads importados` }));
      queryClient.invalidateQueries({ queryKey: ['funnel-items'] });
      queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
      setParsed([]);
      setOpen(false);
    } catch (err: any) {
      notify.error(err.message);
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

  const validCount = parsed.filter(l => l.valid).length;
  const invalidCount = parsed.filter(l => !l.valid).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              {t('crm.import.selectFile', { defaultValue: 'Selecionar ficheiro' })}
            </Button>
            <Button variant="ghost" size="sm" onClick={downloadTemplate}>
              <Download className="h-4 w-4 mr-2" />
              {t('crm.import.downloadTemplate', { defaultValue: 'Template CSV' })}
            </Button>
            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
          </div>

          <p className="text-xs text-muted-foreground">
            {t('crm.import.hint', { defaultValue: 'Colunas aceites: name, email, phone, organization, source, notes, deal_value' })}
          </p>

          {parsed.length > 0 && (
            <>
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <CheckCircle className="h-3 w-3" /> {validCount} {t('crm.import.valid', { defaultValue: 'válidos' })}
                </Badge>
                {invalidCount > 0 && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" /> {invalidCount} {t('crm.import.invalid', { defaultValue: 'inválidos' })}
                  </Badge>
                )}
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
                    {parsed.slice(0, 50).map((lead, idx) => (
                      <TableRow key={idx} className={!lead.valid ? 'opacity-50' : ''}>
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="text-sm">{lead.contact_name || '—'}</TableCell>
                        <TableCell className="text-sm">{lead.contact_email || '—'}</TableCell>
                        <TableCell className="text-sm">{lead.organization_name || '—'}</TableCell>
                        <TableCell className="text-sm">{lead.deal_value ? `€${lead.deal_value}` : '—'}</TableCell>
                        <TableCell>
                          {lead.valid ? (
                            <CheckCircle className="h-3.5 w-3.5 text-primary" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {parsed.length > 50 && (
                <p className="text-xs text-muted-foreground text-center">
                  {t('crm.import.showing', { defaultValue: 'A mostrar 50 de' })} {parsed.length}
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleImport} disabled={importing || validCount === 0}>
            {importing ? t('crm.import.importing', { defaultValue: 'A importar...' }) : t('crm.import.importButton', { count: validCount, defaultValue: `Importar ${validCount} leads` })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
