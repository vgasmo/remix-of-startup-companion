import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { FileText, Download, Eye, ExternalLink, Loader2, Search, Folder } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';

type ContractRow = {
  id: string;
  contract_number: string | null;
  status: string;
  signature_status: string | null;
  organization_name: string | null;
  legal_representative_name: string | null;
  legal_representative_email: string | null;
  company_nif: string | null;
  start_date: string | null;
  signed_at: string | null;
  created_at: string;
  document_url: string | null;
  contract_pdf_path: string | null;
  workspace_id: string | null;
  workspaces?: { id: string; startup_id: string; startups?: { name: string | null } | null } | null;
};

type StorageFile = {
  name: string;
  path: string;
  size?: number | null;
  updated_at?: string | null;
  source: 'onboarding' | 'intake' | 'contract';
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  intake_requested: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  intake_completed: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  ready_to_sign: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  sent_for_signature: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  signed: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  active: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  terminated: 'bg-destructive/10 text-destructive',
};

const isPreviewable = (name: string) =>
  /\.(pdf|png|jpe?g|gif|webp)$/i.test(name);

export default function AdminContracts() {
  const { t } = useTranslation();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selected, setSelected] = useState<ContractRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-contracts-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('startup_contracts')
        .select(`
          id, contract_number, status, signature_status, organization_name,
          legal_representative_name, legal_representative_email, company_nif,
          start_date, signed_at, created_at, document_url, contract_pdf_path, workspace_id,
          workspaces:workspace_id ( id, startup_id, startups:startup_id ( name ) )
        `)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as ContractRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((c) => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (!q) return true;
      const hay = [
        c.contract_number,
        c.organization_name,
        c.workspaces?.startups?.name,
        c.legal_representative_name,
        c.legal_representative_email,
        c.company_nif,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [data, search, statusFilter]);

  const statuses = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((c) => c.status && set.add(c.status));
    return Array.from(set).sort();
  }, [data]);

  return (
    <AppLayout>
      <div className="container mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t('Contratos & Documentos', 'Contracts & Documents')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              'Listagem de contratos e documentos enviados pelos fundadores. Pré-visualize ou faça download através de links assinados.',
              'List of contracts and documents submitted by founders. Preview or download via signed URLs.',
            )}
          </p>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder={t('Procurar por nome, NIF, contrato…', 'Search by name, NIF, contract…')}
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('Todos os estados', 'All statuses')}</SelectItem>
                  {statuses.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                {t('Sem contratos.', 'No contracts.')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3 text-left">{t('Contrato', 'Contract')}</th>
                      <th className="px-4 py-3 text-left">{t('Startup', 'Startup')}</th>
                      <th className="px-4 py-3 text-left">NIF</th>
                      <th className="px-4 py-3 text-left">{t('Estado', 'Status')}</th>
                      <th className="px-4 py-3 text-left">{t('Criado', 'Created')}</th>
                      <th className="px-4 py-3 text-right">{t('Ações', 'Actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((c) => (
                      <tr key={c.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">
                          {c.contract_number || c.id.slice(0, 8)}
                        </td>
                        <td className="px-4 py-3">
                          {c.workspaces?.startups?.name || c.organization_name || '—'}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{c.company_nif || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={STATUS_COLORS[c.status] || ''}>
                            {c.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {c.created_at ? format(new Date(c.created_at), 'yyyy-MM-dd') : '—'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setSelected(c)}>
                              <Folder className="mr-1 h-3.5 w-3.5" />
                              {t('Documentos', 'Documents')}
                            </Button>
                            {c.workspace_id && (
                              <Button size="sm" variant="ghost" asChild>
                                <Link to={`/workspace/${c.workspace_id}`}>
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </Link>
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <ContractDocumentsDialog
        contract={selected}
        onClose={() => setSelected(null)}
        t={t}
      />
    </AppLayout>
  );
}

function ContractDocumentsDialog({
  contract,
  onClose,
  t,
}: {
  contract: ContractRow | null;
  onClose: () => void;
  t: (pt: string, en: string) => string;
}) {
  const [files, setFiles] = useState<StorageFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string>('');

  useEffect(() => {
    if (!contract) {
      setFiles([]);
      setError(null);
      setPreviewUrl(null);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const collected: StorageFile[] = [];

        // 1. Onboarding folder for this contract
        const onbPrefix = `onboarding/${contract.id}`;
        const { data: onbList, error: onbErr } = await supabase.storage
          .from('contract-documents')
          .list(onbPrefix, { limit: 100 });
        if (onbErr) throw onbErr;
        (onbList || [])
          .filter((f) => f.name && !f.name.endsWith('/'))
          .forEach((f) =>
            collected.push({
              name: f.name,
              path: `${onbPrefix}/${f.name}`,
              size: (f as any).metadata?.size,
              updated_at: f.updated_at,
              source: 'onboarding',
            }),
          );

        // 2. Final generated contract PDF (if any)
        if (contract.contract_pdf_path) {
          collected.push({
            name: contract.contract_pdf_path.split('/').pop() || 'contract.pdf',
            path: contract.contract_pdf_path,
            source: 'contract',
          });
        }

        // 3. Intake folder (look up intake linked to this contract)
        const { data: intakes } = await supabase
          .from('contract_intakes')
          .select('id')
          .eq('contract_id', contract.id);
        for (const intake of intakes || []) {
          const intakePrefix = `intake/${intake.id}`;
          const { data: intakeList } = await supabase.storage
            .from('contract-documents')
            .list(intakePrefix, { limit: 100 });
          (intakeList || [])
            .filter((f) => f.name && !f.name.endsWith('/'))
            .forEach((f) =>
              collected.push({
                name: f.name,
                path: `${intakePrefix}/${f.name}`,
                size: (f as any).metadata?.size,
                updated_at: f.updated_at,
                source: 'intake',
              }),
            );
        }

        if (!cancelled) setFiles(collected);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Erro ao carregar documentos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contract]);

  const openSignedUrl = async (file: StorageFile, preview: boolean) => {
    const { data, error } = await supabase.storage
      .from('contract-documents')
      .createSignedUrl(file.path, 60 * 30);
    if (error || !data?.signedUrl) {
      setError(error?.message || 'Erro ao gerar link');
      return;
    }
    if (preview) {
      setPreviewUrl(data.signedUrl);
      setPreviewName(file.name);
    } else {
      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.download = file.name;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  return (
    <Dialog open={!!contract} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>
            {t('Documentos do contrato', 'Contract documents')} —{' '}
            {contract?.contract_number || contract?.id.slice(0, 8)}
          </DialogTitle>
          <DialogDescription>
            {contract?.workspaces?.startups?.name || contract?.organization_name}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : files.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {t('Sem documentos enviados.', 'No documents uploaded yet.')}
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((f) => (
              <div
                key={f.path}
                className="flex items-center justify-between gap-3 rounded-md border bg-card p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{f.name}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">
                        {f.source}
                      </Badge>
                      {f.size ? <span>{(f.size / 1024).toFixed(1)} KB</span> : null}
                      {f.updated_at ? (
                        <span>{format(new Date(f.updated_at), 'yyyy-MM-dd')}</span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  {isPreviewable(f.name) && (
                    <Button size="sm" variant="outline" onClick={() => openSignedUrl(f, true)}>
                      <Eye className="mr-1 h-3.5 w-3.5" />
                      {t('Pré-visualizar', 'Preview')}
                    </Button>
                  )}
                  <Button size="sm" onClick={() => openSignedUrl(f, false)}>
                    <Download className="mr-1 h-3.5 w-3.5" />
                    {t('Download', 'Download')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {previewUrl && (
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground truncate">{previewName}</div>
              <Button size="sm" variant="ghost" onClick={() => setPreviewUrl(null)}>
                {t('Fechar pré-visualização', 'Close preview')}
              </Button>
            </div>
            <iframe
              src={previewUrl}
              title={previewName}
              className="h-[60vh] w-full rounded-md border bg-muted"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
