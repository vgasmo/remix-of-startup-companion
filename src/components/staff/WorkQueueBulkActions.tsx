/**
 * Bulk actions for the staff Work Queue.
 * Operates on `staff_work_queue_items` (not workspaces).
 * Supported: mark done, snooze 1d/7d, dismiss selection.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Calendar, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { notify } from "@/lib/notify";
import { supabase } from '@/lib/supabaseClient';
import { cn } from '@/lib/utils';

interface WorkQueueBulkActionsProps {
  selectedIds: Set<string>;
  totalCount: number;
  onDeselectAll: () => void;
  onSelectAll: () => void;
  /**
   * G0: route bulk "mark done" through the same per-item handler used by
   * WorkQueuePanel so review_checkin side-effects (stamp reviewed_at, notify
   * founder) are not bypassed by a raw update. Handler MUST throw on failure
   * so the loop can report an accurate success count; a swallowed error would
   * silently mislead the operator. When called in bulk, per-item side effects
   * like navigate() must be suppressed.
   */
  onMarkDoneItem?: (id: string, opts?: { bulk?: boolean }) => Promise<void>;
}

export function WorkQueueBulkActions({
  selectedIds,
  totalCount,
  onDeselectAll,
  onSelectAll,
  onMarkDoneItem,
}: WorkQueueBulkActionsProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const selectedCount = selectedIds.size;
  const allSelected = totalCount > 0 && selectedCount === totalCount;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['work-queue'] });
    queryClient.invalidateQueries({ queryKey: ['work-queue-stats'] });
  };

  const handleMarkDone = async () => {
    setIsLoading(true);
    try {
      let succeeded = 0;
      let failed = 0;
      if (onMarkDoneItem) {
        // Sequential to keep side-effects ordered. Track per-item outcome —
        // never report a blanket success count.
        for (const id of Array.from(selectedIds)) {
          try {
            await onMarkDoneItem(id, { bulk: true });
            succeeded += 1;
          } catch (err) {
            failed += 1;
          }
        }
      } else {
        const { error } = await supabase
          .from('staff_work_queue_items')
          .update({ status: 'done' })
          .in('id', Array.from(selectedIds));
        if (error) throw error;
        succeeded = selectedCount;
      }
      if (succeeded > 0) notify.success(t('workQueue.bulkMarkedDone', { count: succeeded }));
      if (failed > 0) notify.error(t('workQueue.bulkPartialFailure', { count: failed, defaultValue: `${failed} item(ns) falharam` }));
      onDeselectAll();
      invalidate();
    } catch (e) {
      const msg = e instanceof Error ? e.message : t('workQueue.updateFailed');
      notify.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSnooze = async (days: number) => {
    setIsLoading(true);
    try {
      const snoozedUntil = new Date();
      snoozedUntil.setDate(snoozedUntil.getDate() + days);
      const { error } = await supabase
        .from('staff_work_queue_items')
        .update({ status: 'snoozed', snoozed_until: snoozedUntil.toISOString() })
        .in('id', Array.from(selectedIds));
      if (error) throw error;
      notify.success(t('workQueue.bulkSnoozed', { count: selectedCount, days }));
      onDeselectAll();
      invalidate();
    } catch (e) {
      notify.error(t('workQueue.snoozeFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        'fixed bottom-4 left-1/2 -translate-x-1/2 z-50',
        'bg-background border shadow-lg rounded-lg px-4 py-3',
        'flex items-center gap-3 animate-fade-in flex-wrap max-w-[calc(100vw-2rem)]'
      )}
      role="toolbar"
      aria-label={t('workQueue.bulkToolbar')}
    >
      <div className="flex items-center gap-2">
        <Checkbox
          checked={allSelected}
          onCheckedChange={() => (allSelected ? onDeselectAll() : onSelectAll())}
          aria-label={t('workQueue.selectAll')}
        />
        <Badge variant="secondary">
          {t('workQueue.selectedCount', { count: selectedCount })}
        </Badge>
      </div>

      <div className="h-6 w-px bg-border" />

      <Button variant="outline" size="sm" onClick={handleMarkDone} disabled={isLoading} loading={isLoading}>
        <CheckCircle2 className="h-4 w-4 mr-1" />
        {t('workQueue.markDone')}
      </Button>

      <Button variant="outline" size="sm" onClick={() => handleSnooze(1)} disabled={isLoading}>
        <Clock className="h-4 w-4 mr-1" />
        {t('workQueue.snooze1Day')}
      </Button>

      <Button variant="outline" size="sm" onClick={() => handleSnooze(7)} disabled={isLoading}>
        <Calendar className="h-4 w-4 mr-1" />
        {t('workQueue.snooze7Days')}
      </Button>

      {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}

      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={onDeselectAll}
        aria-label={t('workQueue.clearSelection')}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
