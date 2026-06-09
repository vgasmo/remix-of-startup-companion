import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ActionItemCard } from './ActionItemCard';
import type { ActionItem } from '@/hooks/useActionItems';
import type { ActionDeliverable } from '@/hooks/useActionDeliverables';
import type { Database } from '@/integrations/supabase/types';

type ActionStatus = Database['public']['Enums']['action_status'];

const STATUS_CONFIG: Record<ActionStatus, { labelKey: string; color: string }> = {
  pending: { labelKey: 'actions.statusOpen', color: 'bg-muted text-muted-foreground' },
  in_progress: { labelKey: 'actions.statusDoing', color: 'bg-primary/20 text-primary' },
  completed: { labelKey: 'actions.statusDone', color: 'bg-[hsl(var(--success))]/10 text-[hsl(var(--success))] ' },
  cancelled: { labelKey: 'actions.statusCancelled', color: 'bg-muted text-muted-foreground line-through' },
};

export interface KanbanColumnProps {
  title: string;
  count: number;
  items: ActionItem[];
  status: ActionStatus;
  canWrite: boolean;
  isStaff: boolean;
  deliverablesByAction?: Record<string, ActionDeliverable[]>;
  onStatusChange: (item: ActionItem, status: ActionStatus) => void;
  onDueDateChange: (item: ActionItem, date: Date | undefined) => void;
  onDelete: (item: ActionItem) => void;
  onAddDeliverable?: (actionId: string, deliverable: { title: string; type: string; external_url?: string }) => void;
  onCompleteDeliverable?: (id: string, actionId: string) => void;
}

export const KanbanColumn = memo(function KanbanColumn({ 
  title, count, items, status, canWrite, isStaff, deliverablesByAction, onStatusChange, onDueDateChange, onDelete, onAddDeliverable, onCompleteDeliverable,
}: KanbanColumnProps) {
  const { t } = useTranslation();
  const config = STATUS_CONFIG[status];
  
  return (
    <Card className="bg-muted/20">
      <CardHeader className="py-3 px-4">
        <CardTitle className="flex items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-xs font-semibold ${config.color}`}>{title}</span>
          </span>
          <span className="text-muted-foreground font-normal">{count}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pb-3 space-y-2 max-h-[600px] overflow-y-auto">
        {items.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">{t('actions.noItems', 'Sem ações')}</div>
        ) : (
          items.map(item => (
            <ActionItemCard key={item.id} item={item} canWrite={canWrite} isStaff={isStaff}
              deliverables={deliverablesByAction?.[item.id] || []}
              onStatusChange={onStatusChange} onDueDateChange={onDueDateChange} onDelete={onDelete}
              onAddDeliverable={onAddDeliverable} onCompleteDeliverable={onCompleteDeliverable}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
});
