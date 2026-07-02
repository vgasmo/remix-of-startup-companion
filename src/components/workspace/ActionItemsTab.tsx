import { useState, useMemo, useCallback, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { format, isPast, isToday, parseISO } from 'date-fns';
import { Plus, AlertTriangle, Calendar, User, Trash2, GripVertical, Target, ChevronDown, ChevronRight, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/EmptyState';
import { useActionItems, useUpdateActionItem, useDeleteActionItem, useCreateActionItemFull, useBulkUpdateActions, useBulkDeleteActions, type ActionItem } from '@/hooks/useActionItems';
import { useMilestones, type Milestone } from '@/hooks/useMilestones';
import { useWorkspaceMembers } from '@/hooks/useSessions';
import { useWorkspaceFounder } from '@/hooks/useWorkspaceMembers';
import { useActionDeliverablesBatch, useCreateActionDeliverable, useCompleteActionDeliverable } from '@/hooks/useActionDeliverables';
import { useTemplateInstances, useTemplates } from '@/hooks/useTemplates';
import { BulkActionsBar, useBulkSelection } from '@/components/ui/BulkActionsBar';
import { useExportActions, exportActionsToCsv } from '@/hooks/useExportData';
import { ActionItemCard, type PlatformDocument } from './actions/ActionItemCard';
import { buildPlatformDocumentOptions } from '@/lib/platformDocuments';
import { MilestoneActionGroup } from './actions/MilestoneActionGroup';
import { KanbanColumn } from './actions/KanbanColumn';
import { notify } from "@/lib/notify";
import type { Database } from '@/integrations/supabase/types';

type ActionStatus = Database['public']['Enums']['action_status'];

interface ActionItemsTabProps {
  workspaceId: string;
  canWrite: boolean;
}

// STATUS_CONFIG and PRIORITY_CONFIG moved to ./actions/ActionItemCard.tsx

export function ActionItemsTab({ workspaceId, canWrite }: ActionItemsTabProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: actionItems, isLoading, error } = useActionItems(workspaceId);
  const { data: milestones, isLoading: milestonesLoading } = useMilestones(workspaceId);
  const { data: members } = useWorkspaceMembers(workspaceId);
  const { founderId } = useWorkspaceFounder(workspaceId);
  const actionIds = useMemo(() => (actionItems || []).map(a => a.id), [actionItems]);
  const { data: deliverablesByAction } = useActionDeliverablesBatch(actionIds);
  const createDeliverable = useCreateActionDeliverable(workspaceId);
  const completeDeliverable = useCompleteActionDeliverable(workspaceId);
  const { data: templateInstances } = useTemplateInstances(workspaceId);
  const { data: globalTemplates } = useTemplates();
  const platformDocuments = useMemo<PlatformDocument[]>(() => {
    return buildPlatformDocumentOptions(workspaceId, templateInstances || [], globalTemplates || []);
  }, [workspaceId, templateInstances, globalTemplates]);
  const updateAction = useUpdateActionItem(workspaceId);
  const deleteAction = useDeleteActionItem(workspaceId);
  const createAction = useCreateActionItemFull(workspaceId);
  const bulkUpdate = useBulkUpdateActions(workspaceId);
  const bulkDelete = useBulkDeleteActions(workspaceId);
  const { refetch: fetchExportData } = useExportActions(workspaceId);

  const [filters, setFilters] = useState({
    owner: 'all',
    overdue: false,
    priority: 'all',
  });
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(new Set());
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedMilestoneForCreate, setSelectedMilestoneForCreate] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<ActionItem | null>(null);
  const [newAction, setNewAction] = useState(() => ({
    title: '',
    description: '',
    due_date: '',
    priority: 'medium',
    owner_user_id: '',
    milestone_id: '',
  }));

  // Bulk selection
  const { selectedIds, toggleItem, selectAll, deselectAll, isSelected } = useBulkSelection(
    actionItems || [],
    (item) => item.id
  );

  const handleBulkStatusChange = async (ids: string[], status: string) => {
    try {
      await bulkUpdate.mutateAsync({ ids, status: status as ActionStatus });
      notify.success(t('actions.updatedCount', { count: ids.length }));
      deselectAll();
    } catch {
      notify.error(t('actions.failedToUpdate'));
    }
  };

  const handleBulkDelete = async (ids: string[]) => {
    try {
      await bulkDelete.mutateAsync(ids);
      notify.success(t('actions.deletedCount', { count: ids.length }));
      deselectAll();
    } catch {
      notify.error(t('actions.failedToDelete'));
    }
  };

  const handleExport = async () => {
    const { data } = await fetchExportData();
    if (data && data.length > 0) {
      exportActionsToCsv(data, `actions-${workspaceId}`);
      notify.success(t('sessions.exportedSuccess'));
    } else {
      notify.error(t('sessions.noDataToExport'));
    }
  };

  const handleStatusChange = useCallback(async (item: ActionItem, newStatus: ActionStatus) => {
    if (!canWrite) return;
    try {
      await updateAction.mutateAsync({ id: item.id, status: newStatus });
    } catch {
      notify.error(t('actions.failedToUpdate'));
    }
  }, [canWrite, updateAction, t]);

  const handleDueDateChange = useCallback(async (item: ActionItem, date: Date | undefined) => {
    if (!canWrite) return;
    try {
      await updateAction.mutateAsync({ 
        id: item.id, 
        due_date: date ? format(date, 'yyyy-MM-dd') : null 
      });
    } catch {
      notify.error(t('actions.failedToUpdate'));
    }
  }, [canWrite, updateAction, t]);

  const handleOwnerChange = useCallback(async (item: ActionItem, ownerId: string) => {
    if (!canWrite) return;
    try {
      await updateAction.mutateAsync({ 
        id: item.id, 
        owner_user_id: ownerId === 'none' ? null : ownerId 
      });
    } catch {
      notify.error(t('actions.failedToUpdate'));
    }
  }, [canWrite, updateAction, t]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteTarget || !canWrite) return;
    try {
      await deleteAction.mutateAsync(deleteTarget.id);
      notify.success(t('actions.actionDeleted'));
      setDeleteTarget(null);
    } catch {
      notify.error(t('actions.failedToDelete'));
    }
  }, [deleteTarget, canWrite, deleteAction, t]);

  const handleAddDeliverable = useCallback(async (actionId: string, deliverable: { title: string; type: string; external_url?: string; document_id?: string }) => {
    try {
      const fallbackUrl = workspaceId ? `/workspace/${workspaceId}?tab=documents` : null;
      const externalUrl = deliverable.external_url || fallbackUrl;
      const documentId = deliverable.document_id && /^[0-9a-f-]{36}$/i.test(deliverable.document_id) ? deliverable.document_id : null;
      if (!externalUrl && !documentId) {
        notify.error(t('actions.failedToAddDeliverable', 'Erro ao adicionar entregável'));
        return;
      }
      await createDeliverable.mutateAsync({
        action_id: actionId,
        title: deliverable.title,
        type: deliverable.type,
        external_url: externalUrl,
        document_id: documentId,
      });
      notify.success(t('actions.deliverableAdded', 'Entregável adicionado'));
    } catch (err: any) {
      console.error('[handleAddDeliverable] failed', err);
      notify.error(err?.message || t('actions.failedToAddDeliverable', 'Erro ao adicionar entregável'));
    }
  }, [createDeliverable, t, workspaceId]);

  const handleCompleteDeliverable = useCallback(async (id: string, actionId: string) => {
    try {
      await completeDeliverable.mutateAsync({ id, actionId });
      notify.success(t('actions.deliverableCompleted', 'Entregável validado'));
    } catch { notify.error(t('actions.failedToCompleteDeliverable', 'Erro ao validar entregável')); }
  }, [completeDeliverable, t]);

  const handleCreate = async () => {
    if (!newAction.title.trim()) {
      notify.error(t('actions.titleRequired'));
      return;
    }
    if (!newAction.milestone_id) {
      notify.error(t('actions.selectMilestoneRequired'));
      return;
    }
    try {
      await createAction.mutateAsync({
        title: newAction.title,
        description: newAction.description || undefined,
        due_date: newAction.due_date || null,
        priority: newAction.priority,
        owner_user_id: newAction.owner_user_id || null,
        milestone_id: newAction.milestone_id,
      });
      notify.success(t('actions.actionCreated'));
      setCreateDialogOpen(false);
      setNewAction({ title: '', description: '', due_date: '', priority: 'medium', owner_user_id: '', milestone_id: '' });
    } catch {
      notify.error(t('actions.failedToCreate'));
    }
  };

  const openCreateDialogForMilestone = (milestoneId: string) => {
    // Auto-assign founder as default owner
    setNewAction(prev => ({ 
      ...prev, 
      milestone_id: milestoneId,
      owner_user_id: founderId || '', 
    }));
    setCreateDialogOpen(true);
  };

  // Also set founder as default when opening create dialog without milestone
  const handleOpenCreateDialog = () => {
    setNewAction(prev => ({
      ...prev,
      owner_user_id: founderId || '',
    }));
    setCreateDialogOpen(true);
  };

  // Group actions by milestone
  const actionsByMilestone = useMemo(() => {
    const grouped = new Map<string, ActionItem[]>();
    const unassigned: ActionItem[] = [];
    
    (actionItems || []).forEach(item => {
      let passesFilters = true;
      
      if (filters.owner !== 'all' && item.owner_user_id !== filters.owner) {
        passesFilters = false;
      }
      if (filters.priority !== 'all' && item.priority !== filters.priority) {
        passesFilters = false;
      }
      if (filters.overdue) {
        const isOverdue = item.due_date && 
          isPast(parseISO(item.due_date)) && 
          !isToday(parseISO(item.due_date)) &&
          item.status !== 'completed';
        if (!isOverdue) passesFilters = false;
      }
      
      if (!passesFilters) return;
      
      if (item.milestone_id) {
        const existing = grouped.get(item.milestone_id) || [];
        existing.push(item);
        grouped.set(item.milestone_id, existing);
      } else {
        unassigned.push(item);
      }
    });
    
    return { grouped, unassigned };
  }, [actionItems, filters]);

  const toggleMilestoneExpanded = (milestoneId: string) => {
    setExpandedMilestones(prev => {
      const newSet = new Set(prev);
      if (newSet.has(milestoneId)) {
        newSet.delete(milestoneId);
      } else {
        newSet.add(milestoneId);
      }
      return newSet;
    });
  };

  if (isLoading || milestonesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardContent className="py-8 text-center text-destructive">
          {t('actions.failedToLoad')}
        </CardContent>
      </Card>
    );
  }

  const totalActions = actionItems?.length || 0;
  const completedActions = actionItems?.filter(a => a.status === 'completed').length || 0;

  return (
    <div className="space-y-4">
      {/* Compact Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted/20 rounded-lg border border-border/50">
        {canWrite && milestones && milestones.length > 0 && (
          <Button size="sm" className="h-7 text-xs" onClick={handleOpenCreateDialog}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            {t('actions.addAction')}
          </Button>
        )}
        
        <div className="h-5 w-px bg-border/60" />
        
        <Select value={filters.owner} onValueChange={v => setFilters(f => ({ ...f, owner: v }))}>
          <SelectTrigger className="w-[130px] h-7 text-xs border-border/50">
            <User className="h-3 w-3 mr-1 text-muted-foreground" />
            <SelectValue placeholder={t('actions.owner')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('actions.allOwners')}</SelectItem>
            {members?.map(m => (
              <SelectItem key={m.user_id} value={m.user_id}>
                {m.profile?.full_name || m.profile?.email || t('common.unknown')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.priority} onValueChange={v => setFilters(f => ({ ...f, priority: v }))}>
          <SelectTrigger className="w-[110px] h-7 text-xs border-border/50">
            <SelectValue placeholder={t('actions.priority')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('actions.allPriorities')}</SelectItem>
            <SelectItem value="high">{t('actions.high')}</SelectItem>
            <SelectItem value="medium">{t('actions.medium')}</SelectItem>
            <SelectItem value="low">{t('actions.low')}</SelectItem>
          </SelectContent>
        </Select>

        <Button 
          variant={filters.overdue ? "secondary" : "ghost"} 
          size="sm"
          className="h-7 text-xs px-2"
          onClick={() => setFilters(f => ({ ...f, overdue: !f.overdue }))}
        >
          <AlertTriangle className="h-3 w-3 mr-1" />
          {t('actions.overdue')}
        </Button>

        {(filters.owner !== 'all' || filters.priority !== 'all' || filters.overdue) && (
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs text-muted-foreground px-2"
            onClick={() => setFilters({ owner: 'all', overdue: false, priority: 'all' })}
          >
            ✕ {t('actions.clearFilters')}
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium tabular-nums">
            {completedActions}/{totalActions}
          </span>
          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleExport}>
            <Download className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        items={actionItems || []}
        selectedIds={selectedIds}
        onSelectAll={selectAll}
        onDeselectAll={deselectAll}
        onStatusChange={handleBulkStatusChange}
        onDelete={handleBulkDelete}
        statusOptions={[
          { value: 'pending', label: t('actions.open') },
          { value: 'in_progress', label: t('actions.doing') },
          { value: 'completed', label: t('actions.done') },
        ]}
        getItemId={(item) => item.id}
      />

      {/* Milestones with nested actions */}
      {(!milestones || milestones.length === 0) ? (
        <EmptyState
          icon={Target}
          title={t('emptyStates.milestones.title')}
          description={t('emptyStates.milestones.description')}
          action={canWrite ? {
            label: t('milestones.addMilestone'),
            onClick: () => navigate(`/workspace/${workspaceId}?tab=milestones`),
            icon: Plus,
          } : undefined}
        />
      ) : (
        <div className="space-y-3">
          {milestones.map(milestone => {
            const milestoneActions = actionsByMilestone.grouped.get(milestone.id) || [];
            const completedCount = milestoneActions.filter(a => a.status === 'completed').length;
            const progress = milestoneActions.length > 0 
              ? Math.round((completedCount / milestoneActions.length) * 100) 
              : 0;
            const isExpanded = expandedMilestones.has(milestone.id);

            return (
              <MilestoneActionGroup
                key={milestone.id}
                milestone={milestone}
                actions={milestoneActions}
                progress={progress}
                completedCount={completedCount}
                isExpanded={isExpanded}
                onToggle={() => toggleMilestoneExpanded(milestone.id)}
                onAddAction={() => openCreateDialogForMilestone(milestone.id)}
                canWrite={canWrite}
                isStaff={true}
                deliverablesByAction={deliverablesByAction || {}}
                platformDocuments={platformDocuments}
                onStatusChange={handleStatusChange}
                onDueDateChange={handleDueDateChange}
                onDelete={(item) => setDeleteTarget(item)}
                onAddDeliverable={handleAddDeliverable}
                onCompleteDeliverable={handleCompleteDeliverable}
                isSelected={isSelected}
                onToggleSelect={toggleItem}
              />
            );
          })}

          {/* Unassigned actions (legacy) */}
          {actionsByMilestone.unassigned.length > 0 && (
            <Card className="border-dashed">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t('actions.unassignedActions')} ({actionsByMilestone.unassigned.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {actionsByMilestone.unassigned.map(item => (
                  <ActionItemCard
                    key={item.id}
                    item={item}
                    canWrite={canWrite}
                    isStaff={true}
                    deliverables={deliverablesByAction?.[item.id] || []}
                    platformDocuments={platformDocuments}
                    onStatusChange={handleStatusChange}
                    onDueDateChange={handleDueDateChange}
                    onDelete={(item) => setDeleteTarget(item)}
                    onAddDeliverable={handleAddDeliverable}
                    onCompleteDeliverable={handleCompleteDeliverable}
                    isSelected={isSelected(item.id)}
                    onToggleSelect={toggleItem}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('actions.newAction')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="milestone">{t('milestones.title')} *</Label>
              <Select 
                value={newAction.milestone_id} 
                onValueChange={v => setNewAction(a => ({ ...a, milestone_id: v }))}
              >
                <SelectTrigger id="milestone">
                  <Target className="h-4 w-4 mr-2" />
                  <SelectValue placeholder={t('actions.selectMilestone')} />
                </SelectTrigger>
                <SelectContent>
                  {milestones?.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">{t('actions.formTitle')} *</Label>
              <Input
                id="title"
                value={newAction.title}
                onChange={e => setNewAction(a => ({ ...a, title: e.target.value }))}
                placeholder={t('actions.formTitlePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('actions.formDescription')}</Label>
              <Textarea
                id="description"
                value={newAction.description}
                onChange={e => setNewAction(a => ({ ...a, description: e.target.value }))}
                placeholder={t('actions.formDescriptionPlaceholder')}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="due_date">{t('actions.formDueDate')}</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={newAction.due_date}
                  onChange={e => setNewAction(a => ({ ...a, due_date: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priority">{t('actions.formPriority')}</Label>
                <Select 
                  value={newAction.priority} 
                  onValueChange={v => setNewAction(a => ({ ...a, priority: v }))}
                >
                  <SelectTrigger id="priority">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('actions.priorityLow')}</SelectItem>
                    <SelectItem value="medium">{t('actions.priorityMedium')}</SelectItem>
                    <SelectItem value="high">{t('actions.priorityHigh')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="owner">{t('actions.owner')}</Label>
              <Select 
                value={newAction.owner_user_id} 
                onValueChange={v => setNewAction(a => ({ ...a, owner_user_id: v }))}
              >
                <SelectTrigger id="owner">
                  <SelectValue placeholder={t('actions.assignTo')} />
                </SelectTrigger>
                <SelectContent>
                  {members?.map(m => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.profile?.full_name || m.profile?.email || t('common.unknown')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={createAction.isPending || !newAction.milestone_id} loading={createAction.isPending}>
              {t('common.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('actions.deleteActionTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('actions.deleteActionConfirmation', { title: deleteTarget?.title })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// MilestoneActionGroup, KanbanColumn, ActionItemCard extracted to ./actions/

