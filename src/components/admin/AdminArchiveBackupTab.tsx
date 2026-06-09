/**
 * AdminArchiveBackupTab — Admin visibility for contract archival + ecosystem snapshots.
 * Provides operational status, retry controls, and health signals.
 * Separated from core contract/intake surfaces per domain modularization policy.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Archive, Database, RefreshCw, CheckCircle2, XCircle, Clock,
  ExternalLink, AlertTriangle, Play, Loader2
} from 'lucide-react';
import { format } from 'date-fns';
import { notify } from "@/lib/notify";

// ─── Contract Archive Section ──────────────────────────────

function ContractArchiveStatus() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: archivedContracts, isLoading } = useQuery({
    queryKey: ['contract-archive-status'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('startup_contracts')
        .select('id, contract_number, organization_name, signed_at, archive_status, archived_at, archive_location_url, archive_attempt_count, last_archive_error, archive_filename')
        .not('signed_at', 'is', null)
        .order('signed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (contractId: string) => {
      const { data, error } = await invokeWithAuth('archive-contracts-to-sharepoint', {
        body: { contract_id: contractId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      notify.success(t('admin.archive.retryTriggered'));
      queryClient.invalidateQueries({ queryKey: ['contract-archive-status'] });
    },
    onError: (err: any) => {
      notify.error(err?.message || t('admin.archive.retryError'));
    },
  });

  const runAllMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeWithAuth('archive-contracts-to-sharepoint', {
        body: {},
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      const processed = data?.results?.length || 0;
      const succeeded = data?.results?.filter((r: any) => r.success).length || 0;
      notify.success(t('admin.archive.runAllSuccess', { succeeded, processed }));
      queryClient.invalidateQueries({ queryKey: ['contract-archive-status'] });
    },
    onError: (err: any) => {
      notify.error(err?.message || t('admin.archive.runAllError'));
    },
  });

  const statusBadge = (status: string | null, attempts: number) => {
    if (status === 'completed') return <Badge variant="default" className="bg-[hsl(var(--success))]"><CheckCircle2 className="h-3 w-3 mr-1" />{t('admin.archive.statusArchived')}</Badge>;
    if (status === 'uploading') return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />{t('admin.archive.statusUploading')}</Badge>;
    if (status === 'failed') return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{t('admin.archive.statusFailed')} ({attempts}x)</Badge>;
    return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />{t('admin.archive.statusPending')}</Badge>;
  };

  const stats = {
    total: archivedContracts?.length || 0,
    completed: archivedContracts?.filter(c => c.archive_status === 'completed').length || 0,
    failed: archivedContracts?.filter(c => c.archive_status === 'failed').length || 0,
    pending: archivedContracts?.filter(c => !c.archive_status || c.archive_status === null || c.archive_status === 'pending').length || 0,
  };

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Archive className="h-5 w-5" />
              {t('admin.archive.contractArchive')}
            </CardTitle>
            <CardDescription className="space-y-1">
              <span>{t('admin.archive.contractArchiveDesc')}</span>
              <span className="flex items-center gap-1.5 text-xs">
                <Clock className="h-3 w-3" />
                {t('admin.archive.scheduledNote')}
              </span>
            </CardDescription>
          </div>
          {stats.pending > 0 && (
            <Button
              variant="outline"
              onClick={() => runAllMutation.mutate()}
              disabled={runAllMutation.isPending}
            >
              {runAllMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
              {t('admin.archive.runNow')}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats row */}
        <div className="grid grid-cols-4 gap-3">
          <div className="text-center p-3 rounded-lg bg-muted/50">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">{t('admin.archive.signedContracts')}</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-[hsl(var(--success))]/10">
            <div className="text-2xl font-bold text-[hsl(var(--success))]">{stats.completed}</div>
            <div className="text-xs text-muted-foreground">{t('admin.archive.statusArchived')}</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-[hsl(var(--warning))]/10">
            <div className="text-2xl font-bold text-[hsl(var(--warning))]">{stats.pending}</div>
            <div className="text-xs text-muted-foreground">{t('admin.archive.statusPending')}</div>
          </div>
          <div className="text-center p-3 rounded-lg bg-destructive/10">
            <div className="text-2xl font-bold text-destructive">{stats.failed}</div>
            <div className="text-xs text-muted-foreground">{t('admin.archive.statusWithError')}</div>
          </div>
        </div>

        {/* Table */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.archive.colContract')}</TableHead>
              <TableHead>{t('admin.archive.colOrganization')}</TableHead>
              <TableHead>{t('admin.archive.colSigned')}</TableHead>
              <TableHead>{t('admin.archive.colStatus')}</TableHead>
              <TableHead>{t('admin.archive.colArchivedAt')}</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {archivedContracts?.slice(0, 20).map((contract) => (
              <TableRow key={contract.id}>
                <TableCell className="font-mono text-sm">
                  {contract.contract_number || contract.id.slice(0, 8)}
                </TableCell>
                <TableCell>{contract.organization_name || '—'}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {contract.signed_at ? format(new Date(contract.signed_at), 'dd/MM/yyyy') : '—'}
                </TableCell>
                <TableCell>
                  {statusBadge(contract.archive_status, contract.archive_attempt_count || 0)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {contract.archived_at ? format(new Date(contract.archived_at), 'dd/MM/yyyy HH:mm') : '—'}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {contract.archive_location_url && (
                      <Button variant="ghost" size="icon" asChild>
                        <a href={contract.archive_location_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
                    )}
                    {(contract.archive_status === 'failed' || contract.archive_status === 'pending' || !contract.archive_status) && (contract.archive_attempt_count || 0) < 5 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => retryMutation.mutate(contract.id)}
                        disabled={retryMutation.isPending}
                        title={contract.archive_status === 'failed' ? t('admin.archive.retry') : t('admin.archive.archiveNow')}
                      >
                        {retryMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {stats.failed > 0 && (
          <div className="text-sm text-destructive flex items-center gap-2 p-3 rounded-lg bg-destructive/5">
            <AlertTriangle className="h-4 w-4" />
            {t('admin.archive.failedContractsWarning', { count: stats.failed })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Ecosystem Snapshot Section ──────────────────────────────

function EcosystemSnapshotStatus() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const { data: snapshots, isLoading } = useQuery({
    queryKey: ['ecosystem-snapshots'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ecosystem_snapshots')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data || [];
    },
  });

  const triggerMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await invokeWithAuth('run-ecosystem-snapshot', {});
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      notify.success(t('admin.archive.snapshotSuccess', { count: data?.total_records || '?' }));
      queryClient.invalidateQueries({ queryKey: ['ecosystem-snapshots'] });
    },
    onError: (err: any) => {
      notify.error(err?.message || t('admin.archive.snapshotError'));
      queryClient.invalidateQueries({ queryKey: ['ecosystem-snapshots'] });
    },
  });

  const statusBadge = (status: string) => {
    if (status === 'completed') return <Badge variant="default" className="bg-[hsl(var(--success))]"><CheckCircle2 className="h-3 w-3 mr-1" />{t('admin.archive.snapshotCompleted')}</Badge>;
    if (status === 'running') return <Badge variant="secondary"><Loader2 className="h-3 w-3 mr-1 animate-spin" />{t('admin.archive.snapshotRunning')}</Badge>;
    if (status === 'failed') return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />{t('admin.archive.snapshotFailed')}</Badge>;
    return <Badge variant="outline">{status}</Badge>;
  };

  const lastSuccess = snapshots?.find(s => s.status === 'completed');
  const lastFailed = snapshots?.find(s => s.status === 'failed');

  if (isLoading) return <Skeleton className="h-48 w-full" />;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              {t('admin.archive.ecosystemSnapshots')}
            </CardTitle>
            <CardDescription className="space-y-1">
              <span>{t('admin.archive.ecosystemSnapshotsDesc')}</span>
              <span className="flex items-center gap-1.5 text-xs">
                <Clock className="h-3 w-3" />
                {t('admin.archive.snapshotScheduledNote')}
              </span>
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => triggerMutation.mutate()}
            disabled={triggerMutation.isPending}
          >
            {triggerMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Play className="h-4 w-4 mr-1" />
            )}
            {t('admin.archive.runNow')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Health summary */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-3 rounded-lg bg-muted/50">
            <div className="text-xs text-muted-foreground mb-1">{t('admin.archive.lastSuccessfulSnapshot')}</div>
            {lastSuccess ? (
              <div className="text-sm font-medium">
                {format(new Date(lastSuccess.completed_at!), 'dd/MM/yyyy HH:mm')}
                <span className="text-muted-foreground ml-2">
                  ({Object.values(lastSuccess.record_counts as Record<string, number> || {}).reduce((a: number, b: number) => a + b, 0)} {t('admin.archive.records')})
                </span>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">{t('common.none')}</div>
            )}
          </div>
          {lastFailed && (
            <div className="p-3 rounded-lg bg-destructive/5">
              <div className="text-xs text-destructive mb-1">{t('admin.archive.lastError')}</div>
              <div className="text-sm text-destructive">{lastFailed.last_error?.slice(0, 100)}</div>
            </div>
          )}
        </div>

        {/* Recent snapshots */}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('admin.archive.colDate')}</TableHead>
              <TableHead>{t('admin.archive.colStatus')}</TableHead>
              <TableHead>{t('admin.archive.colDomains')}</TableHead>
              <TableHead>{t('admin.archive.colRecords')}</TableHead>
              <TableHead>{t('admin.archive.colType')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {snapshots?.map((snap) => {
              const counts = snap.record_counts as Record<string, number> | null;
              const totalRecords = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
              const domainCount = counts ? Object.keys(counts).length : 0;
              return (
                <TableRow key={snap.id}>
                  <TableCell className="text-sm">
                    {format(new Date(snap.started_at), 'dd/MM/yyyy HH:mm')}
                  </TableCell>
                  <TableCell>{statusBadge(snap.status)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{domainCount}</TableCell>
                  <TableCell className="text-sm font-mono">{totalRecords}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {snap.is_scheduled ? t('admin.archive.typeScheduled') : t('admin.archive.typeManual')}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
            {(!snapshots || snapshots.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {t('admin.archive.noSnapshots')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── Main Export ──────────────────────────────

export function AdminArchiveBackupTab() {
  return (
    <div className="space-y-6">
      <ContractArchiveStatus />
      <Separator />
      <EcosystemSnapshotStatus />
    </div>
  );
}
