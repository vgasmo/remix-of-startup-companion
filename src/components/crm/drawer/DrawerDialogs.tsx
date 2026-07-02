/**
 * RecordDrawer sub-components - Dialogs (AddActivity, AddTask, NextAction)
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ActivityType } from '@/hooks/useActivityTimeline';
import { TaskPriority } from '@/hooks/useCrmTasks';

// ─── Add Activity Dialog ───
interface AddActivityDialogProps {
  type: ActivityType | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (type: ActivityType, data: { subject: string; preview: string; shareWithFounder?: boolean }) => void;
  isPending: boolean;
  hasWorkspace: boolean;
}

export function AddActivityDialog({
  type,
  open,
  onOpenChange,
  onSubmit,
  isPending,
  hasWorkspace,
}: AddActivityDialogProps) {
  const { t } = useTranslation();
  const [subject, setSubject] = useState('');
  const [preview, setPreview] = useState('');
  const [shareWithFounder, setShareWithFounder] = useState(false);

  const handleSubmit = () => {
    if (!type || !subject.trim()) return;
    onSubmit(type, { subject, preview, shareWithFounder });
    setSubject('');
    setPreview('');
    setShareWithFounder(false);
  };

  const titles: Record<ActivityType, string> = {
    note: t('crm.addNote'),
    call: t('crm.logCall'),
    meeting: t('crm.logMeeting'),
    task: t('crm.addTask'),
    email: t('crm.logEmail'),
    system: t('crm.system'),
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{type ? titles[type] : ''}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('crm.title')}</Label>
            <Input
              placeholder={t('crm.titlePlaceholder')}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('crm.details')}</Label>
            <Textarea
              placeholder={t('crm.detailsPlaceholder')}
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
              rows={3}
            />
          </div>
          {hasWorkspace && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="share"
                checked={shareWithFounder}
                onCheckedChange={(checked) => setShareWithFounder(!!checked)}
              />
              <Label htmlFor="share" className="text-sm font-normal cursor-pointer">
                {t('crm.shareWithFounder')}
              </Label>
            </div>
          )}
          <Button onClick={handleSubmit} disabled={isPending || !subject.trim()} loading={isPending} className="w-full">
            {isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Task Dialog ───
interface AddTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    subject: string;
    preview?: string;
    due_at?: string;
    priority?: TaskPriority;
    shareWithFounder?: boolean;
  }) => void;
  isPending: boolean;
  hasWorkspace: boolean;
}

export function AddTaskDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  hasWorkspace,
}: AddTaskDialogProps) {
  const { t } = useTranslation();
  const [subject, setSubject] = useState('');
  const [preview, setPreview] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [shareWithFounder, setShareWithFounder] = useState(false);

  const handleSubmit = () => {
    if (!subject.trim()) return;
    onSubmit({
      subject,
      preview: preview || undefined,
      due_at: dueDate ? new Date(dueDate).toISOString() : undefined,
      priority: priority || undefined,
      shareWithFounder,
    });
    setSubject('');
    setPreview('');
    setDueDate('');
    setPriority('');
    setShareWithFounder(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('crm.addTask')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('crm.title')}</Label>
            <Input
              placeholder={t('crm.titlePlaceholder')}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('crm.details')}</Label>
            <Textarea
              placeholder={t('crm.detailsPlaceholder')}
              value={preview}
              onChange={(e) => setPreview(e.target.value)}
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{t('crm.dueDate')}</Label>
              <Input
                type="datetime-local"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('crm.priority')}</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority | '')}>
                <SelectTrigger>
                  <SelectValue placeholder="-" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t('crm.low')}</SelectItem>
                  <SelectItem value="medium">{t('crm.medium')}</SelectItem>
                  <SelectItem value="high">{t('crm.high')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {hasWorkspace && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="share-task"
                checked={shareWithFounder}
                onCheckedChange={(checked) => setShareWithFounder(!!checked)}
              />
              <Label htmlFor="share-task" className="text-sm font-normal cursor-pointer">
                {t('crm.shareWithFounder')}
              </Label>
            </div>
          )}
          <Button onClick={handleSubmit} disabled={isPending || !subject.trim()} loading={isPending} className="w-full">
            {isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Next Action Dialog ───
interface NextActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { date: string; description: string }) => void;
  isPending: boolean;
  currentDate?: string | null;
  currentDescription?: string | null;
}

export function NextActionDialog({
  open,
  onOpenChange,
  onSubmit,
  isPending,
  currentDate,
  currentDescription,
}: NextActionDialogProps) {
  const { t } = useTranslation();
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (open) {
      if (currentDate) {
        const d = new Date(currentDate);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        setDate(`${year}-${month}-${day}T${hours}:${minutes}`);
      } else {
        setDate('');
      }
      setDescription(currentDescription || '');
    }
  }, [open, currentDate, currentDescription]);

  const handleSubmit = () => {
    if (!date) return;
    onSubmit({
      date: new Date(date).toISOString(),
      description,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('crm.setNextAction')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>{t('crm.nextActionDate')}</Label>
            <Input
              type="datetime-local"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>{t('crm.nextActionDescription')}</Label>
            <Textarea
              placeholder={t('crm.detailsPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <Button onClick={handleSubmit} disabled={isPending || !date} loading={isPending} className="w-full">
            {isPending ? t('common.saving') : t('common.save')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
