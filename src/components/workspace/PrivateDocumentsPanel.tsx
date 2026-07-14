import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Lock, Eye, Download, FileText, Upload, Loader2, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { notify } from '@/lib/notify';
import { useAuth } from '@/contexts/AuthContext';

interface PrivateDocumentsPanelProps {
  workspaceId: string;
}

interface PrivateFile {
  name: string;
  path: string;
  size?: number;
  updated_at?: string;
  contract_number?: string | null;
  source: 'onboarding' | 'intake' | 'staff';
}

/**
 * Staff-only panel that surfaces the private documents (Cartão de Cidadão,
 * IBAN, assinaturas, docs assinados, uploads ad-hoc) associated with a
 * workspace's contracts. Files live in the `contract-documents` bucket, which
 * has strict RLS: only admin / consultor / backoffice can list or read them.
 */
export function PrivateDocumentsPanel({ workspaceId }: PrivateDocumentsPanelProps) {
  const { t } = useTranslation();
  const { isAdmin, isConsultor, roles } = useAuth();
  const isBackoffice = roles.includes('backoffice');
  const canView = isAdmin || isConsultor || isBackoffice;

  const [files, setFiles] = useState<PrivateFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [primaryContractId, setPrimaryContractId] = useState<string | null>(null);

  useEffect(() => {
    if (!canView || !workspaceId) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: contracts, error: cErr } = await supabase
          .from('startup_contracts')
          .select('id, contract_number, created_at')
          .eq('workspace_id', workspaceId)
          .order('created_at', { ascending: false });
        if (cErr) throw cErr;

        if (contracts && contracts.length > 0) {
          setPrimaryContractId(contracts[0].id);
        } else {
          setPrimaryContractId(null);
        }

        const collected: PrivateFile[] = [];
        for (const contract of contracts || []) {
          // Onboarding folder (CC, IBAN, signatures uploaded by founder)
          const onbPrefix = `onboarding/${contract.id}`;
          const { data: onbList } = await supabase.storage
            .from('contract-documents')
            .list(onbPrefix, { limit: 100 });
          (onbList || [])
            .filter((f) => f.name && !f.name.endsWith('/'))
            .forEach((f) =>
              collected.push({
                name: f.name,
                path: `${onbPrefix}/${f.name}`,
                size: (f as { metadata?: { size?: number } }).metadata?.size,
                updated_at: f.updated_at,
                contract_number: contract.contract_number,
                source: f.name.startsWith('staff-') ? 'staff' : 'onboarding',
              }),
            );

          // Intake folder (docs uploaded during pre-contract intake)
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
                  size: (f as { metadata?: { size?: number } }).metadata?.size,
                  updated_at: f.updated_at,
                  contract_number: contract.contract_number,
                  source: 'intake',
                }),
              );
          }
        }
        if (!cancelled) setFiles(collected);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, canView, reloadTick]);

  if (!canView) return null;

  const openFile = async (file: PrivateFile, mode: 'preview' | 'download') => {
    const { data, error: sErr } = await supabase.storage
      .from('contract-documents')
      .createSignedUrl(file.path, 60 * 5);
    if (sErr || !data?.signedUrl) {
      notify.error(sErr?.message || t('privateDocs.signError', { defaultValue: 'Erro ao gerar link' }));
      return;
    }
    if (mode === 'preview') {
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
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

  const handleStaffUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!primaryContractId) {
      notify.error(t('privateDocs.noContract', { defaultValue: 'Sem contrato associado a este workspace' }));
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      notify.error(t('privateDocs.tooLarge', { defaultValue: 'Ficheiro demasiado grande (max 20MB)' }));
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `onboarding/${primaryContractId}/staff-${Date.now()}-${safeName}`;
      const { error: uErr } = await supabase.storage
        .from('contract-documents')
        .upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
      if (uErr) throw uErr;
      notify.success(t('privateDocs.uploadOk', { defaultValue: 'Documento privado carregado' }));
      setReloadTick((n) => n + 1);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Card className="border-amber-500/30 bg-amber-500/5">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4 text-amber-600" />
              {t('privateDocs.title', { defaultValue: 'Documentos privados' })}
              <Badge variant="outline" className="ml-1 text-[10px] gap-1">
                <ShieldCheck className="h-3 w-3" />
                {t('privateDocs.staffOnly', { defaultValue: 'Só staff' })}
              </Badge>
            </CardTitle>
            <CardDescription className="mt-1">
              {t('privateDocs.description', {
                defaultValue: 'Cartão de Cidadão, IBAN, assinaturas e outros documentos sensíveis dos contratos deste workspace.',
              })}
            </CardDescription>
          </div>
          {primaryContractId && (
            <label className="shrink-0">
              <input
                type="file"
                className="hidden"
                onChange={handleStaffUpload}
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                disabled={uploading}
              />
              <Button variant="outline" size="sm" asChild disabled={uploading}>
                <span className="cursor-pointer">
                  {uploading ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {t('common.upload', { defaultValue: 'Upload' })}
                </span>
              </Button>
            </label>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <p className="text-sm text-destructive">{error}</p>
        ) : files.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('privateDocs.empty', { defaultValue: 'Ainda não existem documentos privados para este workspace.' })}
          </p>
        ) : (
          <div className="space-y-1.5">
            {files.map((f) => (
              <div
                key={f.path}
                className="flex items-center gap-2 p-2 rounded-md border bg-background/60 hover:bg-background transition-colors"
              >
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{f.name}</p>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                      {t(`privateDocs.source.${f.source}`, { defaultValue: f.source })}
                    </Badge>
                    {f.contract_number && <span>{f.contract_number}</span>}
                    {f.size && <span>{formatSize(f.size)}</span>}
                  </div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => openFile(f, 'preview')} title={t('common.preview', { defaultValue: 'Pré-visualizar' })}>
                  <Eye className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => openFile(f, 'download')} title={t('common.download', { defaultValue: 'Descarregar' })}>
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
