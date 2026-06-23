import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Plus, Clock, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTemplateRequests, type TemplateRequestStatus } from '@/hooks/useTemplateRequests';
import { RequestTemplateDialog } from './RequestTemplateDialog';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';

const STATUS_META: Record<TemplateRequestStatus, { labelKey: string; defaultLabel: string; icon: typeof Clock; variant: 'secondary' | 'outline' | 'default' | 'destructive' }> = {
  pending: { labelKey: 'templateRequests.status.pending', defaultLabel: 'Pendente', icon: Clock, variant: 'secondary' },
  in_progress: { labelKey: 'templateRequests.status.inProgress', defaultLabel: 'Em curso', icon: Loader2, variant: 'outline' },
  fulfilled: { labelKey: 'templateRequests.status.fulfilled', defaultLabel: 'Resolvido', icon: CheckCircle2, variant: 'default' },
  rejected: { labelKey: 'templateRequests.status.rejected', defaultLabel: 'Rejeitado', icon: XCircle, variant: 'destructive' },
};

export function TemplateRequestsPanel({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const { data: requests = [], isLoading } = useTemplateRequests({ workspaceId });
  const [open, setOpen] = useState(false);

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                {t('templateRequests.title', { defaultValue: 'Pedidos de template' })}
              </CardTitle>
              <CardDescription>
                {t('templateRequests.subtitle', { defaultValue: 'Falta um template? Solicite e acompanhe o estado.' })}
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {t('templateRequests.newRequest', { defaultValue: 'Novo pedido' })}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-xs text-muted-foreground">{t('common.loading', { defaultValue: 'A carregar...' })}</p>
          ) : requests.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              {t('templateRequests.empty', { defaultValue: 'Ainda não há pedidos. Use "Novo pedido" se faltar um modelo.' })}
            </p>
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => {
                const meta = STATUS_META[r.status] ?? STATUS_META.pending;
                const Icon = meta.icon;
                return (
                  <li key={r.id} className="flex items-start justify-between gap-3 p-3 rounded-md border bg-background/60">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{r.title}</p>
                      {r.context_label && (
                        <p className="text-[11px] text-muted-foreground truncate">{r.context_label}</p>
                      )}
                      {r.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{r.description}</p>
                      )}
                      {r.admin_note && (
                        <p className="text-xs mt-1.5 p-1.5 rounded bg-muted/50 border border-border/50">
                          <span className="font-medium">{t('templateRequests.adminNote', { defaultValue: 'Nota da equipa' })}:</span> {r.admin_note}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: pt })}
                      </p>
                    </div>
                    <Badge variant={meta.variant} className="gap-1 shrink-0">
                      <Icon className={`h-3 w-3 ${r.status === 'in_progress' ? 'animate-spin' : ''}`} />
                      {t(meta.labelKey, { defaultValue: meta.defaultLabel })}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <RequestTemplateDialog
        open={open}
        onOpenChange={setOpen}
        workspaceId={workspaceId}
        contextType="general"
      />
    </>
  );
}
