/**
 * Staff-facing aggregated inbox of founder → staff requests across all workspaces.
 * Staff can filter by status, view context (workspace, requester) and act on requests.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useFounderStaffRequests, useUpdateFounderRequest, type FounderRequestStatus, type FounderStaffRequest } from '@/hooks/useFounderStaffRequests';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Inbox, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { pt, enGB } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const REQUEST_TYPE_LABELS: Record<string, { pt: string; en: string }> = {
  iban_change: { pt: 'Alterar IBAN', en: 'IBAN change' },
  address_change: { pt: 'Alterar morada', en: 'Address change' },
  legal_rep_change: { pt: 'Representante legal', en: 'Legal representative' },
  company_data_change: { pt: 'Dados da empresa', en: 'Company data' },
  contact_change: { pt: 'Contactos', en: 'Contacts' },
  other: { pt: 'Outro', en: 'Other' },
};

const STATUS_META: Record<FounderRequestStatus, { pt: string; en: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  open: { pt: 'Em aberto', en: 'Open', variant: 'outline' },
  in_review: { pt: 'Em análise', en: 'In review', variant: 'secondary' },
  resolved: { pt: 'Resolvido', en: 'Resolved', variant: 'default' },
  rejected: { pt: 'Recusado', en: 'Rejected', variant: 'destructive' },
};

interface EnrichedRequest extends FounderStaffRequest {
  workspaceName?: string | null;
  workspaceStartupName?: string | null;
  creatorName?: string | null;
  creatorEmail?: string | null;
}

export function FounderRequestsInbox() {
  const { i18n } = useTranslation();
  const lang = i18n.language?.startsWith('pt') ? 'pt' : 'en';
  const locale = lang === 'pt' ? pt : enGB;
  const [statusFilter, setStatusFilter] = useState<'all' | FounderRequestStatus>('all');

  const { data: requests = [], isLoading } = useFounderStaffRequests();
  const updateReq = useUpdateFounderRequest();

  // Enrich with workspace + creator info
  const workspaceIds = useMemo(() => [...new Set(requests.map(r => r.workspace_id))], [requests]);
  const creatorIds = useMemo(() => [...new Set(requests.map(r => r.created_by))], [requests]);

  const { data: workspaces = {} } = useQuery({
    queryKey: ['founder-request-workspaces', workspaceIds],
    enabled: workspaceIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('workspaces')
        .select('id, name, startup:startups(name)')
        .in('id', workspaceIds);
      const map: Record<string, { name: string | null; startupName: string | null }> = {};
      (data || []).forEach((w: any) => {
        map[w.id] = { name: w.name ?? null, startupName: w.startup?.name ?? null };
      });
      return map;
    },
  });

  const { data: creators = {} } = useQuery({
    queryKey: ['founder-request-creators', creatorIds],
    enabled: creatorIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email')
        .in('id', creatorIds);
      const map: Record<string, { name: string | null; email: string | null }> = {};
      (data || []).forEach((p: any) => {
        map[p.id] = { name: p.full_name ?? null, email: p.email ?? null };
      });
      return map;
    },
  });

  const enriched: EnrichedRequest[] = useMemo(() => requests.map(r => ({
    ...r,
    workspaceName: workspaces[r.workspace_id]?.name ?? null,
    workspaceStartupName: workspaces[r.workspace_id]?.startupName ?? null,
    creatorName: creators[r.created_by]?.name ?? null,
    creatorEmail: creators[r.created_by]?.email ?? null,
  })), [requests, workspaces, creators]);

  const filtered = enriched.filter(r => statusFilter === 'all' || r.status === statusFilter);

  const counts = useMemo(() => {
    const acc: Record<string, number> = { all: enriched.length, open: 0, in_review: 0, resolved: 0, rejected: 0 };
    enriched.forEach(r => { acc[r.status] = (acc[r.status] || 0) + 1; });
    return acc;
  }, [enriched]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-5 w-5" />
              {lang === 'pt' ? 'Pedidos de Founders' : 'Founder Requests'}
              {counts.open + counts.in_review > 0 && (
                <Badge variant="secondary">{counts.open + counts.in_review}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              {lang === 'pt'
                ? 'Pedidos abertos pelos founders — alterações de IBAN, morada, representante legal e outros dados.'
                : 'Requests opened by founders — IBAN, address, legal representative and other data changes.'}
            </CardDescription>
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{lang === 'pt' ? `Todos (${counts.all})` : `All (${counts.all})`}</SelectItem>
              <SelectItem value="open">{`${STATUS_META.open[lang]} (${counts.open || 0})`}</SelectItem>
              <SelectItem value="in_review">{`${STATUS_META.in_review[lang]} (${counts.in_review || 0})`}</SelectItem>
              <SelectItem value="resolved">{`${STATUS_META.resolved[lang]} (${counts.resolved || 0})`}</SelectItem>
              <SelectItem value="rejected">{`${STATUS_META.rejected[lang]} (${counts.rejected || 0})`}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{lang === 'pt' ? 'A carregar...' : 'Loading...'}</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            {lang === 'pt' ? 'Sem pedidos nesta vista.' : 'No requests in this view.'}
          </p>
        ) : (
          filtered.map((r) => (
            <RequestRow
              key={r.id}
              r={r}
              lang={lang}
              locale={locale}
              onUpdate={(patch) => updateReq.mutate({ id: r.id, ...patch })}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function RequestRow({
  r, lang, locale, onUpdate,
}: {
  r: EnrichedRequest;
  lang: 'pt' | 'en';
  locale: Locale;
  onUpdate: (patch: { status?: FounderRequestStatus; staff_notes?: string | null }) => void;
}) {
  const [notes, setNotes] = useState(r.staff_notes || '');
  const [expanded, setExpanded] = useState(r.status === 'open' || r.status === 'in_review');
  const typeMeta = REQUEST_TYPE_LABELS[r.request_type];
  const statusMeta = STATUS_META[r.status];
  const isClosed = r.status === 'resolved' || r.status === 'rejected';

  return (
    <div className="border rounded-md p-3 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setExpanded(!expanded)}
              className="text-sm font-medium text-left hover:underline truncate"
            >
              {r.title}
            </button>
            <Badge variant="outline" className="text-[10px]">
              {typeMeta ? typeMeta[lang] : r.request_type}
            </Badge>
            <Badge variant={statusMeta.variant} className="text-[10px]">
              {statusMeta[lang]}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
            <span>
              {r.workspaceStartupName || r.workspaceName || r.workspace_id.slice(0, 8)}
            </span>
            <span>•</span>
            <span>{r.creatorName || r.creatorEmail || '—'}</span>
            <span>•</span>
            <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale })}</span>
            <Link
              to={`/workspace/${r.workspace_id}`}
              className="inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {lang === 'pt' ? 'workspace' : 'workspace'}
            </Link>
          </div>
        </div>
      </div>

      {expanded && (
        <>
          <p className="text-sm whitespace-pre-wrap">{r.description}</p>
          {r.staff_notes && isClosed && (
            <div className="text-xs bg-muted p-2 rounded">
              <p className="font-semibold mb-0.5">{lang === 'pt' ? 'Notas da equipa' : 'Staff notes'}</p>
              <p className="whitespace-pre-wrap">{r.staff_notes}</p>
            </div>
          )}
          {!isClosed && (
            <div className="border-t pt-2 space-y-2">
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={lang === 'pt' ? 'Notas internas / resposta ao founder' : 'Internal notes / reply to founder'}
                rows={2}
                className="text-xs"
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => onUpdate({ status: 'in_review', staff_notes: notes || null })}>
                  {lang === 'pt' ? 'Em análise' : 'In review'}
                </Button>
                <Button size="sm" variant="default" onClick={() => onUpdate({ status: 'resolved', staff_notes: notes || null })}>
                  {lang === 'pt' ? 'Resolver' : 'Resolve'}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => onUpdate({ status: 'rejected', staff_notes: notes || null })}>
                  {lang === 'pt' ? 'Recusar' : 'Reject'}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
