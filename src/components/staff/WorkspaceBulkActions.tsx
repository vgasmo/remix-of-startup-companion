/**
 * Bulk Operations for Workspaces
 * P0.5: Multi-select and batch operations for 180+ startups
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Check,
  X,
  Tag,
  UserPlus,
  ClipboardList,
  Bell,
  Flag,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notify } from "@/lib/notify";
import { supabase } from '@/lib/supabaseClient';
import { WorkspacePriority } from '@/types/database';
import { cn } from '@/lib/utils';

interface WorkspaceBulkActionsProps {
  selectedIds: Set<string>;
  onDeselectAll: () => void;
  onSelectAll: () => void;
  totalCount: number;
  onActionComplete?: () => void;
}

export function WorkspaceBulkActionsBar({
  selectedIds,
  onDeselectAll,
  onSelectAll,
  totalCount,
  onActionComplete,
}: WorkspaceBulkActionsProps) {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(false);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDescription, setTaskDescription] = useState('');

  const selectedCount = selectedIds.size;
  const allSelected = totalCount > 0 && selectedIds.size === totalCount;

  // Bulk update priority
  const handleSetPriority = async (priority: WorkspacePriority) => {
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('workspaces')
        .update({ priority_level: priority })
        .in('id', Array.from(selectedIds));

      if (error) throw error;
      notify.success(t('staff.prioritySetToPriorityFor', { selectedCount: selectedCount }));
      onDeselectAll();
      onActionComplete?.();
    } catch (error) {
      notify.error(t('staff.failedToUpdatePriority'));
    } finally {
      setIsLoading(false);
    }
  };

  // Bulk request check-in (creates checkin instances)
  const handleRequestCheckin = async () => {
    setIsLoading(true);
    try {
      // For each workspace, try to generate a checkin instance
      const { data, error } = await supabase.rpc('generate_weekly_checkins');
      if (error) throw error;
      
      notify.success(`Check-in requests processed`);
      onDeselectAll();
      onActionComplete?.();
    } catch (error) {
      notify.error(t('staff.failedToRequestCheckins'));
    } finally {
      setIsLoading(false);
    }
  };

  // Bulk create staff task
  const handleCreateBulkTask = async () => {
    if (!taskTitle.trim()) {
      notify.error(t('staff.taskTitleIsRequired'));
      return;
    }

    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Create a task for each selected workspace
      const tasks = Array.from(selectedIds).map(workspaceId => ({
        workspace_id: workspaceId,
        title: taskTitle,
        description: taskDescription || null,
        type: 'outreach',
        priority: 'medium',
        status: 'open',
        created_by: user?.id,
      }));

      const { error } = await supabase
        .from('staff_work_queue_items')
        .insert(tasks);

      if (error) throw error;
      
      notify.success(t('staff.created', { selectedCount: selectedCount }));
      setShowTaskDialog(false);
      setTaskTitle('');
      setTaskDescription('');
      onDeselectAll();
      onActionComplete?.();
    } catch (error) {
      notify.error(t('staff.failedToCreateTasks'));
    } finally {
      setIsLoading(false);
    }
  };

  if (selectedCount === 0) return null;

  return (
    <>
      <div className={cn(
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-50',
        'bg-background border shadow-lg rounded-lg px-4 py-3',
        'flex items-center gap-4 animate-fade-in'
      )}>
        <div className="flex items-center gap-2">
          <Checkbox
            checked={allSelected}
            onCheckedChange={() => allSelected ? onDeselectAll() : onSelectAll()}
          />
          <Badge variant="secondary">
            {selectedCount} selected
          </Badge>
        </div>

        <div className="h-6 w-px bg-border" />

        {/* Priority dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isLoading}>
              <Flag className="h-4 w-4 mr-1" />
              Priority
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => handleSetPriority('star')}>
              <span className="w-2 h-2 rounded-full bg-warning mr-2" />
              Star
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSetPriority('high')}>
              <span className="w-2 h-2 rounded-full bg-warning mr-2" />
              High
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSetPriority('standard')}>
              <span className="w-2 h-2 rounded-full bg-info mr-2" />
              Standard
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleSetPriority('maintenance')}>
              <span className="w-2 h-2 rounded-full bg-muted-foreground mr-2" />
              Maintenance
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Request check-in */}
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRequestCheckin}
          disabled={isLoading}
        >
          <Bell className="h-4 w-4 mr-1" />
          Request Check-in
        </Button>

        {/* Create task */}
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => setShowTaskDialog(true)}
          disabled={isLoading}
        >
          <ClipboardList className="h-4 w-4 mr-1" />
          Create Task
        </Button>

        {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}

        <Button 
          variant="ghost" 
          size="icon" 
          className="h-8 w-8"
          onClick={onDeselectAll}
         aria-label={t('common.close')}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Create Task Dialog */}
      <Dialog open={showTaskDialog} onOpenChange={setShowTaskDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('bulkActions.createTaskTitle', { count: selectedCount, defaultValue: `Create Staff Task for ${selectedCount} Startups` })}</DialogTitle>
            <DialogDescription>
              {t('bulkActions.createTaskDesc', 'This will create a work queue item for each selected startup.')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('bulkActions.taskTitle', 'Task Title')}</Label>
              <Input
                placeholder="e.g., Follow up on progress"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
              />
            </div>
            <div>
              <Label>{t('bulkActions.descriptionOptional', 'Description (optional)')}</Label>
              <Input
                placeholder={t("common.placeholders.additionalDetails")}
                value={taskDescription}
                onChange={(e) => setTaskDescription(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTaskDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateBulkTask} disabled={isLoading}>
              {isLoading ? 'Creating...' : `Create ${selectedCount} Tasks`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Hook for managing workspace bulk selection
export function useWorkspaceBulkSelection(workspaceIds: string[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleItem = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(workspaceIds));
  }, [workspaceIds]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isSelected = useCallback((id: string) => {
    return selectedIds.has(id);
  }, [selectedIds]);

  return {
    selectedIds,
    toggleItem,
    selectAll,
    deselectAll,
    isSelected,
    selectedCount: selectedIds.size,
  };
}
