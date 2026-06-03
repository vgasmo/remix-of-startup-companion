import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateStaffTask } from '@/hooks/useStaffTasks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Clock, FileText, Phone, Users } from 'lucide-react';
import { notify } from "@/lib/notify";

interface CreateWorkspaceTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  startupId?: string;
  assigneeId: string;
}

export function CreateWorkspaceTaskDialog({ open, onOpenChange, workspaceId, startupId, assigneeId }: CreateWorkspaceTaskDialogProps) {
  const { t } = useTranslation();
  const createMutation = useCreateStaffTask();

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    task_type: 'general',
    priority: 'medium',
    due_date: '',
  });

  const TASK_TYPES = [
    { value: 'general', label: t('notes.generalTask'), icon: FileText },
    { value: 'connect_startup', label: t('notes.connectStartup'), icon: Users },
    { value: 'contact_investor', label: t('notes.contactInvestor'), icon: Phone },
    { value: 'follow_up', label: t('notes.followUp'), icon: Clock },
    { value: 'review', label: t('notes.reviewTemplate'), icon: FileText },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      notify.error(t('notes.titleRequired'));
      return;
    }

    try {
      await createMutation.mutateAsync({
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        task_type: formData.task_type,
        priority: formData.priority,
        due_date: formData.due_date || null,
        assignee_id: assigneeId,
        workspace_id: workspaceId,
        related_startup_id: startupId || null,
      });
      notify.success(t('notes.taskCreated'));
      onOpenChange(false);
      setFormData({ title: '', description: '', task_type: 'general', priority: 'medium', due_date: '' });
    } catch {
      notify.error(t('notes.failedToCreate'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('notes.createTask')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">{t('notes.taskTitle')} *</Label>
            <Input id="title" value={formData.title} onChange={(e) => setFormData((p) => ({ ...p, title: e.target.value }))} placeholder={t('notes.taskTitlePlaceholder')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">{t('notes.description')}</Label>
            <Textarea id="description" value={formData.description} onChange={(e) => setFormData((p) => ({ ...p, description: e.target.value }))} placeholder={t('notes.descriptionPlaceholder')} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('notes.taskType')}</Label>
              <Select value={formData.task_type} onValueChange={(v) => setFormData((p) => ({ ...p, task_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map((type) => (<SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('actions.priority')}</Label>
              <Select value={formData.priority} onValueChange={(v) => setFormData((p) => ({ ...p, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t('notes.low')}</SelectItem>
                  <SelectItem value="medium">{t('notes.medium')}</SelectItem>
                  <SelectItem value="high">{t('notes.high')}</SelectItem>
                  <SelectItem value="urgent">{t('notes.urgent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="due_date">{t('notes.dueDate')}</Label>
            <Input id="due_date" type="date" value={formData.due_date} onChange={(e) => setFormData((p) => ({ ...p, due_date: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={createMutation.isPending}>{createMutation.isPending ? t('common.creating') : t('notes.createTask')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
