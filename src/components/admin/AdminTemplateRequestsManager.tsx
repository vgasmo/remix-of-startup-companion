import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Clock, CheckCircle2, XCircle, Loader2, RotateCcw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTemplateRequests, useUpdateTemplateRequest, type TemplateRequest, type TemplateRequestStatus } from '@/hooks/useTemplateRequests';
import { useTemplates } from '@/hooks/useTemplates';
import { notify } from '@/lib/notify';
import { formatDistanceToNow } from 'date-fns';
import { pt } from 'date-fns/locale';

const TABS: { key: TemplateRequestStatus | 'all'; defaultLabel: string }[] = [
  { key: 'pending', defaultLabel: 'Pendentes' },
  { key: 'in_progress', defaultLabel: 'Em curso' },
  { key: 'fulfilled', defaultLabel: 'Resolvidos' },
  { key: 'rejected', defaultLabel: 'Rejeitados' },
  { key: 'all', defaultLabel: 'Todos' },
];

export function AdminTemplateRequestsManager() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TemplateRequestStatus | 'all'>('pending');
  const { data: all = [], isLoading, isError, refetch } = useTemplateRequests();
  const { data: templates = [] } = useTemplates();
  const update = useUpdateTemplateRequest();
  const [resolving, setResolving] = useState<TemplateRequest | null>(null);
  const [note, setNote] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  const filtered = useMemo(() => {
    if (tab === 'all') return all;
    return all.filter((r) => r.status === tab);
  }, [all, tab]);

  const setStatus = async (r: TemplateRequest, status: TemplateRequestStatus) => {
    try {
      await update.mutateAsync({ id: r.id, status });
      notify.success(t('common.updated', { defaultValue: 'Atualizado' }));
    } catch {
      notify.error(t('common.updateFailed', { defaultValue: 'Falha ao atualizar' }));
    }
  };

  const reopen = async (r: TemplateRequest) => {
    try {
      await update.mutateAsync({ id: r.id, status: 'in_progress', reopen: true });
      notify.success(t('templateRequests.reopened', { defaultValue: 'Pedido reaberto' }));
    } catch {
      notify.error(t('common.updateFailed', { defaultValue: 'Falha ao atualizar' }));
    }
  };

  const submitResolve = async () => {
    if (!resolving) return;
    if (!selectedTemplateId) {
      notify.error(t('templateRequests.pickTemplateRequired', { defaultValue: 'Selecione o template publicado' }));
      return;
    }
    try {
      await update.mutateAsync({
        id: resolving.id,
        status: 'fulfilled',
        admin_note: note.trim() || null,
        fulfilled_template_id: selectedTemplateId,
      });
      notify.success(t('templateRequests.markedFulfilled', { defaultValue: 'Pedido marcado como resolvido' }));
      setResolving(null);
      setNote('');
      setSelectedTemplateId('');
    } catch {
      notify.error(t('common.updateFailed', { defaultValue: 'Falha ao atualizar' }));
    }
  };

  const counts = useMemo(() => ({
    pending: all.filter((r) => r.status === 'pending').length,
    in_progress: all.filter((r) => r.status === 'in_progress').length,
    fulfilled: all.filter((r) => r.status === 'fulfilled').length,
    rejected: all.filter((r) => r.status === 'rejected').length,
  }), [all]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {t('templateRequests.adminTitle', { defaultValue: 'Pedidos de Template' })}
        </CardTitle>
        <CardDescription>
          {t('templateRequests.adminSubtitle', { defaultValue: 'Pedidos submetidos por founders quando não existe template adequado.' })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as TemplateRequestStatus | 'all')} className="mb-3">
          <TabsList>
            {TABS.map((tt) => (
              <TabsTrigger key={tt.key} value={tt.key} className="gap-1.5">
                {t(`templateRequests.tabs.${tt.key}`, { defaultValue: tt.defaultLabel })}
                {tt.key !== 'all' && counts[tt.key as TemplateRequestStatus] > 0 && (
                  <Badge variant="secondary" className="h-4 px-1 text-[10px]">{counts[tt.key as TemplateRequestStatus]}</Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="space-y-2">
            <div className="h-16 rounded-md bg-muted animate-pulse" />
            <div className="h-16 rounded-md bg-muted animate-pulse" />
            <div className="h-16 rounded-md bg-muted animate-pulse" />
          </div>
        ) : isError ? (
          <div className="flex items-center justify-between gap-2 py-6">
            <p className="text-sm text-muted-foreground">
              {t('common.errorLoading', { defaultValue: 'Erro ao carregar.' })}
            </p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              {t('common.retry', { defaultValue: 'Tentar novamente' })}
            </Button>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {t('templateRequests.adminEmpty', { defaultValue: 'Sem pedidos neste estado.' })}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((r) => (
              <li key={r.id} className="p-3 rounded-md border bg-background/50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{r.title}</p>
                      <StatusBadge status={r.status} />
                      <span className="text-[10px] text-muted-foreground">
                        {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: pt })}
                      </span>
                    </div>
                    {r.context_label && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t('templateRequests.relatedTo', { defaultValue: 'Relacionado com' })}: {r.context_label}
                      </p>
                    )}
                    {r.description && <p className="text-xs mt-1.5 whitespace-pre-wrap">{r.description}</p>}
                    {r.admin_note && (
                      <p className="text-xs mt-1.5 p-1.5 rounded bg-muted/50 border border-border/50">
                        <span className="font-medium">{t('templateRequests.adminNote', { defaultValue: 'Nota da equipa' })}:</span> {r.admin_note}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    {r.status === 'pending' && (
                      <Button size="sm" variant="outline" disabled={update.isPending} onClick={() => setStatus(r, 'in_progress')}>
                        {t('templateRequests.startWork', { defaultValue: 'Iniciar' })}
                      </Button>
                    )}
                    {(r.status === 'pending' || r.status === 'in_progress') && (
                      <>
                        <Button size="sm" disabled={update.isPending} onClick={() => { setResolving(r); setNote(r.admin_note || ''); setSelectedTemplateId(r.fulfilled_template_id || ''); }}>
                          {t('templateRequests.resolve', { defaultValue: 'Resolver' })}
                        </Button>
                        <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => setStatus(r, 'rejected')}>
                          {t('templateRequests.reject', { defaultValue: 'Rejeitar' })}
                        </Button>
                      </>
                    )}
                    {(r.status === 'fulfilled' || r.status === 'rejected') && (
                      <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => reopen(r)} className="gap-1">
                        <RotateCcw className="h-3 w-3" />
                        {t('templateRequests.reopen', { defaultValue: 'Reabrir' })}
                      </Button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={!!resolving} onOpenChange={(v) => { if (!v) { setResolving(null); setNote(''); setSelectedTemplateId(''); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('templateRequests.resolveTitle', { defaultValue: 'Resolver pedido' })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <p className="text-sm">{resolving?.title}</p>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-req-template">{t('templateRequests.pickTemplate', { defaultValue: 'Template publicado' })}</Label>
              <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                <SelectTrigger id="tpl-req-template">
                  <SelectValue placeholder={t('templateRequests.pickTemplatePlaceholder', { defaultValue: 'Escolher template…' }) as string} />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.category ? `[${tpl.category}] ` : ''}{tpl.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-req-note">{t('templateRequests.adminNote', { defaultValue: 'Nota da equipa' })}</Label>
              <Textarea
                id="tpl-req-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('templateRequests.notePlaceholder', { defaultValue: 'Nota para o founder (ex: template publicado em Documentos → ...)' }) as string}
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => { setResolving(null); setNote(''); setSelectedTemplateId(''); }}>{t('common.cancel')}</Button>
            <Button size="sm" onClick={submitResolve} disabled={update.isPending || !selectedTemplateId}>
              {t('templateRequests.markFulfilled', { defaultValue: 'Marcar como resolvido' })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StatusBadge({ status }: { status: TemplateRequestStatus }) {
  const { t } = useTranslation();
  const map = {
    pending: { icon: Clock, label: t('templateRequests.status.pending', { defaultValue: 'Pendente' }), variant: 'secondary' as const },
    in_progress: { icon: Loader2, label: t('templateRequests.status.inProgress', { defaultValue: 'Em curso' }), variant: 'outline' as const },
    fulfilled: { icon: CheckCircle2, label: t('templateRequests.status.fulfilled', { defaultValue: 'Resolvido' }), variant: 'default' as const },
    rejected: { icon: XCircle, label: t('templateRequests.status.rejected', { defaultValue: 'Rejeitado' }), variant: 'destructive' as const },
  };
  const m = map[status];
  const Icon = m.icon;
  return (
    <Badge variant={m.variant} className="gap-1">
      <Icon className={`h-3 w-3 ${status === 'in_progress' ? 'animate-spin' : ''}`} />
      {m.label}
    </Badge>
  );
}
