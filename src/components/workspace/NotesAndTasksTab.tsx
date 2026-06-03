import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useWorkspaceStaffTasks,
  useCompleteStaffTask,
  useDeleteStaffTask,
  type StaffTask,
} from '@/hooks/useStaffTasks';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { MessageSquare, Plus, CheckCircle2, Sparkles } from 'lucide-react';
import { notify } from "@/lib/notify";
import { useAuth } from '@/contexts/AuthContext';
import { TaskItem } from './notes/TaskItem';
import { CreateWorkspaceTaskDialog } from './notes/CreateWorkspaceTaskDialog';
import { SessionInsightsSection } from './notes/SessionInsightsSection';
import { NotesSection } from './notes/NotesSection';

interface NotesAndTasksTabProps {
  workspaceId: string;
  startupId?: string;
}

export function NotesAndTasksTab({ workspaceId, startupId }: NotesAndTasksTabProps) {
  const { t } = useTranslation();
  const { isConsultor, isAdmin, isMentor, user } = useAuth();
  const canManage = isConsultor || isAdmin || isMentor;

  return (
    <Tabs defaultValue="tasks" className="space-y-4">
      <TabsList>
        <TabsTrigger value="tasks" className="gap-2">
          <CheckCircle2 className="h-4 w-4" />
          {t('notes.tasks')}
        </TabsTrigger>
        <TabsTrigger value="insights" className="gap-2">
          <Sparkles className="h-4 w-4" />
          {t('notes.sessionInsights', { defaultValue: 'Session Insights' })}
        </TabsTrigger>
        <TabsTrigger value="notes" className="gap-2">
          <MessageSquare className="h-4 w-4" />
          {t('notes.notes')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="tasks">
        <TasksSection
          workspaceId={workspaceId}
          startupId={startupId}
          canManage={canManage}
          userId={user?.id}
        />
      </TabsContent>

      <TabsContent value="insights">
        <SessionInsightsSection
          workspaceId={workspaceId}
          startupId={startupId}
          canManage={canManage}
          userId={user?.id}
        />
      </TabsContent>

      <TabsContent value="notes">
        <NotesSection workspaceId={workspaceId} canManage={canManage} />
      </TabsContent>
    </Tabs>
  );
}

// Tasks Section — kept inline since it's tightly coupled with the tab
function TasksSection({
  workspaceId,
  startupId,
  canManage,
  userId,
}: {
  workspaceId: string;
  startupId?: string;
  canManage: boolean;
  userId?: string;
}) {
  const { t } = useTranslation();
  const { data: tasks, isLoading } = useWorkspaceStaffTasks(workspaceId);
  const completeMutation = useCompleteStaffTask();
  const deleteMutation = useDeleteStaffTask();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);

  const pendingTasks = tasks?.filter(t => t.status !== 'completed') || [];
  const completedTasks = tasks?.filter(t => t.status === 'completed') || [];

  const handleComplete = async (task: StaffTask) => {
    try {
      await completeMutation.mutateAsync(task.id);
      notify.success(t('notes.taskCompleted'));
    } catch {
      notify.error(t('notes.failedToComplete'));
    }
  };

  const handleDelete = async () => {
    if (!deleteTaskId) return;
    try {
      await deleteMutation.mutateAsync(deleteTaskId);
      notify.success(t('notes.taskDeleted'));
      setDeleteTaskId(null);
    } catch {
      notify.error(t('notes.failedToDelete'));
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (<Skeleton key={i} className="h-16" />))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              {t('notes.tasksForStartup')}
            </CardTitle>
            {canManage && (
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-1" />
                {t('notes.addTask')}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {pendingTasks.length === 0 && completedTasks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t('notes.noTasksYet')}</p>
              {canManage && <p className="text-sm">{t('notes.createTaskToStart')}</p>}
            </div>
          ) : (
            <div className="space-y-4">
              {pendingTasks.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">{t('notes.pending')} ({pendingTasks.length})</h4>
                  {pendingTasks.map((task) => (
                    <TaskItem key={task.id} task={task} canManage={canManage} onComplete={() => handleComplete(task)} onDelete={() => setDeleteTaskId(task.id)} />
                  ))}
                </div>
              )}
              {completedTasks.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">{t('notes.completed')} ({completedTasks.length})</h4>
                  {completedTasks.slice(0, 5).map((task) => (
                    <TaskItem key={task.id} task={task} canManage={canManage} onComplete={() => {}} onDelete={() => setDeleteTaskId(task.id)} isCompleted />
                  ))}
                  {completedTasks.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center">{t('notes.moreCompleted', { count: completedTasks.length - 5 })}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && userId && (
        <CreateWorkspaceTaskDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} workspaceId={workspaceId} startupId={startupId} assigneeId={userId} />
      )}

      <AlertDialog open={!!deleteTaskId} onOpenChange={() => setDeleteTaskId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('notes.deleteTask')}</AlertDialogTitle>
            <AlertDialogDescription>{t('notes.deleteTaskConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
