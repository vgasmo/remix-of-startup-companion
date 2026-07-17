import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { clickableProps } from '@/lib/clickable';
import { useTranslation } from 'react-i18next';
import { format, isPast, isToday, parseISO } from 'date-fns';
import { useDateLocale } from '@/lib/dateLocale';
import { 
  Plus, AlertTriangle, Calendar, Trash2, Target, Download, 
  GripVertical, Clock, CheckCircle2, Circle, ChevronDown, ChevronRight,
  Flag
} from 'lucide-react';
import { AccelerationCalendarSection } from './AccelerationCalendarSection';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { EmptyState } from '@/components/ui/EmptyState';
import { SortableList } from '@/components/ui/SortableList';
import { BulkActionsBar, useBulkSelection } from '@/components/ui/BulkActionsBar';
import { useActionItems, useUpdateActionItem, useDeleteActionItem, useCreateActionItemFull, useBulkUpdateActions, useBulkDeleteActions, type ActionItem } from '@/hooks/useActionItems';
import { useMilestones, useCreateMilestone, useUpdateMilestone, useDeleteMilestone, useReorderMilestones, type Milestone } from '@/hooks/useMilestones';
// owner/members removed - founder is always the owner
import { useWorkspaceFounder } from '@/hooks/useWorkspaceMembers';
import { useActionDeliverablesBatch, useCreateActionDeliverable, useCompleteActionDeliverable } from '@/hooks/useActionDeliverables';
import { useTemplateInstances, useTemplates } from '@/hooks/useTemplates';
import { useExportActions, exportActionsToCsv } from '@/hooks/useExportData';
import { ActionItemCard, type PlatformDocument } from './actions/ActionItemCard';
import { buildPlatformDocumentOptions } from '@/lib/platformDocuments';
import { notify } from '@/lib/notify';

import { toTitleCase } from '@/lib/textUtils';
import type { Database } from '@/integrations/supabase/types';
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { useTrackEngagement } from '@/hooks/useEngagementEvents';
import { ViewReceipt } from '@/components/ui/ViewReceipt';


type ActionStatus = Database['public']['Enums']['action_status'];
type MilestoneStatus = Database['public']['Enums']['milestone_status'];

interface MilestonesActionsTabProps {
  workspaceId: string;
  canWrite: boolean;
  isStaff: boolean;
  programId?: string;
  programType?: string;
  currentWeek?: number | null;
}

const MILESTONE_STATUS_ICONS = {
  not_started: Circle,
  in_progress: Clock,
  completed: CheckCircle2,
  delayed: AlertTriangle,
} as const;

export function MilestonesActionsTab({ workspaceId, canWrite, isStaff, programId, programType, currentWeek }: MilestonesActionsTabProps) {
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const queryClient = useQueryClient();
  const { data: milestones, isLoading: milestonesLoading } = useMilestones(workspaceId);
  const { data: actionItems, isLoading: actionsLoading } = useActionItems(workspaceId);
  // members removed - owner is always founder
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
  const createMilestone = useCreateMilestone(workspaceId);
  const updateMilestone = useUpdateMilestone(workspaceId);
  const deleteMilestone = useDeleteMilestone(workspaceId);
  const reorderMilestones = useReorderMilestones(workspaceId);
  const updateAction = useUpdateActionItem(workspaceId);
  const deleteAction = useDeleteActionItem(workspaceId);
  const createAction = useCreateActionItemFull(workspaceId);
  const bulkUpdate = useBulkUpdateActions(workspaceId);
  const bulkDelete = useBulkDeleteActions(workspaceId);
  const { refetch: fetchExportData } = useExportActions(workspaceId);
  

  // State
  const [expandedMilestones, setExpandedMilestones] = useState<Set<string>>(() => new Set());
  const [filters, setFilters] = useState({ overdue: false, priority: 'all' });
  const [createMilestoneDialogOpen, setCreateMilestoneDialogOpen] = useState(false);
  const [createActionDialogOpen, setCreateActionDialogOpen] = useState(false);
  const [deleteMilestoneTarget, setDeleteMilestoneTarget] = useState<Milestone | null>(null);
  const [deleteActionTarget, setDeleteActionTarget] = useState<ActionItem | null>(null);
  const [newMilestone, setNewMilestone] = useState({ title: '', description: '', target_date: '' });
  const [newAction, setNewAction] = useState({ title: '', description: '', due_date: '', priority: 'medium', milestone_id: '' });
  // Inline quick-add on the actions section
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [quickAddMilestoneId, setQuickAddMilestoneId] = useState<string>('');

  // Bulk selection
  const { selectedIds, toggleItem, selectAll, deselectAll, isSelected } = useBulkSelection(
    actionItems || [], (item) => item.id
  );

  // Group actions by milestone with filters
  const actionsByMilestone = useMemo(() => {
    const grouped = new Map<string, ActionItem[]>();
    const unassigned: ActionItem[] = [];
    (actionItems || []).forEach(item => {
      let passes = true;
      if (filters.priority !== 'all' && item.priority !== filters.priority) passes = false;
      if (filters.overdue) {
        const isOverdue = item.due_date && isPast(parseISO(item.due_date)) && !isToday(parseISO(item.due_date)) && item.status !== 'completed' && item.status !== 'awaiting_validation';
        if (!isOverdue) passes = false;
      }
      if (!passes) return;
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

  // Auto-expand milestones on first load
  useMemo(() => {
    if (milestones && expandedMilestones.size === 0) {
      const inProgress = milestones.filter(m => m.status === 'in_progress' || m.status === 'not_started');
      if (inProgress.length > 0) {
        setExpandedMilestones(new Set(inProgress.slice(0, 2).map(m => m.id)));
      }
    }
  }, [milestones]);

  // Deep-link highlight: ?highlight={actionId} expands the containing milestone,
  // scrolls the row into view, and flashes it. Wired from OneThingToday links.
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const highlightedOnceRef = useRef<string | null>(null);
  useEffect(() => {
    if (!highlightId || !actionItems) return;
    if (highlightedOnceRef.current === highlightId) return;
    const target = actionItems.find(a => a.id === highlightId);
    if (!target) return;
    highlightedOnceRef.current = highlightId;
    if (target.milestone_id) {
      setExpandedMilestones(prev => {
        if (prev.has(target.milestone_id!)) return prev;
        const next = new Set(prev);
        next.add(target.milestone_id!);
        return next;
      });
    }
    // Defer to next frame so the collapsible content has mounted.
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-action-id="${highlightId}"]`) as HTMLElement | null;
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'transition-all');
      window.setTimeout(() => {
        el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2');
        // Clear the param so a refresh doesn't re-flash.
        const params = new URLSearchParams(searchParams);
        params.delete('highlight');
        setSearchParams(params, { replace: true });
      }, 2400);
    });
  }, [highlightId, actionItems, searchParams, setSearchParams]);


  const trackEngagement = useTrackEngagement(workspaceId);
  const toggleMilestoneExpanded = (id: string) => {
    setExpandedMilestones(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Fire-and-forget: track that this user opened the milestone card.
        trackEngagement.mutate({ eventType: 'view', targetType: 'milestone', targetId: id });
      }
      return next;
    });
  };

  // Milestone handlers
  const handleCreateMilestone = async () => {
    if (!newMilestone.title.trim()) { notify.error(t('milestones.titleRequired')); return; }
    try {
      await createMilestone.mutateAsync({
        title: newMilestone.title,
        description: newMilestone.description || undefined,
        target_date: newMilestone.target_date || null,
      });
      notify.success(t('milestones.milestoneCreated'));
      setCreateMilestoneDialogOpen(false);
      setNewMilestone({ title: '', description: '', target_date: '' });
    } catch { notify.error(t('milestones.failedToCreate')); }
  };

  const handleMilestoneStatusChange = async (milestone: Milestone, status: MilestoneStatus) => {
    if (!canWrite) return;
    try {
      // Cascade: closing a gate/milestone closes all its non-terminal actions.
      if (status === 'completed') {
        const children = (actionItems || []).filter(
          a => a.milestone_id === milestone.id &&
               a.status !== 'completed' &&
               a.status !== 'cancelled',
        );
        if (children.length > 0) {
          await bulkUpdate.mutateAsync({ ids: children.map(c => c.id), status: 'completed' });
          notify.success(
            t('milestones.cascadeClosed', {
              count: children.length,
              defaultValue: `${children.length} ação(ões) fechada(s) com o gate`,
            }),
          );
        }
      }

      await updateMilestone.mutateAsync({ id: milestone.id, status });
      queryClient.invalidateQueries({ queryKey: ['workspace-tab-badges', workspaceId] });
      // Confetti is handled by useMilestones' onSuccess (single source of truth).
    } catch { notify.error(t('milestones.failedToUpdate')); }
  };

  // Snapshot a milestone + its child actions, delete it, then offer toast undo to re-insert both.
  const handleDeleteMilestoneConfirm = async () => {
    if (!deleteMilestoneTarget || !canWrite) return;
    const target = deleteMilestoneTarget;
    try {
      // Snapshot full row + child action rows BEFORE delete (FK cascade will drop children)
      const [{ data: msRow }, { data: childActions }] = await Promise.all([
        supabase.from('milestones').select('*').eq('id', target.id).maybeSingle(),
        supabase.from('action_items').select('*').eq('milestone_id', target.id),
      ]);

      await deleteMilestone.mutateAsync(target.id);

      const restore = async () => {
        if (!msRow) {
          notify.error(t('actions.undoFailed', { defaultValue: 'Could not undo. Please try again.' }));
          return;
        }
        try {
          const { error: msErr } = await supabase.from('milestones').insert(msRow as any);
          if (msErr) throw msErr;
          if (childActions && childActions.length > 0) {
            const { error: aErr } = await supabase.from('action_items').insert(childActions as any);
            if (aErr) throw aErr;
          }
          notify.success(t('milestones.milestoneRestored', { defaultValue: 'Milestone restored' }));
        } catch {
          notify.error(t('actions.undoFailed', { defaultValue: 'Could not undo. Please try again.' }));
        } finally {
          queryClient.invalidateQueries({ queryKey: ['milestones', workspaceId] });
          queryClient.invalidateQueries({ queryKey: ['action-items', workspaceId] });
        }
      };

      notify.success(t('milestones.milestoneDeleted'), {
        duration: 8000,
        action: { label: t('common.undo'), onClick: restore },
      });
      setDeleteMilestoneTarget(null);
    } catch { notify.error(t('milestones.failedToDelete')); }
  };

  // Action handlers
  const handleStatusChange = useCallback(async (item: ActionItem, newStatus: ActionStatus) => {
    if (!canWrite) return;
    try {
      await updateAction.mutateAsync({ id: item.id, status: newStatus });
      // Fire-and-forget: track completion as an engagement event for cross-role visibility.
      if (newStatus === 'completed' && item.status !== 'completed') {
        trackEngagement.mutate({ eventType: 'complete', targetType: 'action', targetId: item.id });
      }
    } catch { notify.error(t('actions.failedToUpdate')); }
  }, [canWrite, updateAction, t, trackEngagement]);


  const handleDueDateChange = useCallback(async (item: ActionItem, date: Date | undefined) => {
    if (!canWrite) return;
    try { await updateAction.mutateAsync({ id: item.id, due_date: date ? format(date, 'yyyy-MM-dd') : null }); }
    catch { notify.error(t('actions.failedToUpdate')); }
  }, [canWrite, updateAction, t]);


  const handleAddDeliverable = useCallback(async (actionId: string, deliverable: { title: string; type: string; external_url?: string; document_id?: string }) => {
    try {
      // Guard: deliverable must carry at least one source (file_path / external_url / document_id) to satisfy DB CHECK
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

  // Generic action-restore: re-insert previously-deleted action_items rows.
  const restoreActions = async (rows: any[]) => {
    if (!rows || rows.length === 0) return;
    try {
      const { error } = await supabase.from('action_items').insert(rows);
      if (error) throw error;
      notify.success(t('actions.actionRestored', { count: rows.length, defaultValue: '{{count}} action(s) restored' }));
    } catch {
      notify.error(t('actions.undoFailed', { defaultValue: 'Could not undo. Please try again.' }));
    } finally {
      queryClient.invalidateQueries({ queryKey: ['action-items', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['milestones', workspaceId] });
    }
  };

  const handleDeleteActionConfirm = async () => {
    if (!deleteActionTarget || !canWrite) return;
    const target = deleteActionTarget;
    try {
      const { data: snapshot } = await supabase.from('action_items').select('*').eq('id', target.id).maybeSingle();
      await deleteAction.mutateAsync(target.id);
      notify.success(t('actions.actionDeleted'), {
        duration: 8000,
        action: snapshot ? { label: t('common.undo'), onClick: () => restoreActions([snapshot]) } : undefined,
      });
      setDeleteActionTarget(null);
    } catch { notify.error(t('actions.failedToDelete')); }
  };

  const handleCreateAction = async () => {
    if (!newAction.title.trim()) { notify.error(t('actions.titleRequired')); return; }
    try {
      await createAction.mutateAsync({
        title: newAction.title,
        description: newAction.description || undefined,
        due_date: newAction.due_date || null,
        priority: newAction.priority,
        owner_user_id: founderId || null,
        milestone_id: newAction.milestone_id || null,
      });
      notify.success(t('actions.actionCreated'));
      setCreateActionDialogOpen(false);
      setNewAction({ title: '', description: '', due_date: '', priority: 'medium', milestone_id: '' });
    } catch { notify.error(t('actions.failedToCreate')); }
  };

  const handleQuickAddAction = async () => {
    const title = quickAddTitle.trim();
    if (!title) return;
    try {
      await createAction.mutateAsync({
        title,
        priority: 'medium',
        owner_user_id: founderId || null,
        milestone_id: quickAddMilestoneId || null,
      });
      setQuickAddTitle('');
      notify.success(t('actions.actionCreated'));
    } catch { notify.error(t('actions.failedToCreate')); }
  };

  const openCreateActionForMilestone = (milestoneId: string) => {
    setNewAction(prev => ({ ...prev, milestone_id: milestoneId }));
    setCreateActionDialogOpen(true);
  };

  const handleBulkStatusChange = async (ids: string[], status: string) => {
    try {
      // Snapshot prior {id -> status, completed_at} so undo can restore exactly.
      const { data: prior } = await supabase
        .from('action_items')
        .select('id, status, completed_at')
        .in('id', ids);
      await bulkUpdate.mutateAsync({ ids, status: status as ActionStatus });
      notify.success(t('actions.updatedCount', { count: ids.length }), {
        duration: 8000,
        action: prior && prior.length > 0 ? {
          label: t('common.undo'),
          onClick: async () => {
            try {
              // Group by prior status for fewer round trips
              const groups = new Map<string, string[]>();
              const completedAtById = new Map<string, string | null>();
              for (const r of prior) {
                const list = groups.get(r.status as string) || [];
                list.push(r.id);
                groups.set(r.status as string, list);
                completedAtById.set(r.id, (r as any).completed_at ?? null);
              }
              for (const [st, gIds] of groups.entries()) {
                const { error } = await supabase
                  .from('action_items')
                  .update({ status: st as ActionStatus })
                  .in('id', gIds);
                if (error) throw error;
              }
              // Restore completed_at per row (rare path, do it sequentially for correctness)
              for (const r of prior) {
                await supabase.from('action_items').update({ completed_at: (r as any).completed_at ?? null }).eq('id', r.id);
              }
              notify.success(t('actions.statusReverted', { count: ids.length, defaultValue: 'Status reverted' }));
            } catch {
              notify.error(t('actions.undoFailed', { defaultValue: 'Could not undo. Please try again.' }));
            } finally {
              queryClient.invalidateQueries({ queryKey: ['action-items', workspaceId] });
              queryClient.invalidateQueries({ queryKey: ['milestones', workspaceId] });
            }
          },
        } : undefined,
      });
      deselectAll();
    } catch { notify.error(t('actions.failedToUpdate')); }
  };

  const handleBulkDelete = async (ids: string[]) => {
    try {
      const { data: snapshots } = await supabase.from('action_items').select('*').in('id', ids);
      await bulkDelete.mutateAsync(ids);
      notify.success(t('actions.deletedCount', { count: ids.length }), {
        duration: 8000,
        action: snapshots && snapshots.length > 0 ? {
          label: t('common.undo'),
          onClick: () => restoreActions(snapshots),
        } : undefined,
      });
      deselectAll();
    } catch { notify.error(t('actions.failedToDelete')); }
  };

  const handleExport = async () => {
    const { data } = await fetchExportData();
    if (data?.length) { exportActionsToCsv(data, `actions-${workspaceId}`); notify.success(t('sessions.exportedSuccess')); }
    else { notify.error(t('sessions.noDataToExport')); }
  };

  if (milestonesLoading || actionsLoading) {
    return <div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-64 w-full" /></div>;
  }

  const totalActions = actionItems?.length || 0;
  const completedActions = actionItems?.filter(a => a.status === 'completed').length || 0;

  return (
    <div className="space-y-4">
      {/* Acceleration Calendar */}
      {programType === 'acceleration' && programId && (
        <AccelerationCalendarSection programId={programId} isStaff={isStaff} currentWeek={currentWeek} />
      )}
      {/* Compact Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-muted/20 rounded-lg border border-border/50">
        {canWrite && (
          <>
            <Button size="sm" className="h-7 text-xs" onClick={() => setCreateMilestoneDialogOpen(true)}>
              <Flag className="h-3.5 w-3.5 mr-1" />
              {t('milestones.addMilestone')}
            </Button>
            {milestones && milestones.length > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCreateActionDialogOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                {t('actions.addAction')}
              </Button>
            )}
            <div className="h-5 w-px bg-border/60" />
          </>
        )}

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

        <Button variant={filters.overdue ? "secondary" : "ghost"} size="sm" className="h-7 text-xs px-2"
          onClick={() => setFilters(f => ({ ...f, overdue: !f.overdue }))}>
          <AlertTriangle className="h-3 w-3 mr-1" />
          {t('actions.overdue')}
        </Button>

        {(filters.priority !== 'all' || filters.overdue) && (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground px-2"
            onClick={() => setFilters({ overdue: false, priority: 'all' })}>
            ✕ {t('actions.clearFilters')}
          </Button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium tabular-nums">
            {completedActions}/{totalActions} {t('actions.actionsLabel', 'ações')}
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
          { value: 'awaiting_validation', label: t('actions.awaitingValidation', 'A aguardar validação') },
          { value: 'completed', label: t('actions.done') },
        ]}
        getItemId={(item) => item.id}
      />

      {/* Inline Quick Add — create action with optional milestone */}
      {canWrite && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-card border border-border/50 rounded-lg">
          <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            value={quickAddTitle}
            onChange={e => setQuickAddTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && quickAddTitle.trim() && !createAction.isPending) {
                e.preventDefault();
                handleQuickAddAction();
              }
            }}
            placeholder={t('actions.quickAddPlaceholder', { defaultValue: 'Nova ação — escreva o título e prima Enter' })}
            className="h-8 text-sm flex-1 min-w-[220px] border-0 bg-transparent focus-visible:ring-1"
          />
          <Select value={quickAddMilestoneId || '__none__'} onValueChange={v => setQuickAddMilestoneId(v === '__none__' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs w-[180px]">
              <SelectValue placeholder={t('actions.selectMilestone')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">{t('actions.noMilestone', { defaultValue: 'Sem marco' })}</SelectItem>
              {milestones?.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            className="h-8 text-xs"
            onClick={handleQuickAddAction}
            disabled={createAction.isPending || !quickAddTitle.trim()}
            loading={createAction.isPending}
          >
            {t('common.add', { defaultValue: 'Adicionar' })}
          </Button>
        </div>
      )}


      {/* Milestones with nested actions */}
      {(!milestones || milestones.length === 0) ? (
        <EmptyState
          icon={Flag}
          title={t('emptyStates.milestones.title')}
          description={t('emptyStates.milestones.description')}
          action={canWrite ? {
            label: t('milestones.addMilestone'),
            onClick: () => setCreateMilestoneDialogOpen(true),
            icon: Plus,
          } : undefined}
        />
      ) : (
        <SortableList
          items={milestones}
          disabled={!canWrite}
          onReorder={(reordered) => {
            const updates = reordered.map((m, i) => ({ id: m.id, position: i }));
            reorderMilestones.mutateAsync(updates).catch(() => notify.error(t('milestones.failedToReorder')));
          }}
          renderItem={(milestone, _index, dragHandle) => {
            const milestoneActions = actionsByMilestone.grouped.get(milestone.id) || [];
            const completedCount = milestoneActions.filter(a => a.status === 'completed').length;
            const progress = milestoneActions.length > 0 ? Math.round((completedCount / milestoneActions.length) * 100) : 0;
            const isExpanded = expandedMilestones.has(milestone.id);
            const StatusIcon = MILESTONE_STATUS_ICONS[milestone.status] || Circle;
            const isOverdue = milestone.target_date && isPast(parseISO(milestone.target_date)) && !isToday(parseISO(milestone.target_date)) && milestone.status !== 'completed';

            return (
              <Card key={milestone.id} className={`transition-all ${isOverdue ? 'border-destructive/50' : ''}`}>
                <Collapsible open={isExpanded} onOpenChange={() => toggleMilestoneExpanded(milestone.id)}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-2">
                        {canWrite && dragHandle && <div className="shrink-0" {...clickableProps(e => e.stopPropagation())}>{dragHandle}</div>}
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                        <StatusIcon className={`h-4 w-4 shrink-0 ${
                          milestone.status === 'completed' ? 'text-[hsl(var(--success))]' :
                          milestone.status === 'in_progress' ? 'text-primary' :
                          milestone.status === 'delayed' ? 'text-destructive' :
                          'text-muted-foreground'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`font-medium truncate ${milestone.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                              {toTitleCase(milestone.title)}
                            </span>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {completedCount}/{milestoneActions.length} {t('actions.actionsLabel', 'ações')}
                            </Badge>
                            {milestone.target_date && (
                              <Badge variant="outline" className={`text-xs shrink-0 ${isOverdue ? 'text-destructive border-destructive' : ''}`}>
                                <Calendar className="h-3 w-3 mr-1" />
                                {format(parseISO(milestone.target_date), 'dd MMM', { locale: dateLocale })}
                              </Badge>
                            )}
                            <ViewReceipt workspaceId={workspaceId} targetType="milestone" targetId={milestone.id} />
                          </div>

                          {milestoneActions.length > 0 && (
                            <div className="flex items-center gap-2 mt-1">
                              <Progress value={progress} className="h-1.5 flex-1 max-w-[200px]" />
                              <span className="text-xs text-muted-foreground">{progress}%</span>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0" {...clickableProps(e => e.stopPropagation())}>
                          {canWrite && (
                            <Select value={milestone.status} onValueChange={(v) => handleMilestoneStatusChange(milestone, v as MilestoneStatus)}>
                              <SelectTrigger className="h-7 w-auto px-2 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="not_started">{t('milestones.planned')}</SelectItem>
                                <SelectItem value="in_progress">{t('milestones.inProgress')}</SelectItem>
                                <SelectItem value="completed">{t('milestones.done')}</SelectItem>
                                <SelectItem value="delayed">{t('milestones.delayed')}</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                          {canWrite && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openCreateActionForMilestone(milestone.id)} aria-label={t('common.add', { defaultValue: 'Adicionar' })}>
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {canWrite && (milestone.source_gate_id === null || isStaff) && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeleteMilestoneTarget(milestone)} aria-label={t('common.delete', { defaultValue: 'Eliminar' })}>
                              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="px-4 pb-4 pt-0 space-y-2">
                      {milestone.description && (
                        <p className="text-sm text-muted-foreground mb-3 pl-6">{milestone.description}</p>
                      )}
                      {milestoneActions.length === 0 ? (
                        <div className="py-4 text-center text-sm text-muted-foreground">
                          {t('actions.noActionsYet', 'Ainda sem ações. Adicione ações para acompanhar o progresso.')}
                        </div>
                      ) : (
                        milestoneActions.map(item => (
                          <div key={item.id} data-action-id={item.id} className="rounded-lg">
                            <ActionItemCard item={item} canWrite={canWrite} isStaff={isStaff}
                              deliverables={deliverablesByAction?.[item.id] || []}
                              platformDocuments={platformDocuments}
                              onStatusChange={handleStatusChange} onDueDateChange={handleDueDateChange}
                              onDelete={(item) => setDeleteActionTarget(item)}
                              onAddDeliverable={handleAddDeliverable} onCompleteDeliverable={handleCompleteDeliverable}
                              isSelected={isSelected(item.id)} onToggleSelect={toggleItem}
                            />
                          </div>
                        ))
                      )}
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            );
          }}
        />
      )}

      {/* Unassigned actions (legacy data) */}
      {actionsByMilestone.unassigned.length > 0 && (
        <Card className="border-dashed">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t('actions.unassignedActions')} ({actionsByMilestone.unassigned.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {actionsByMilestone.unassigned.map(item => (
              <div key={item.id} data-action-id={item.id} className="rounded-lg">
                <ActionItemCard item={item} canWrite={canWrite} isStaff={isStaff}
                  deliverables={deliverablesByAction?.[item.id] || []}
                  platformDocuments={platformDocuments}
                  onStatusChange={handleStatusChange} onDueDateChange={handleDueDateChange}
                  onDelete={(item) => setDeleteActionTarget(item)}
                  onAddDeliverable={handleAddDeliverable} onCompleteDeliverable={handleCompleteDeliverable}
                  isSelected={isSelected(item.id)} onToggleSelect={toggleItem}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Create Milestone Dialog */}
      <Dialog open={createMilestoneDialogOpen} onOpenChange={setCreateMilestoneDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('milestones.newMilestone')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ms-title">{t('milestones.titleLabel')} *</Label>
              <Input id="ms-title" value={newMilestone.title} onChange={e => setNewMilestone(m => ({ ...m, title: e.target.value }))} placeholder={t('milestones.titlePlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ms-desc">{t('milestones.descriptionLabel')}</Label>
              <Textarea id="ms-desc" value={newMilestone.description} onChange={e => setNewMilestone(m => ({ ...m, description: e.target.value }))} placeholder={t('milestones.descriptionPlaceholder')} rows={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ms-date">{t('milestones.targetDate')}</Label>
              <Input id="ms-date" type="date" value={newMilestone.target_date} onChange={e => setNewMilestone(m => ({ ...m, target_date: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateMilestoneDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleCreateMilestone} disabled={createMilestone.isPending} loading={createMilestone.isPending}>{t('common.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Action Dialog */}
      <Dialog open={createActionDialogOpen} onOpenChange={setCreateActionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('actions.newAction')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="act-milestone">{t('milestones.title')} <span className="text-muted-foreground text-xs">({t('common.optional', { defaultValue: 'opcional' })})</span></Label>
              <Select value={newAction.milestone_id || '__none__'} onValueChange={v => setNewAction(a => ({ ...a, milestone_id: v === '__none__' ? '' : v }))}>
                <SelectTrigger id="act-milestone"><Target className="h-4 w-4 mr-2" /><SelectValue placeholder={t('actions.selectMilestone')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t('actions.noMilestone', { defaultValue: 'Sem marco' })}</SelectItem>
                  {milestones?.map(m => <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="act-title">{t('actions.formTitle')} *</Label>
              <Input id="act-title" value={newAction.title} onChange={e => setNewAction(a => ({ ...a, title: e.target.value }))} placeholder={t('actions.formTitlePlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="act-desc">{t('actions.formDescription')}</Label>
              <Textarea id="act-desc" value={newAction.description} onChange={e => setNewAction(a => ({ ...a, description: e.target.value }))} placeholder={t('actions.formDescriptionPlaceholder')} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="act-date">{t('actions.formDueDate')}</Label>
                <Input id="act-date" type="date" value={newAction.due_date} onChange={e => setNewAction(a => ({ ...a, due_date: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="act-priority">{t('actions.formPriority')}</Label>
                <Select value={newAction.priority} onValueChange={v => setNewAction(a => ({ ...a, priority: v }))}>
                  <SelectTrigger id="act-priority"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">{t('actions.priorityLow')}</SelectItem>
                    <SelectItem value="medium">{t('actions.priorityMedium')}</SelectItem>
                    <SelectItem value="high">{t('actions.priorityHigh')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateActionDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button onClick={handleCreateAction} disabled={createAction.isPending || !newAction.title.trim()} loading={createAction.isPending}>{t('common.create')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Milestone Confirmation */}
      <AlertDialog open={!!deleteMilestoneTarget} onOpenChange={(open) => !open && setDeleteMilestoneTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('milestones.deleteMilestone')}</AlertDialogTitle>
            <AlertDialogDescription>{t('milestones.deleteConfirm', { title: deleteMilestoneTarget?.title })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteMilestoneConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Action Confirmation */}
      <AlertDialog open={!!deleteActionTarget} onOpenChange={(open) => !open && setDeleteActionTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('actions.deleteActionTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('actions.deleteActionConfirmation', { title: deleteActionTarget?.title })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteActionConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
