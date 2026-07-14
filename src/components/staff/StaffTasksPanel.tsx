import { useNavigate } from 'react-router-dom';
import { clickableProps } from '@/lib/clickable';
import { useTranslation } from 'react-i18next';
import { format, isPast, isToday } from 'date-fns';
import { useDateLocale } from '@/lib/dateLocale';
import {
  CheckCircle2,
  Clock,
  Users,
  Phone,
  Building2,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useMyStaffTasks,
  type StaffTask,
} from '@/hooks/useStaffTasks';

const TASK_TYPES = [
  { value: 'general', label: 'General Task', icon: FileText },
  { value: 'connect_startup', label: 'Connect Startup', icon: Users },
  { value: 'contact_investor', label: 'Contact Investor', icon: Phone },
  { value: 'follow_up', label: 'Follow Up', icon: Clock },
  { value: 'review', label: 'Review Template', icon: FileText },
];

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-info/10 text-info',
  high: 'bg-warning/10 text-warning',
  urgent: 'bg-destructive/10 text-destructive',
};

interface StaffTasksPanelProps {
  compact?: boolean;
}

/**
 * Read-only panel for dashboard overview.
 * Shows pending tasks across all startups with navigation to workspace.
 */
export function StaffTasksPanel({ compact = false }: StaffTasksPanelProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const { data: tasks, isLoading } = useMyStaffTasks();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{t('staffTasks.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const pendingTasks = tasks || [];

  return (
    <Card>
      <CardHeader className="py-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            {t('staffTasks.title')}
          </CardTitle>
          {pendingTasks.length > 0 && (
            <Badge variant="secondary" className="text-xs">{pendingTasks.length}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {pendingTasks.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-3 text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 opacity-50" />
            <div>
              <p className="text-sm">{t('staffTasks.noPendingTasks')}</p>
              <p className="text-xs">{t('staffTasks.tasksInWorkspaces')}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {pendingTasks.slice(0, compact ? 5 : 10).map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                onClick={() => {
                  if (task.workspace_id) {
                    navigate(`/workspace/${task.workspace_id}?tab=notes`);
                  }
                }}
              />
            ))}
            {pendingTasks.length > (compact ? 5 : 10) && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                +{pendingTasks.length - (compact ? 5 : 10)} {t('staffTasks.moreTasks')}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TaskItem({
  task,
  onClick,
}: {
  task: StaffTask;
  onClick: () => void;
}) {
  const isOverdue = task.due_date && isPast(new Date(task.due_date)) && !isToday(new Date(task.due_date));
  const isDueToday = task.due_date && isToday(new Date(task.due_date));

  const TaskIcon = TASK_TYPES.find((t) => t.value === task.task_type)?.icon || FileText;
  const startupName = task.workspace?.startup?.name || task.startup?.name;

  return (
    <div 
      className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer group"
      {...clickableProps(onClick)}
    >
      <div className="mt-1 p-1.5 rounded bg-primary/10">
        <TaskIcon className="h-4 w-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate group-hover:text-primary group-hover:underline transition-colors">{task.title}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {task.due_date && (
            <span
              className={`text-xs ${
                isOverdue
                  ? 'text-destructive font-medium'
                  : isDueToday
                  ? 'text-warning font-medium'
                  : 'text-muted-foreground'
              }`}
            >
              {isOverdue ? 'Overdue: ' : isDueToday ? 'Today' : ''}
              {!isDueToday && format(new Date(task.due_date), 'MMM d', { locale: dateLocale })}
            </span>
          )}
          {task.priority && task.priority !== 'medium' && (
            <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[task.priority]}`}>
              {task.priority}
            </Badge>
          )}
          {startupName && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              <Building2 className="h-3 w-3 mr-1" />
              {startupName}
            </Badge>
          )}
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
    </div>
  );
}