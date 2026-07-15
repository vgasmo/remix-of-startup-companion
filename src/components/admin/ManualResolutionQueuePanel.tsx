// ManualResolutionQueuePanel
// Phase 5 (P0-5 fix): surfaces records that neither the PHC reconciler nor
// the automated provisioning flow can resolve without human judgement.
// Read-only. Actions live in the linked CRM / Contracts screens.

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { format } from 'date-fns';

interface QueueRow {
  record_kind: 'orphan_contract' | 'unlinked_contracted_funnel';
  record_id: string;
  reference: string | null;
  label: string | null;
  nif: string | null;
  state: string | null;
  funnel_item_id: string | null;
  workspace_id: string | null;
  created_at: string;
  updated_at: string;
  context: Record<string, unknown> | null;
}

export function ManualResolutionQueuePanel() {
  const { t } = useTranslation();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-manual-resolution-queue'],
    // The view has security_invoker; RLS on the underlying tables enforces
    // that only staff who can read startup_contracts/funnel_items see rows.
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_manual_resolution_queue' as never)
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as QueueRow[];
    },
    staleTime: 30_000,
  });

  const grouped = useMemo(() => {
    const rows = data ?? [];
    return {
      orphan_contracts: rows.filter(r => r.record_kind === 'orphan_contract'),
      unlinked_funnel: rows.filter(r => r.record_kind === 'unlinked_contracted_funnel'),
      total: rows.length,
    };
  }, [data]);

  const linkFor = (row: QueueRow): string | null => {
    if (row.record_kind === 'orphan_contract') {
      return `/admin/contracts?open=${row.record_id}`;
    }
    if (row.record_kind === 'unlinked_contracted_funnel' && row.funnel_item_id) {
      return `/crm?open=${row.funnel_item_id}`;
    }
    return null;
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4 text-[hsl(var(--warning))]" />
              {t('admin.manualResolution.title', 'Fila de resolução manual')}
              {typeof grouped.total === 'number' && (
                <Badge variant="secondary">{grouped.total}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {t(
                'admin.manualResolution.description',
                'Registos que nem o reconciler PHC nem o provisionamento automático conseguem resolver. Cada linha exige uma decisão humana antes de qualquer escrita.',
              )}
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : t('common.refresh', 'Actualizar')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.loading', 'A carregar…')}
          </div>
        )}

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
            {t('admin.manualResolution.error', 'Falha a carregar a fila de resolução manual.')}
          </div>
        )}

        {!isLoading && !error && grouped.total === 0 && (
          <p className="text-sm text-muted-foreground">
            {t('admin.manualResolution.empty', 'Sem registos pendentes de resolução manual.')}
          </p>
        )}

        {grouped.orphan_contracts.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('admin.manualResolution.orphanContracts', 'Contratos sem workspace')} ({grouped.orphan_contracts.length})
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.manualResolution.reference', 'Referência')}</TableHead>
                  <TableHead>{t('admin.manualResolution.label', 'Entidade')}</TableHead>
                  <TableHead>NIF</TableHead>
                  <TableHead>{t('admin.manualResolution.state', 'Estado')}</TableHead>
                  <TableHead>{t('admin.manualResolution.updated', 'Actualizado')}</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.orphan_contracts.map(row => (
                  <TableRow key={row.record_id}>
                    <TableCell className="font-mono text-xs">{row.reference ?? '—'}</TableCell>
                    <TableCell className="text-xs">{row.label ?? '—'}</TableCell>
                    <TableCell className="text-xs">{row.nif ?? '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{row.state ?? '—'}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(row.updated_at), 'yyyy-MM-dd')}
                    </TableCell>
                    <TableCell>
                      {linkFor(row) && (
                        <Button asChild variant="ghost" size="sm">
                          <Link to={linkFor(row)!} aria-label={t('common.open', 'Abrir')}>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )}

        {grouped.unlinked_funnel.length > 0 && (
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t('admin.manualResolution.unlinkedFunnel', 'Leads contratados sem workspace')} ({grouped.unlinked_funnel.length})
            </h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.manualResolution.label', 'Entidade')}</TableHead>
                  <TableHead>NIF</TableHead>
                  <TableHead>{t('admin.manualResolution.state', 'Estado')}</TableHead>
                  <TableHead>{t('admin.manualResolution.updated', 'Actualizado')}</TableHead>
                  <TableHead className="w-[80px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {grouped.unlinked_funnel.map(row => (
                  <TableRow key={row.record_id}>
                    <TableCell className="text-xs">{row.label ?? row.reference ?? '—'}</TableCell>
                    <TableCell className="text-xs">{row.nif ?? '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{row.state ?? '—'}</Badge></TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(row.updated_at), 'yyyy-MM-dd')}
                    </TableCell>
                    <TableCell>
                      {linkFor(row) && (
                        <Button asChild variant="ghost" size="sm">
                          <Link to={linkFor(row)!} aria-label={t('common.open', 'Abrir')}>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

export default ManualResolutionQueuePanel;
