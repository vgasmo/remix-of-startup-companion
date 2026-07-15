import { timeAgo } from '@/lib/dateLocale';
/**
 * FounderRequestsPanel — Founders open change requests to staff from
 * the workspace settings (IBAN, address, legal representative, etc.).
 * Staff (admin/consultor/backoffice) see status controls and can add notes.
 */
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useFounderStaffRequests, useCreateFounderRequest, useUpdateFounderRequest, type FounderRequestType, type FounderRequestStatus } from '@/hooks/useFounderStaffRequests';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { MessageSquarePlus, Send, Inbox } from 'lucide-react';

import { pt, enGB } from 'date-fns/locale';
import { useTranslation } from 'react-i18next';

const REQUEST_TYPES: { value: FounderRequestType; labelPt: string; labelEn: string }[] = [
  { value: 'iban_change', labelPt: 'Alterar IBAN', labelEn: 'Change IBAN' },
  { value: 'address_change', labelPt: 'Alterar morada', labelEn: 'Change address' },
  { value: 'legal_rep_change', labelPt: 'Alterar representante legal', labelEn: 'Change legal representative' },
  { value: 'company_data_change', labelPt: 'Alterar dados da empresa (NIF, nome...)', labelEn: 'Change company data (NIF, name...)' },
  { value: 'contact_change', labelPt: 'Alterar contactos', labelEn: 'Change contacts' },
  { value: 'other', labelPt: 'Outro pedido', labelEn: 'Other request' },
];

const STATUS_META: Record<FounderRequestStatus, { pt: string; en: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  open: { pt: 'Em aberto', en: 'Open', variant: 'outline' },
  in_review: { pt: 'Em análise', en: 'In review', variant: 'secondary' },
  resolved: { pt: 'Resolvido', en: 'Resolved', variant: 'default' },
  rejected: { pt: 'Recusado', en: 'Rejected', variant: 'destructive' },
};

export function FounderRequestsPanel({ workspaceId }: { workspaceId: string }) {
  const { i18n } = useTranslation();
  const { isAdmin, isConsultor, isBackoffice } = useAuth();
  const isStaff = isAdmin || isConsultor || isBackoffice;
  const lang = i18n.language?.startsWith('pt') ? 'pt' : 'en';
  const locale = lang === 'pt' ? pt : enGB;

  const { data: requests = [], isLoading } = useFounderStaffRequests(workspaceId);
  const createReq = useCreateFounderRequest();
  const updateReq = useUpdateFounderRequest();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [reqType, setReqType] = useState<FounderRequestType>('iban_change');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) return;
    await createReq.mutateAsync({
      workspace_id: workspaceId,
      request_type: reqType,
      title: title.trim(),
      description: description.trim(),
    });
    setTitle('');
    setDescription('');
    setReqType('iban_change');
    setDialogOpen(false);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Inbox className="h-4 w-4" />
              {lang === 'pt' ? 'Pedidos à equipa' : 'Requests to staff'}
            </CardTitle>
            <CardDescription>
              {lang === 'pt'
                ? 'Peça alterações de IBAN, morada, representante legal ou outros dados.'
                : 'Request IBAN, address, legal representative or other data changes.'}
            </CardDescription>
          </div>
          {!isStaff && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <MessageSquarePlus className="h-4 w-4" />
                  {lang === 'pt' ? 'Novo pedido' : 'New request'}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{lang === 'pt' ? 'Novo pedido à equipa' : 'New request to staff'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>{lang === 'pt' ? 'Tipo' : 'Type'}</Label>
                    <Select value={reqType} onValueChange={(v) => setReqType(v as FounderRequestType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {REQUEST_TYPES.map(r => (
                          <SelectItem key={r.value} value={r.value}>{lang === 'pt' ? r.labelPt : r.labelEn}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>{lang === 'pt' ? 'Título' : 'Title'}</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={lang === 'pt' ? 'Ex: Novo IBAN da conta empresarial' : 'Ex: New corporate account IBAN'}
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <Label>{lang === 'pt' ? 'Descrição' : 'Description'}</Label>
                    <Textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={5}
                      placeholder={lang === 'pt' ? 'Detalhe a alteração pretendida e inclua os novos dados.' : 'Describe the intended change and include the new data.'}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>
                    {lang === 'pt' ? 'Cancelar' : 'Cancel'}
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={!title.trim() || !description.trim() || createReq.isPending}
                    className="gap-1.5"
                  >
                    <Send className="h-4 w-4" />
                    {lang === 'pt' ? 'Enviar' : 'Send'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{lang === 'pt' ? 'A carregar...' : 'Loading...'}</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {lang === 'pt' ? 'Sem pedidos ainda.' : 'No requests yet.'}
          </p>
        ) : (
          requests.map((r) => {
            const typeMeta = REQUEST_TYPES.find(t => t.value === r.request_type);
            const statusMeta = STATUS_META[r.status];
            return (
              <div key={r.id} className="border rounded-md p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{r.title}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {typeMeta ? (lang === 'pt' ? typeMeta.labelPt : typeMeta.labelEn) : r.request_type}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {timeAgo(new Date(r.created_at), { locale })}
                    </p>
                  </div>
                  <Badge variant={statusMeta.variant} className="shrink-0">
                    {lang === 'pt' ? statusMeta.pt : statusMeta.en}
                  </Badge>
                </div>
                <p className="text-sm whitespace-pre-wrap">{r.description}</p>
                {r.staff_notes && (
                  <div className="text-xs bg-muted p-2 rounded">
                    <p className="font-semibold mb-0.5">{lang === 'pt' ? 'Notas da equipa' : 'Staff notes'}</p>
                    <p className="whitespace-pre-wrap">{r.staff_notes}</p>
                  </div>
                )}
                {isStaff && r.status !== 'resolved' && r.status !== 'rejected' && (
                  <StaffControls
                    requestId={r.id}
                    currentNotes={r.staff_notes || ''}
                    onUpdate={(patch) => updateReq.mutate({ id: r.id, ...patch })}
                    lang={lang}
                  />
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

function StaffControls({
  requestId,
  currentNotes,
  onUpdate,
  lang,
}: {
  requestId: string;
  currentNotes: string;
  onUpdate: (patch: { status?: FounderRequestStatus; staff_notes?: string | null }) => void;
  lang: 'pt' | 'en';
}) {
  const [notes, setNotes] = useState(currentNotes);
  return (
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
  );
}
