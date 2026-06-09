/**
 * RecordDrawer sub-component - TaskRow
 */
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Circle,
  CircleCheck,
  Ban,
  Pencil,
  Save,
} from 'lucide-react';
import { ActivityEntry } from '@/hooks/useActivityTimeline';
import { TaskPriority } from '@/hooks/useCrmTasks';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/dateUtils';

interface TaskRowProps {
  task: ActivityEntry;
  funnelItemId: string;
  consultors: { id: string; full_name: string | null }[];
  onComplete: (clearNextAction: boolean) => void;
  onReopen: () => void;
  onCancel: () => void;
  onUpdate: (updates: { subject?: string; due_at?: string | null; priority?: TaskPriority | null; assigned_to?: string | null }) => void;
  hasWorkspace: boolean;
  nextActionAt?: string | null;
  nextActionDescription?: string | null;
}

export function TaskRow({
  task,
  funnelItemId,
  consultors,
  onComplete,
  onReopen,
  onCancel,
  onUpdate,
  hasWorkspace,
  nextActionAt,
  nextActionDescription,
}: TaskRowProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editSubject, setEditSubject] = useState(task.subject || '');
  const [editDueAt, setEditDueAt] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority | ''>(task.priority || '');
  const [editAssignedTo, setEditAssignedTo] = useState(task.assigned_to || '');
  const [showClearNextAction, setShowClearNextAction] = useState(false);
  const [clearNextActionChecked, setClearNextActionChecked] = useState(true);

  const isOpen = task.status === 'open';
  const isCompleted = task.status === 'done';
  const isCanceled = task.status === 'canceled';
  const isOverdue = task.due_at && new Date(task.due_at) < new Date() && isOpen;

  const matchesNextAction = nextActionAt && task.due_at &&
    Math.abs(new Date(nextActionAt).getTime() - new Date(task.due_at).getTime()) < 60000;

  useEffect(() => {
    if (isEditing && task.due_at) {
      const d = new Date(task.due_at);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      setEditDueAt(`${year}-${month}-${day}T${hours}:${minutes}`);
    }
  }, [isEditing, task.due_at]);

  const handleSave = () => {
    onUpdate({
      subject: editSubject,
      due_at: editDueAt ? new Date(editDueAt).toISOString() : null,
      priority: editPriority || null,
      assigned_to: editAssignedTo || null,
    });
    setIsEditing(false);
  };

  const handleCompleteClick = () => {
    if (matchesNextAction) {
      setShowClearNextAction(true);
    } else {
      onComplete(false);
    }
  };

  const handleConfirmComplete = () => {
    onComplete(clearNextActionChecked);
    setShowClearNextAction(false);
  };

  if (isEditing) {
    return (
      <div className="p-3 space-y-3 bg-muted/30">
        <div className="space-y-2">
          <Label className="text-xs">{t('crm.title')}</Label>
          <Input
            value={editSubject}
            onChange={(e) => setEditSubject(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">{t('crm.dueDate')}</Label>
            <Input
              type="datetime-local"
              value={editDueAt}
              onChange={(e) => setEditDueAt(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('crm.priority')}</Label>
            <Select value={editPriority} onValueChange={(v) => setEditPriority(v as TaskPriority | '')}>
              <SelectTrigger className="h-8 text-sm">
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
        {consultors.length > 0 && (
          <div className="space-y-1">
            <Label className="text-xs">{t('crm.assignedTo')}</Label>
            <Select value={editAssignedTo} onValueChange={setEditAssignedTo}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="-" />
              </SelectTrigger>
              <SelectContent>
                {consultors.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.full_name || 'Unnamed'}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="flex gap-2">
          <Button size="sm" className="h-7 text-xs" onClick={handleSave}>
            <Save className="h-3 w-3 mr-1" />
            {t('common.save')}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setIsEditing(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  if (showClearNextAction) {
    return (
      <div className="p-3 space-y-3 bg-muted/30">
        <p className="text-sm">{t('crm.taskCompleted')}</p>
        <div className="flex items-center space-x-2">
          <Checkbox
            id={`clear-next-${task.id}`}
            checked={clearNextActionChecked}
            onCheckedChange={(checked) => setClearNextActionChecked(!!checked)}
          />
          <Label htmlFor={`clear-next-${task.id}`} className="text-sm font-normal cursor-pointer">
            {t('crm.clearNextActionAlso')}
          </Label>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="h-7 text-xs" onClick={handleConfirmComplete}>
            {t('common.confirm')}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowClearNextAction(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 p-3 hover:bg-muted/50 group">
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 shrink-0"
        onClick={isCompleted ? onReopen : isCanceled ? onReopen : handleCompleteClick}
      >
        {isCompleted ? (
          <CircleCheck className="h-4 w-4 text-[hsl(var(--success))]" />
        ) : isCanceled ? (
          <Ban className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Circle className="h-4 w-4 text-muted-foreground" />
        )}
      </Button>
      <div className="min-w-0 flex-1">
        <p className={cn(
          'text-sm font-medium truncate',
          (isCompleted || isCanceled) && 'line-through text-muted-foreground'
        )}>
          {task.subject}
        </p>
        {task.due_at && (
          <p className={cn(
            'text-xs',
            isOverdue ? 'text-[hsl(var(--warning))]' : 'text-muted-foreground'
          )}>
            {formatRelativeTime(task.due_at)}
          </p>
        )}
      </div>
      {task.priority && (
        <Badge
          variant="outline"
          className={cn(
            'text-xs shrink-0',
            task.priority === 'high' && 'border-[hsl(var(--warning))]/30 text-[hsl(var(--warning))]',
            task.priority === 'medium' && 'border-[hsl(var(--warning))]/60 text-[hsl(var(--warning))]',
          )}
        >
          {t(`crm.${task.priority}`)}
        </Badge>
      )}
      {task.visibility === 'shared' && (
        <Badge variant="secondary" className="text-[10px] shrink-0">
          {t('crm.shared')}
        </Badge>
      )}
      {isOpen && (
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setIsEditing(true)}
            title={t('common.edit')}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
            onClick={onCancel}
            title={t('crm.cancelTask')}
          >
            <Ban className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
