/**
 * Displays a founder's structured startup change requests with statuses,
 * diff (current → requested), and the ability to cancel while pending.
 */
import { useTranslation } from 'react-i18next';
import {
  useStartupChangeRequests,
  useCancelStartupChangeRequest,
  type StartupChangeRequest,
  type StartupChangeRequestStatus,
} from '@/hooks/useStartupChangeRequests';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, CheckCircle2, XCircle, Ban, ArrowRight } from 'lucide-react';
import { notify } from '@/lib/notify';
import { timeAgo } from '@/lib/dateLocale';

const STATUS_META: Record<StartupChangeRequestStatus, {
  labelKey: string;
  fallback: string;
  Icon: typeof Clock;
  variant: 'default' | 'secondary' | 'outline' | 'destructive';
}> = {
  pending: { labelKey: 'startupChangeRequests.pending', fallback: 'A aguardar validação', Icon: Clock, variant: 'outline' },
  approved: { labelKey: 'startupChangeRequests.approved', fallback: 'Aprovado', Icon: CheckCircle2, variant: 'default' },
  rejected: { labelKey: 'startupChangeRequests.rejected', fallback: 'Recusado', Icon: XCircle, variant: 'destructive' },
  cancelled: { labelKey: 'startupChangeRequests.cancelled', fallback: 'Cancelado', Icon: Ban, variant: 'secondary' },
};

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

interface Props { workspaceId: string; canManage?: boolean }

export function StartupChangeRequestsList({ workspaceId, canManage = true }: Props) {
  const { t } = useTranslation();
  const { data: requests = [], isLoading } = useStartupChangeRequests(workspaceId);
  const cancelMut = useCancelStartupChangeRequest();

  if (isLoading) return null;
  if (!requests.length) return null;

  const pendingCount = requests.filter(r => r.status === 'pending').length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          {t('startupChangeRequests.title', 'Pedidos de alteração')}
          {pendingCount > 0 && (
            <Badge variant="outline">{pendingCount} {t('startupChangeRequests.pendingShort', 'pendente(s)')}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          {t('startupChangeRequests.description', 'Alterações a campos sensíveis são validadas pela equipa antes de serem aplicadas.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {requests.map((r: StartupChangeRequest) => {
          const meta = STATUS_META[r.status];
          const Icon = meta.Icon;
          return (
            <div key={r.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{r.field_label}</span>
                    <Badge variant={meta.variant} className="gap-1">
                      <Icon className="h-3 w-3" />
                      {t(meta.labelKey, meta.fallback)}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                    <span className="line-through opacity-60">{formatValue(r.current_value_json)}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="font-medium text-foreground">{formatValue(r.requested_value_json)}</span>
                  </div>
                  {r.justification && (
                    <p className="text-xs text-muted-foreground italic">"{r.justification}"</p>
                  )}
                  {r.review_notes && (
                    <p className="text-xs text-muted-foreground">
                      <strong>{t('startupChangeRequests.reviewNotes', 'Nota da equipa')}:</strong> {r.review_notes}
                    </p>
                  )}
                  <p className="text-[11px] text-muted-foreground">{timeAgo(r.created_at)}</p>
                </div>
                {canManage && r.status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={cancelMut.isPending}
                    onClick={() => {
                      cancelMut.mutate(r.id, {
                        onSuccess: () => notify.success(t('startupChangeRequests.cancelled', 'Cancelado')),
                        onError: (e: any) => notify.error(e.message),
                      });
                    }}
                  >
                    {t('common.cancel', 'Cancelar')}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
