import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Loader2 } from 'lucide-react';
import { useCreateFunnelItem } from '@/hooks/useFunnel';
import { useConsultors } from '@/hooks/useWorkspaceOwner';
import { usePrograms } from '@/hooks/useWorkspaces';
import { useAuth } from '@/contexts/AuthContext';

const DRAFT_KEY = 'sl-new-lead-draft';

const emptyForm = {
  contact_name: '',
  organization_name: '',
  contact_email: '',
  contact_phone: '',
  source: '',
  notes: '',
  owner_consultant_id: '',
  program_id: '',
};

function loadDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (raw) return { ...emptyForm, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return emptyForm;
}

function saveDraft(form: typeof emptyForm) {
  try {
    const hasData = Object.values(form).some(v => v !== '');
    if (hasData) {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } else {
      sessionStorage.removeItem(DRAFT_KEY);
    }
  } catch { /* ignore */ }
}

function clearDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

export function NewLeadDialog() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const createLead = useCreateFunnelItem();
  const { data: consultors } = useConsultors();
  const { data: programs } = usePrograms();

  const [form, setForm] = useState(loadDraft);

  // Persist draft on every change
  useEffect(() => { saveDraft(form); }, [form]);

  const hasAngleBrackets = (s: string) => /[<>]/.test(s);
  const nameInvalid = hasAngleBrackets(form.contact_name) || hasAngleBrackets(form.organization_name);

  const handleSubmit = async () => {
    if (!form.contact_name && !form.organization_name) return;
    if (nameInvalid) return;

    await createLead.mutateAsync({
      contact_name: form.contact_name || null,
      organization_name: form.organization_name || null,
      contact_email: form.contact_email || null,
      contact_phone: form.contact_phone || null,
      source: form.source || null,
      notes: form.notes || null,
      owner_consultant_id: form.owner_consultant_id || user?.id || null,
      program_id: form.program_id || null,
      stage: 'new' as any,
      type: 'lead' as any,
    });

    setForm(emptyForm);
    clearDraft();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2">
          <Plus className="h-4 w-4" />
          {t('crm.newLead', 'Nova Lead')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('crm.createNewLead', 'Criar Nova Lead')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('crm.contactName', 'Nome do Contacto')}</Label>
              <Input
                value={form.contact_name}
                onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))}
                placeholder="João Silva"
                aria-invalid={hasAngleBrackets(form.contact_name) || undefined}
              />
            </div>
            <div>
              <Label>{t('crm.organizationName', 'Organização')}</Label>
              <Input
                value={form.organization_name}
                onChange={e => setForm(f => ({ ...f, organization_name: e.target.value }))}
                placeholder="Startup XYZ"
                aria-invalid={hasAngleBrackets(form.organization_name) || undefined}
              />
            </div>
          </div>
          {nameInvalid && (
            <p className="text-xs text-destructive">
              {t('crm.nameAngleBracketsError', 'Os nomes não podem conter < ou >.')}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.contact_email}
                onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
                placeholder="joao@startup.pt"
              />
            </div>
            <div>
              <Label>{t('crm.phone', 'Telefone')}</Label>
              <Input
                value={form.contact_phone}
                onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                placeholder="+351 912 345 678"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('crm.assignee', 'Consultor Responsável')}</Label>
              <Select value={form.owner_consultant_id} onValueChange={v => setForm(f => ({ ...f, owner_consultant_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('crm.selectConsultor', 'Selecionar...')} />
                </SelectTrigger>
                <SelectContent>
                  {consultors?.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.full_name || c.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('crm.program', 'Programa')}</Label>
              <Select value={form.program_id} onValueChange={v => setForm(f => ({ ...f, program_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder={t('crm.selectProgram', 'Selecionar...')} />
                </SelectTrigger>
                <SelectContent>
                  {programs?.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>{t('crm.source', 'Origem')}</Label>
            <Input
              value={form.source}
              onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
              placeholder={t('crm.sourcePlaceholder', 'Ex: Website, Evento, Referência...')}
            />
          </div>
          <div>
            <Label>{t('crm.notes', 'Notas')}</Label>
            <Textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder={t('crm.notesPlaceholder', 'Observações iniciais sobre esta lead...')}
            />
          </div>
          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={createLead.isPending || (!form.contact_name && !form.organization_name) || nameInvalid} loading={createLead.isPending}
          >
            {createLead.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {t('crm.createLead', 'Criar Lead')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
