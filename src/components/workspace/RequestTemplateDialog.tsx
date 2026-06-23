import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sparkles } from 'lucide-react';
import { notify } from '@/lib/notify';
import { useCreateTemplateRequest, type CreateTemplateRequestInput } from '@/hooks/useTemplateRequests';

interface RequestTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId?: string | null;
  contextType?: CreateTemplateRequestInput['context_type'];
  contextRef?: string | null;
  contextLabel?: string | null;
  defaultTitle?: string;
}

export function RequestTemplateDialog({
  open, onOpenChange, workspaceId, contextType = 'general', contextRef, contextLabel, defaultTitle = '',
}: RequestTemplateDialogProps) {
  const { t } = useTranslation();
  const create = useCreateTemplateRequest();
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState('');

  const reset = () => { setTitle(defaultTitle); setDescription(''); };

  const submit = async () => {
    if (!title.trim()) {
      notify.error(t('templateRequests.titleRequired', { defaultValue: 'Indique um título para o pedido' }));
      return;
    }
    try {
      await create.mutateAsync({
        workspace_id: workspaceId ?? null,
        context_type: contextType,
        context_ref: contextRef ?? null,
        context_label: contextLabel ?? null,
        title: title.trim(),
        description: description.trim() || null,
      });
      notify.success(t('templateRequests.submitted', { defaultValue: 'Pedido enviado. A equipa será notificada.' }));
      reset();
      onOpenChange(false);
    } catch {
      notify.error(t('templateRequests.submitFailed', { defaultValue: 'Não foi possível enviar o pedido' }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            {t('templateRequests.dialogTitle', { defaultValue: 'Solicitar template' })}
          </DialogTitle>
          <DialogDescription>
            {t('templateRequests.dialogDescription', {
              defaultValue: 'Não encontrou um template adequado? Descreva o que precisa e a equipa cria ou aprova um modelo para si.',
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {contextLabel && (
            <div className="text-xs text-muted-foreground">
              {t('templateRequests.relatedTo', { defaultValue: 'Relacionado com' })}: <span className="font-medium text-foreground">{contextLabel}</span>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="tr-title" className="text-xs">{t('templateRequests.titleLabel', { defaultValue: 'Título do pedido' })} *</Label>
            <Input
              id="tr-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('templateRequests.titlePlaceholder', { defaultValue: 'Ex: Template de plano de marketing' }) as string}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tr-desc" className="text-xs">{t('templateRequests.descriptionLabel', { defaultValue: 'Descrição (opcional)' })}</Label>
            <Textarea
              id="tr-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('templateRequests.descriptionPlaceholder', { defaultValue: 'Que campos ou secções deve incluir? Para que vai ser usado?' }) as string}
              rows={4}
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            {t('templateRequests.trackHint', { defaultValue: 'Vai conseguir acompanhar o estado em Documentos → Pedidos de template.' })}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={submit} disabled={create.isPending}>
            {create.isPending ? t('common.saving', { defaultValue: 'A enviar...' }) : t('templateRequests.submit', { defaultValue: 'Enviar pedido' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
