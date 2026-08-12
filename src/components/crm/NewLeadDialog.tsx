import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Loader2, ChevronDown } from 'lucide-react';
import { useCreateFunnelItem } from '@/hooks/useFunnel';
import { useConsultors } from '@/hooks/useWorkspaceOwner';
import { usePrograms } from '@/hooks/useWorkspaces';
import { useAuth } from '@/contexts/AuthContext';
import { useLocalFormDraft } from '@/hooks/useLocalFormDraft';
import { DraftRestoredNotice } from '@/components/shared/DraftRestoredNotice';

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

type LeadForm = typeof emptyForm;

/** Only the user-typed fields count as content — silent defaults must not create a draft. */
const leadIsDirty = (f: LeadForm) =>
  Boolean(
    f.contact_name ||
      f.organization_name ||
      f.contact_email ||
      f.contact_phone ||
      f.source ||
      f.notes,
  );


export function NewLeadDialog() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const createLead = useCreateFunnelItem();
  const { data: consultors } = useConsultors();
  const { data: programs } = usePrograms();

  const [form, setForm] = useState<LeadForm>(emptyForm);

  const restoreDraft = useCallback((draft: LeadForm) => {
    setForm({ ...emptyForm, ...draft });
    setOpen(true);
  }, []);

  const { restored, clear, dismissRestored } = useLocalFormDraft<LeadForm>({
    key: 'crm-new-lead',
    value: form,
    onRestore: restoreDraft,
    isDirty: leadIsDirty,
  });

  // Silent defaults: preselect current user as owner + auto-pick program when only one exists.
  // Only fill when the field is empty so a saved draft is not overwritten.
  useEffect(() => {
    if (!open) return;
    setForm(f => {
      const next = { ...f };
      if (!next.owner_consultant_id && user?.id) next.owner_consultant_id = user.id;
      if (!next.program_id && programs && programs.length === 1) next.program_id = programs[0].id;
      return next;
    });
  }, [open, user?.id, programs]);


  const hasAngleBrackets = (s: string) => /[<>]/.test(s);
  const nameInvalid = hasAngleBrackets(form.contact_name) || hasAngleBrackets(form.organization_name);
  const hasIdentity = Boolean(form.contact_name || form.organization_name);

  const handleSubmit = async () => {
    if (!hasIdentity || nameInvalid) return;
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
    setShowMore(false);
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
          {/* Core: name + org + email */}
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
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={form.contact_email}
              onChange={e => setForm(f => ({ ...f, contact_email: e.target.value }))}
              placeholder="joao@startup.pt"
            />
          </div>

          {/* Mais opções: phone, source, owner, program, notes */}
          <Collapsible open={showMore} onOpenChange={setShowMore}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground hover:text-foreground">
                <span>{t('common.moreOptions', 'Mais opções')}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showMore ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('crm.phone', 'Telefone')}</Label>
                  <Input
                    value={form.contact_phone}
                    onChange={e => setForm(f => ({ ...f, contact_phone: e.target.value }))}
                    placeholder="+351 912 345 678"
                  />
                </div>
                <div>
                  <Label>{t('crm.source', 'Origem')}</Label>
                  <Input
                    value={form.source}
                    onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                    placeholder={t('crm.sourcePlaceholder', 'Ex: Website, Evento, Referência...')}
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
                <Label>{t('crm.notes', 'Notas')}</Label>
                <Textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3}
                  placeholder={t('crm.notesPlaceholder', 'Observações iniciais sobre esta lead...')}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Explicit hint replaces silent-disabled submit */}
          {!hasIdentity && (
            <p className="text-xs text-muted-foreground">
              {t('crm.newLeadHint', 'Preencha o nome do contacto ou o nome da organização para criar a lead.')}
            </p>
          )}

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={createLead.isPending || !hasIdentity || nameInvalid}
            loading={createLead.isPending}
          >
            {createLead.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {t('crm.createLead', 'Criar Lead')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
