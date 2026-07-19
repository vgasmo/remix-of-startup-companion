import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { Send, Paperclip, FileText } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

import { usePrograms } from '@/hooks/useAdminData';
import { useProposalMaterials } from '@/hooks/useProposalMaterials';
import type { FunnelItem } from '@/hooks/useFunnel';
import { invokeWithAuth } from '@/lib/invokeWithAuth';
import { notify } from '@/lib/notify';
import { logger } from '@/lib/logger';

interface SendProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: FunnelItem;
}

/**
 * Composer for the "Enviar Proposta Comercial" flow in the CRM lead drawer.
 * The staff user picks a program, edits subject + body, and toggles which of
 * the program's configured support materials go as signed-link attachments in
 * the email. On send it advances the lead to `proposal_sent` and creates a
 * 7-day follow-up task server-side.
 */
export function SendProposalDialog({ open, onOpenChange, item }: SendProposalDialogProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { data: programs = [] } = usePrograms();

  const [programId, setProgramId] = useState<string | null>(item.program_id ?? null);
  const { data: materials = [], isLoading: materialsLoading } = useProposalMaterials(programId);

  const programName = useMemo(
    () => programs.find((p: any) => p.id === programId)?.name ?? null,
    [programs, programId],
  );

  const contactName = item.contact_name ?? '';
  const contactFirst = contactName.split(' ')[0] || contactName;

  const defaultSubject = useMemo(() => {
    if (programName) {
      return t('crm.proposal.defaultSubjectWithProgram', {
        defaultValue: 'Proposta comercial — {{program}} — Startup Leiria',
        program: programName,
      });
    }
    return t('crm.proposal.defaultSubject', {
      defaultValue: 'Proposta comercial — Startup Leiria',
    });
  }, [programName, t]);

  const defaultBody = useMemo(() => {
    const greeting = contactFirst
      ? t('crm.proposal.bodyGreeting', {
          defaultValue: 'Olá {{name}},',
          name: contactFirst,
        })
      : t('crm.proposal.bodyGreetingFallback', { defaultValue: 'Olá,' });

    const programLine = programName
      ? t('crm.proposal.bodyProgramLine', {
          defaultValue:
            'Conforme conversado, segue em anexo a proposta para integração no programa {{program}}.',
          program: programName,
        })
      : t('crm.proposal.bodyProgramFallback', {
          defaultValue:
            'Conforme conversado, segue em anexo a nossa proposta comercial para integração na Startup Leiria.',
        });

    return [
      greeting,
      '',
      programLine,
      '',
      t('crm.proposal.bodyDocs', {
        defaultValue:
          'Nos documentos anexos poderá encontrar a minuta contratual e o regulamento aplicável. Fico à disposição para esclarecer qualquer dúvida e agendar os próximos passos.',
      }),
      '',
      t('crm.proposal.bodySignoff', { defaultValue: 'Aguardo o vosso retorno.' }),
    ].join('\n');
  }, [contactFirst, programName, t, i18n.language]);

  const [subject, setSubject] = useState(defaultSubject);
  const [bodyText, setBodyText] = useState(defaultBody);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [ccOwner, setCcOwner] = useState(true);
  const [sending, setSending] = useState(false);

  // Refresh templated content when dialog opens or program changes.
  useEffect(() => {
    if (!open) return;
    setSubject(defaultSubject);
    setBodyText(defaultBody);
  }, [open, defaultSubject, defaultBody]);

  // Pre-select attach_to_proposal defaults whenever the material list refreshes.
  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set(materials.filter((m) => m.attach_to_proposal).map((m) => m.id)));
  }, [materials, open]);

  const toggleMaterial = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const canSend =
    !sending && subject.trim().length >= 3 && bodyText.trim().length >= 10 && !!item.contact_email;

  const handleSend = async () => {
    if (!canSend) return;
    setSending(true);
    // Stable idempotency key per dialog-send attempt. If the user retries the
    // same click (network hiccup, double-tap) the edge function short-circuits
    // via notification_ledger and returns duplicate=true instead of double-sending.
    const idempotencyKey =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `${item.id}-${Date.now()}`;
    try {
      const { data, error } = await invokeWithAuth<{
        success: boolean;
        stage: string;
        attachments: Array<{ id: string; title: string }>;
      }>('send-commercial-proposal', {
        body: {
          funnel_item_id: item.id,
          program_id: programId,
          subject: subject.trim(),
          body_text: bodyText.trim(),
          support_material_ids: Array.from(selectedIds),
          cc_owner: ccOwner,
          idempotency_key: idempotencyKey,
        },
      });
      if (error) throw error;

      notify.success(
        t('crm.proposal.sent', { defaultValue: 'Proposta enviada' }),
        {
          description: t('crm.proposal.sentDesc', {
            defaultValue: 'A lead avançou para "Proposta Enviada" e foi criado um follow-up a 7 dias.',
          }),
        },
      );

      queryClient.invalidateQueries({ queryKey: ['funnel-items'] });
      queryClient.invalidateQueries({ queryKey: ['funnel-item', item.id] });
      queryClient.invalidateQueries({ queryKey: ['funnel-events', item.id] });
      queryClient.invalidateQueries({ queryKey: ['communication-log', item.id] });
      queryClient.invalidateQueries({ queryKey: ['staff-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['activity-timeline', item.id] });

      onOpenChange(false);
    } catch (err) {
      logger.error('Failed to send commercial proposal', { itemId: item.id }, err as Error);
      notify.error(
        t('crm.proposal.sendFailed', { defaultValue: 'Falha ao enviar proposta' }),
        { description: (err as Error).message },
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !sending && onOpenChange(o)}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" />
            {t('crm.proposal.title', { defaultValue: 'Enviar proposta comercial' })}
          </DialogTitle>
          <DialogDescription>
            {t('crm.proposal.description', {
              defaultValue:
                'Envia um email para o contacto com o corpo da proposta e links para descarregar os documentos escolhidos. A lead avança para a etapa "Proposta Enviada" e é criado um follow-up a 7 dias.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-1 text-xs text-muted-foreground">
            <div>
              <span className="font-medium text-foreground">
                {t('crm.proposal.recipient', { defaultValue: 'Destinatário' })}:
              </span>{' '}
              {item.contact_name ? `${item.contact_name} · ` : ''}
              {item.contact_email ?? '—'}
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-xs">
              {t('crm.proposal.program', { defaultValue: 'Programa' })}
            </Label>
            <Select
              value={programId ?? '__none__'}
              onValueChange={(v) => setProgramId(v === '__none__' ? null : v)}
            >
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">
                  {t('crm.proposal.noProgram', { defaultValue: 'Sem programa específico' })}
                </SelectItem>
                {programs
                  .filter((p: any) => p.is_active !== false)
                  .map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label className="text-xs">
              {t('crm.proposal.subject', { defaultValue: 'Assunto' })}
            </Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={300} />
          </div>

          <div className="grid gap-2">
            <Label className="text-xs">
              {t('crm.proposal.body', { defaultValue: 'Corpo do email' })}
            </Label>
            <Textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={9}
              maxLength={10_000}
              className="text-sm"
            />
            <p className="text-[11px] text-muted-foreground">
              {t('crm.proposal.bodyHint', {
                defaultValue:
                  'O email é enviado com o cabeçalho Startup Leiria e a sua assinatura como consultor.',
              })}
            </p>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1">
                <Paperclip className="h-3.5 w-3.5" />
                {t('crm.proposal.attachments', { defaultValue: 'Documentos em anexo (links)' })}
              </Label>
              <Badge variant="outline" className="text-[10px]">
                {selectedIds.size}
              </Badge>
            </div>

            <div className="rounded-md border">
              <ScrollArea className="h-40">
                <div className="p-2 space-y-1">
                  {materialsLoading ? (
                    <p className="text-xs text-muted-foreground p-2">
                      {t('common.loading', { defaultValue: 'A carregar…' })}
                    </p>
                  ) : materials.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">
                      {t('crm.proposal.noMaterials', {
                        defaultValue:
                          'Nenhum documento configurado para este programa. Adicione materiais em Consultor → Materiais de Apoio e marque "Anexar à proposta comercial".',
                      })}
                    </p>
                  ) : (
                    materials.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-start gap-2 rounded-sm px-2 py-1.5 hover:bg-muted/60 cursor-pointer"
                      >
                        <Checkbox
                          checked={selectedIds.has(m.id)}
                          onCheckedChange={() => toggleMaterial(m.id)}
                          className="mt-0.5"
                        />
                        <div className="grid gap-0.5 flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 text-sm">
                            <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            <span className="truncate font-medium">{m.title}</span>
                            {m.attach_to_proposal && (
                              <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                                {t('crm.proposal.defaultBadge', { defaultValue: 'padrão' })}
                              </Badge>
                            )}
                          </div>
                          {m.description && (
                            <span className="text-[11px] text-muted-foreground truncate">
                              {m.description}
                            </span>
                          )}
                        </div>
                      </label>
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox checked={ccOwner} onCheckedChange={(v) => setCcOwner(v === true)} />
            {t('crm.proposal.ccOwner', {
              defaultValue: 'Enviar uma cópia (Cc) para o meu email',
            })}
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            {t('common.cancel', { defaultValue: 'Cancelar' })}
          </Button>
          <Button onClick={handleSend} disabled={!canSend} loading={sending}>
            <Send className="h-4 w-4 mr-2" />
            {t('crm.proposal.send', { defaultValue: 'Enviar proposta' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
