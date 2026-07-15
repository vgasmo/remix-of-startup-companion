/**
 * Admin inbox for structured founder → admin field change requests.
 * Approve applies the change (for direct startups columns) via SECURITY DEFINER RPC.
 * Reject records the outcome. Both log to activity_log.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabaseClient';
import {
  useAllPendingStartupChangeRequests,
  useApproveStartupChangeRequest,
  useRejectStartupChangeRequest,
  type StartupChangeRequest,
} from '@/hooks/useStartupChangeRequests';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { CheckCircle2, XCircle, ArrowRight, Inbox } from 'lucide-react';
import { notify } from '@/lib/notify';
import { timeAgo } from '@/lib/dateLocale';

function formatValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}

export function StartupChangeRequestsInbox() {
  const { t } = useTranslation();
  const { data: requests = [], isLoading } = useAllPendingStartupChangeRequests();
  const approve = useApproveStartupChangeRequest();
  const reject = useRejectStartupChangeRequest();
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  const workspaceIds = useMemo(
    () => [...new Set(requests.map((r) => r.workspace_id).filter(Boolean) as string[])],
    [requests],
  );

  const { data: workspaces = {} as Record<string, { startupName: string | null }> } = useQuery({
    queryKey: ['scr-inbox-workspaces', workspaceIds],
    enabled: workspaceIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('workspaces')
        .select('id, startup:startups(name)')
        .in('id', workspaceIds);
      const map: Record<string, { startupName: string | null }> = {};
      (data || []).forEach((w: any) => {
        map[w.id] = { startupName: w.startup?.name ?? null };
      });
      return map;
    },
  });

  const requesterIds = useMemo(() => [...new Set(requests.map((r) => r.requested_by))], [requests]);
  const { data: requesters = {} as Record<string, { name: string | null; email: string | null }> } = useQuery({
    queryKey: ['scr-inbox-requesters', requesterIds],
    enabled: requesterIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email')
        .in('id', requesterIds);
      const map: Record<string, { name: string | null; email: string | null }> = {};
      (data || []).forEach((p: any) => {
        map[p.id] = { name: p.full_name ?? null, email: p.email ?? null };
      });
      return map;
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Inbox className="h-5 w-5" />
          {t('admin.startupChangeRequests.title', 'Pedidos de alteração (dados da startup)')}
          {requests.length > 0 && <Badge>{requests.length}</Badge>}
        </CardTitle>
        <CardDescription>
          {t(
            'admin.startupChangeRequests.description',
            'Alterações a campos legais/fiscais submetidas por founders. Aprovar aplica automaticamente quando possível.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('admin.startupChangeRequests.empty', 'Sem pedidos pendentes.')}
          </p>
        ) : (
          requests.map((r: StartupChangeRequest) => {
            const startupName = r.workspace_id ? workspaces[r.workspace_id]?.startupName : null;
            const requester = requesters[r.requested_by];
            return (
              <div key={r.id} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{startupName || t('common.unknown', 'Desconhecido')}</span>
                      <Badge variant="outline">{r.field_label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {requester?.name || requester?.email || r.requested_by} · {timeAgo(new Date(r.created_at))}
                    </p>
                  </div>
                </div>

                <div className="text-sm flex items-center gap-2 flex-wrap">
                  <span className="line-through opacity-60">{formatValue(r.current_value_json)}</span>
                  <ArrowRight className="h-3 w-3" />
                  <span className="font-medium">{formatValue(r.requested_value_json)}</span>
                </div>

                {r.justification && (
                  <p className="text-xs italic text-muted-foreground">"{r.justification}"</p>
                )}

                <Textarea
                  rows={2}
                  placeholder={t('admin.startupChangeRequests.notesPlaceholder', 'Nota (opcional)…')}
                  value={notesById[r.id] || ''}
                  onChange={(e) => setNotesById({ ...notesById, [r.id]: e.target.value })}
                />

                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={reject.isPending}
                    onClick={() => {
                      reject.mutate(
                        { id: r.id, notes: notesById[r.id] || null },
                        {
                          onSuccess: () => notify.success(t('admin.startupChangeRequests.rejected', 'Recusado')),
                          onError: (e: any) => notify.error(e.message),
                        },
                      );
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    {t('common.reject', 'Recusar')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={approve.isPending}
                    onClick={() => {
                      approve.mutate(
                        { id: r.id, notes: notesById[r.id] || null },
                        {
                          onSuccess: () => notify.success(t('admin.startupChangeRequests.approved', 'Aprovado')),
                          onError: (e: any) => notify.error(e.message),
                        },
                      );
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" />
                    {t('common.approve', 'Aprovar')}
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
