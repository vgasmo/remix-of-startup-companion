import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckSquare,
  Square,
  ArrowRight,
  UserPlus,
  Calendar,
  Tag,
  Trash2,
  MoreHorizontal,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
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
import { supabase } from '@/lib/supabaseClient';
import { useQueryClient } from '@tanstack/react-query';
import { notify } from "@/lib/notify";
import { cn } from '@/lib/utils';
import type { CrmInboxItem } from '@/hooks/useCrmInbox';
import { PIPELINE_STAGES, type FunnelStage } from '@/constants/funnelStages';
import { getFunnelStageLabel, getFunnelStageOptions } from '@/lib/stageLabels';
import { logger } from '@/lib/logger';
import { invokeWithAuth } from "@/lib/invokeWithAuth";

interface CrmBulkActionsProps {
  items: CrmInboxItem[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  consultants: { id: string; full_name: string | null }[];
}

export function CrmBulkActions({
  items,
  selectedIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  consultants,
}: CrmBulkActionsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{
    action: string;
    title: string;
    description: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const selectedCount = selectedIds.size;
  const allSelected = items.length > 0 && selectedCount === items.length;
  const someSelected = selectedCount > 0 && selectedCount < items.length;

  const STAGE_OPTIONS = [
    ...getFunnelStageOptions(t, PIPELINE_STAGES),
    { value: 'rejected' as FunnelStage, label: t('pipeline.stages.rejected') },
    { value: 'archived' as FunnelStage, label: t('pipeline.stages.archived') },
  ];

  // Restore prior {id -> column value} map. Used by undo for stage / assignee bulk ops.
  const restoreColumn = async (
    column: 'stage' | 'owner_consultant_id',
    map: Map<string, unknown>,
    successKey: string,
  ) => {
    try {
      // Group ids by their previous value so we can do one update per group
      const groups = new Map<unknown, string[]>();
      for (const [id, val] of map.entries()) {
        const list = groups.get(val) || [];
        list.push(id);
        groups.set(val, list);
      }
      for (const [val, ids] of groups.entries()) {
        const { error } = await supabase
          .from('funnel_items')
          .update({ [column]: val as any, updated_at: new Date().toISOString() })
          .in('id', ids);
        if (error) throw error;
      }
      notify.success(t(successKey, { defaultValue: 'Reverted' }));
      queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
      queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
    } catch (err) {
      notify.error(t('crm.bulk.undoFailed', { defaultValue: 'Could not undo. Please try again.' }));
      logger.error('crm_bulk_undo_failed', { column }, err);
    }
  };

  const handleBulkStageChange = async (newStage: FunnelStage) => {
    const stageLabel = getFunnelStageLabel(t, newStage);
    setConfirmDialog({
      action: 'stage_change',
      title: t('crm.bulk.moveConfirmTitle', { count: selectedCount, stage: stageLabel }),
      description: t('crm.bulk.moveConfirmDesc'),
      onConfirm: async () => {
        setIsProcessing(true);
        try {
          const ids = Array.from(selectedIds);
          
          const { data: currentItems, error: fetchErr } = await supabase
            .from('funnel_items')
            .select('id, stage')
            .in('id', ids);
          if (fetchErr) throw fetchErr;

          const stageMap = new Map<string, unknown>(currentItems?.map(i => [i.id, i.stage]) || []);

          const { error } = await supabase
            .from('funnel_items')
            .update({ stage: newStage, updated_at: new Date().toISOString() })
            .in('id', ids);

          if (error) throw error;

          // G1: check every funnel_events insert and record who did the change.
          const { data: authData } = await supabase.auth.getUser();
          const performedBy = authData.user?.id ?? null;
          let eventFailures = 0;
          for (const id of ids) {
            const oldStage = stageMap.get(id) as string | undefined;

            const { error: evErr } = await supabase.from('funnel_events').insert({
              funnel_item_id: id,
              event_type: 'stage_changed',
              from_stage: oldStage,
              to_stage: newStage,
              performed_by: performedBy,
              metadata: { bulk_action: true },
            });
            if (evErr) {
              eventFailures += 1;
              logger.warn('crm_bulk_event_insert_failed', { id, error: evErr.message });
            }

            if (oldStage && oldStage !== newStage) {
              invokeWithAuth('send-crm-stage-transition-email', {
                body: { funnel_item_id: id, from_stage: oldStage, to_stage: newStage },
              }).catch((err) => logger.warn('crm_email_trigger_failed_bulk', { error: String(err) }));
            }
          }

          if (eventFailures > 0) {
            notify.warn(t('crm.bulk.partialEventFailures', {
              count: eventFailures,
              total: ids.length,
              defaultValue: `${eventFailures}/${ids.length} eventos não registados. O histórico pode estar incompleto.`,
            }));
          }

          notify.success(t('crm.bulk.moveSuccess', { count: selectedCount, stage: stageLabel }), {
            duration: 8000,
            action: {
              label: t('common.undo'),
              onClick: () => restoreColumn('stage', stageMap, 'crm.bulk.moveUndone'),
            },
          });
          queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
          queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
          onClearSelection();
        } catch (error) {
          notify.error(t('crm.bulk.moveFailed'));
          logger.error('operation_error', {}, error);
        } finally {
          setIsProcessing(false);
        }
      },
    });
  };

  const handleBulkAssign = async (consultantId: string) => {
    const consultant = consultants.find((c) => c.id === consultantId);
    setConfirmDialog({
      action: 'assign',
      title: t('crm.bulk.assignConfirmTitle', { count: selectedCount, name: consultant?.full_name || t('common.unknown') }),
      description: t('crm.bulk.assignConfirmDesc'),
      onConfirm: async () => {
        setIsProcessing(true);
        try {
          const ids = Array.from(selectedIds);

          const { data: currentItems } = await supabase
            .from('funnel_items')
            .select('id, owner_consultant_id')
            .in('id', ids);

          const ownerMap = new Map<string, unknown>(
            currentItems?.map(i => [i.id, (i as any).owner_consultant_id ?? null]) || [],
          );

          const { error } = await supabase
            .from('funnel_items')
            .update({ owner_consultant_id: consultantId, updated_at: new Date().toISOString() })
            .in('id', ids);

          if (error) throw error;

          // Audit trail: log ownership changes
          const { data: authData } = await supabase.auth.getUser();
          const performedBy = authData.user?.id ?? null;
          for (const id of ids) {
            const prev = ownerMap.get(id) ?? null;
            const { error: evErr } = await supabase.from('funnel_events').insert({
              funnel_item_id: id,
              event_type: 'assignee_changed',
              performed_by: performedBy,
              metadata: { bulk_action: true, from_owner: prev, to_owner: consultantId },
            });
            if (evErr) logger.warn('crm_bulk_assign_event_failed', { id, error: evErr.message });
          }


          notify.success(t('crm.bulk.assignSuccess', { count: selectedCount, name: consultant?.full_name }), {
            duration: 8000,
            action: {
              label: t('common.undo'),
              onClick: () => restoreColumn('owner_consultant_id', ownerMap, 'crm.bulk.assignUndone'),
            },
          });
          queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
          queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
          onClearSelection();
        } catch (error) {
          notify.error(t('crm.bulk.assignFailed'));
          logger.error('operation_error', {}, error);
        } finally {
          setIsProcessing(false);
        }
      },
    });
  };

  const handleBulkSetNextAction = async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(10, 0, 0, 0);

    setConfirmDialog({
      action: 'next_action',
      title: t('crm.bulk.nextActionConfirmTitle', { count: selectedCount }),
      description: t('crm.bulk.nextActionConfirmDesc', { date: tomorrow.toLocaleDateString() }),
      onConfirm: async () => {
        setIsProcessing(true);
        try {
          const ids = Array.from(selectedIds);
          const { error } = await supabase
            .from('funnel_items')
            .update({
              next_action_at: tomorrow.toISOString(),
              next_action_description: 'Follow up',
              updated_at: new Date().toISOString(),
            })
            .in('id', ids)
            .is('next_action_at', null);

          if (error) throw error;

          notify.success(t('crm.bulk.nextActionSuccess'));
          queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
          queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
          onClearSelection();
        } catch (error) {
          notify.error(t('crm.bulk.nextActionFailed'));
          logger.error('operation_error', {}, error);
        } finally {
          setIsProcessing(false);
        }
      },
    });
  };

  const handleBulkArchive = async () => {
    setConfirmDialog({
      action: 'archive',
      title: t('crm.bulk.archiveConfirmTitle', { count: selectedCount }),
      description: t('crm.bulk.archiveConfirmDesc'),
      onConfirm: async () => {
        setIsProcessing(true);
        try {
          const ids = Array.from(selectedIds);

          const { data: currentItems } = await supabase
            .from('funnel_items')
            .select('id, stage')
            .in('id', ids);

          const stageMap = new Map<string, unknown>(currentItems?.map(i => [i.id, i.stage]) || []);

          const { error } = await supabase
            .from('funnel_items')
            .update({ stage: 'archived', updated_at: new Date().toISOString() })
            .in('id', ids);

          if (error) throw error;

          notify.success(t('crm.bulk.archiveSuccess', { count: selectedCount }), {
            duration: 8000,
            action: {
              label: t('common.undo'),
              onClick: () => restoreColumn('stage', stageMap, 'crm.bulk.archiveUndone'),
            },
          });
          queryClient.invalidateQueries({ queryKey: ['crm-pipeline'] });
          queryClient.invalidateQueries({ queryKey: ['crm-inbox'] });
          onClearSelection();
        } catch (error) {
          notify.error(t('crm.bulk.archiveFailed'));
          logger.error('operation_error', {}, error);
        } finally {
          setIsProcessing(false);
        }
      },
    });
  };

  if (items.length === 0) return null;

  return (
    <>
      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={allSelected ? onClearSelection : onSelectAll}
        >
          {allSelected ? (
            <CheckSquare className="h-4 w-4 text-primary" />
          ) : someSelected ? (
            <div className="h-4 w-4 border-2 rounded bg-primary/20" />
          ) : (
            <Square className="h-4 w-4" />
          )}
        </Button>

        {selectedCount > 0 ? (
          <>
            <Badge variant="secondary" className="text-xs">
              {t('crm.bulk.selectedCount', { count: selectedCount })}
            </Badge>

            <div className="flex items-center gap-1 ml-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1" disabled={isProcessing}>
                    <ArrowRight className="h-3.5 w-3.5" />
                    {t('crm.bulk.moveTo')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {STAGE_OPTIONS.map((stage) => (
                    <DropdownMenuItem
                      key={stage.value}
                      onClick={() => handleBulkStageChange(stage.value)}
                    >
                      {stage.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1" disabled={isProcessing}>
                    <UserPlus className="h-3.5 w-3.5" />
                    {t('crm.bulk.assign')}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {consultants.map((c) => (
                    <DropdownMenuItem key={c.id} onClick={() => handleBulkAssign(c.id)}>
                      {c.full_name || t('common.unknown')}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8" disabled={isProcessing} aria-label={t('common.moreActions', { defaultValue: 'More actions' })}>
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={handleBulkSetNextAction}>
                    <Calendar className="h-4 w-4 mr-2" />
                    {t('crm.bulk.setNextAction')}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={handleBulkArchive}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    {t('crm.bulk.archiveSelected')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-muted-foreground"
                onClick={onClearSelection}
              >
                {t('common.clear')}
              </Button>
            </div>

            {isProcessing && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-2" />
            )}
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {t('crm.bulk.selectLeads')}
          </span>
        )}
      </div>

      <AlertDialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" />
              {confirmDialog?.title}
            </AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isProcessing}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDialog?.onConfirm().then(() => setConfirmDialog(null))}
              disabled={isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {t('common.loading')}
                </>
              ) : (
                t('common.confirm')
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
