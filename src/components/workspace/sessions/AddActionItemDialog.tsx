import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCreateActionItem, useWorkspaceMembers } from '@/hooks/useSessions';
import { notify } from "@/lib/notify";

interface AddActionItemDialogProps {
  workspaceId: string;
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddActionItemDialog({ workspaceId, sessionId, open, onOpenChange }: AddActionItemDialogProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('medium');
  const [ownerId, setOwnerId] = useState('');

  const { data: members } = useWorkspaceMembers(workspaceId);
  const createMutation = useCreateActionItem(workspaceId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      notify.error(t('sessions.pleaseEnterATitle'));
      return;
    }

    try {
      await createMutation.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        due_date: dueDate || undefined,
        priority,
        session_id: sessionId,
        owner_user_id: ownerId || undefined,
      });
      notify.success(t('sessions.actionItemCreated'));
      onOpenChange(false);
      resetForm();
    } catch (error) {
      notify.error(t('sessions.failedToCreateActionItem'));
    }
  };

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDueDate('');
    setPriority('medium');
    setOwnerId('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('actions.addAction', { defaultValue: 'Adicionar Ação' })}</DialogTitle>
          <DialogDescription>
            {t('actions.addActionFromSession', { defaultValue: 'Criar uma ação a partir desta sessão' })}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="action-title">{t('actions.title', { defaultValue: 'Título' })} *</Label>
            <Input
              id="action-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('actions.titlePlaceholder', { defaultValue: 'O que precisa ser feito?' })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="action-description">{t('actions.description', { defaultValue: 'Descrição' })}</Label>
            <Textarea
              id="action-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('actions.descriptionPlaceholder', { defaultValue: 'Detalhes adicionais...' })}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="action-due-date">{t('actions.dueDate', { defaultValue: 'Data Limite' })}</Label>
              <Input
                id="action-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="action-priority">{t('actions.priority', { defaultValue: 'Prioridade' })}</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t('actions.priorityLow', { defaultValue: 'Baixa' })}</SelectItem>
                  <SelectItem value="medium">{t('actions.priorityMedium', { defaultValue: 'Média' })}</SelectItem>
                  <SelectItem value="high">{t('actions.priorityHigh', { defaultValue: 'Alta' })}</SelectItem>
                  <SelectItem value="urgent">{t('actions.priorityUrgent', { defaultValue: 'Urgente' })}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="action-owner">{t('actions.assignTo', { defaultValue: 'Atribuir a' })}</Label>
            <Select value={ownerId} onValueChange={(val) => setOwnerId(val === 'unassigned' ? '' : val)}>
              <SelectTrigger>
                <SelectValue placeholder={t('actions.selectMember', { defaultValue: 'Selecionar membro' })} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">{t('actions.unassigned', { defaultValue: 'Não atribuído' })}</SelectItem>
                {members?.filter(m => m.user_id).map(member => (
                  <SelectItem key={member.user_id} value={member.user_id}>
                    {member.profile?.full_name || member.profile?.email || 'Unknown'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel', { defaultValue: 'Cancelar' })}
            </Button>
            <Button type="submit" disabled={createMutation.isPending} loading={createMutation.isPending}>
              {createMutation.isPending ? t('common.creating', { defaultValue: 'A criar...' }) : t('actions.createAction', { defaultValue: 'Criar Ação' })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
