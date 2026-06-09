import { useTranslation } from 'react-i18next';
import { format, isPast, isToday } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { CheckCircle2, Clock, FileText, MoreVertical, Phone, Trash2, Users } from 'lucide-react';
import type { StaffTask } from '@/hooks/useStaffTasks';

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] ',
  high: 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] ',
  urgent: 'bg-destructive/10 text-destructive ',
};

interface TaskItemProps {
  task: StaffTask;
  canManage: boolean;
  onComplete: () => void;
  onDelete: () => void;
  isCompleted?: boolean;
}

export function TaskItem({ task, canManage, onComplete, onDelete, isCompleted = false }: TaskItemProps) {
  const { t } = useTranslation();
  const isOverdue = task.due_date && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date)) && !isCompleted;
  const isDueToday = task.due_date && isToday(new Date(task.due_date));

  const TASK_TYPES: Record<string, { label: string; icon: typeof FileText }> = {
    general: { label: t('notes.generalTask'), icon: FileText },
    connect_startup: { label: t('notes.connectStartup'), icon: Users },
    contact_investor: { label: t('notes.contactInvestor'), icon: Phone },
    follow_up: { label: t('notes.followUp'), icon: Clock },
    review: { label: t('notes.reviewTemplate'), icon: FileText },
  };

  const TaskIcon = TASK_TYPES[task.task_type]?.icon || FileText;

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors group ${isCompleted ? 'opacity-60' : ''}`}>
      <Checkbox
        checked={isCompleted}
        onCheckedChange={() => !isCompleted && onComplete()}
        className="mt-1"
        disabled={isCompleted || !canManage}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <TaskIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <p className={`font-medium text-sm truncate ${isCompleted ? 'line-through' : ''}`}>{task.title}</p>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {task.due_date && (
            <span
              className={`text-xs ${
                isOverdue
                  ? 'text-destructive font-medium'
                  : isDueToday
                  ? 'text-[hsl(var(--warning))] font-medium'
                  : 'text-muted-foreground'
              }`}
            >
              {isOverdue ? `${t('common.overdue')}: ` : isDueToday ? t('common.today') : ''}
              {!isDueToday && format(new Date(task.due_date), 'MMM d')}
            </span>
          )}
          {task.priority && task.priority !== 'medium' && (
            <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[task.priority]}`}>
              {t(`notes.${task.priority}`)}
            </Badge>
          )}
          {task.assignee && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Avatar className="h-4 w-4">
                <AvatarImage src={task.assignee.avatar_url || undefined} />
                <AvatarFallback className="text-[8px]">
                  {task.assignee.full_name?.[0] || task.assignee.email?.[0]}
                </AvatarFallback>
              </Avatar>
              {task.assignee.full_name || task.assignee.email}
            </span>
          )}
        </div>
      </div>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label={t('common.moreActions', { defaultValue: 'More actions' })}
            >
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!isCompleted && (
              <DropdownMenuItem onClick={onComplete}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {t('notes.markComplete')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4 mr-2" />
              {t('common.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
