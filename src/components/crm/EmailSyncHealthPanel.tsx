/**
 * Email Sync Health Panel — shows Outlook sync status for consultants and staff.
 * Supports per-consultant view and admin overview.
 */
import { useTranslation } from 'react-i18next';
import { Mail, RefreshCw, CheckCircle2, XCircle, Clock, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useEmailSyncStatus, useTriggerEmailSync } from '@/hooks/crm/useEmailSync';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface EmailSyncHealthPanelProps {
  allConsultants?: boolean;
  compact?: boolean;
}

export function EmailSyncHealthPanel({ allConsultants = false, compact = false }: EmailSyncHealthPanelProps) {
  const { t } = useTranslation();
  const { data: statuses, isLoading } = useEmailSyncStatus(allConsultants);
  const triggerSync = useTriggerEmailSync();

  if (isLoading) {
    return <Skeleton className="h-32 w-full" />;
  }

  const status = statuses?.[0];

  const stateIcon = (state: string) => {
    if (state === 'syncing') return <RefreshCw className="h-4 w-4 text-[hsl(var(--info))] animate-spin" />;
    if (state === 'error') return <XCircle className="h-4 w-4 text-destructive" />;
    if (state === 'idle' && status?.last_success_at) return <CheckCircle2 className="h-4 w-4 text-[hsl(var(--success))]" />;
    return <Clock className="h-4 w-4 text-muted-foreground" />;
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        {status ? stateIcon(status.sync_state) : <Mail className="h-4 w-4 text-muted-foreground" />}
        <span className="text-xs text-muted-foreground">
          {status?.last_success_at
            ? t('crm.lastSyncAt', { defaultValue: `Último sync: ${format(new Date(status.last_success_at), 'dd/MM HH:mm')}` })
            : t('crm.neverSynced', { defaultValue: 'Nunca sincronizado' })}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs gap-1"
          onClick={() => triggerSync.mutate()}
          disabled={triggerSync.isPending}
        >
          <RefreshCw className={cn('h-3 w-3', triggerSync.isPending && 'animate-spin')} />
          {t('crm.sync', { defaultValue: 'Sync' })}
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="h-4 w-4" />
          {t('crm.emailSyncHealth', { defaultValue: 'Saúde do Sync de Email' })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {(!statuses || statuses.length === 0) ? (
          <div className="text-center py-4">
            <Mail className="h-8 w-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">
              {t('crm.noSyncConfigured', { defaultValue: 'Nenhuma sincronização configurada' })}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 h-7 text-xs"
              onClick={() => triggerSync.mutate()}
              disabled={triggerSync.isPending}
            >
              <RefreshCw className={cn('h-3 w-3 mr-1', triggerSync.isPending && 'animate-spin')} />
              {t('crm.startFirstSync', { defaultValue: 'Iniciar primeira sincronização' })}
            </Button>
          </div>
        ) : (
          statuses.map(s => (
            <div key={s.id} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {stateIcon(s.sync_state)}
                  <span className="text-xs font-medium">{s.mailbox_email || 'Outlook'}</span>
                  <Badge variant={s.sync_state === 'error' ? 'destructive' : 'secondary'} className="text-[10px]">
                    {s.sync_state}
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => triggerSync.mutate()}
                  disabled={triggerSync.isPending}
                >
                  <RefreshCw className={cn('h-3 w-3', triggerSync.isPending && 'animate-spin')} />
                  {t('crm.syncNow', { defaultValue: 'Sincronizar' })}
                </Button>
              </div>

              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-semibold">{s.emails_processed}</p>
                  <p className="text-[10px] text-muted-foreground">{t('crm.processed', { defaultValue: 'Processados' })}</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-[hsl(var(--success))]">{s.emails_logged}</p>
                  <p className="text-[10px] text-muted-foreground">{t('crm.logged', { defaultValue: 'Registados' })}</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-[hsl(var(--warning))]">{s.emails_unmatched}</p>
                  <p className="text-[10px] text-muted-foreground">{t('crm.unmatched', { defaultValue: 'Por resolver' })}</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-muted-foreground">{s.emails_ignored}</p>
                  <p className="text-[10px] text-muted-foreground">{t('crm.ignoredCount', { defaultValue: 'Ignorados' })}</p>
                </div>
              </div>

              {s.last_sync_error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded p-2">
                  <p className="text-xs text-destructive">{s.last_sync_error}</p>
                </div>
              )}

              <Separator />

              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>
                  {t('crm.lastSuccess', { defaultValue: 'Último sucesso' })}:{' '}
                  {s.last_success_at ? format(new Date(s.last_success_at), 'dd/MM/yyyy HH:mm') : '—'}
                </span>
                <span>
                  {t('crm.lastSync', { defaultValue: 'Último sync' })}:{' '}
                  {s.last_sync_at ? format(new Date(s.last_sync_at), 'dd/MM/yyyy HH:mm') : '—'}
                </span>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
