import { useTranslation } from 'react-i18next';
import { clickableProps } from '@/lib/clickable';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronRight, AlertTriangle, GripVertical, Flame, ThermometerSun, Snowflake } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/dateUtils';
import { useCrmPipeline } from '@/hooks/useCrmPipeline';
import { calculateLeadScore } from './LeadScoreCard';
import { useUpdateFunnelItem } from '@/hooks/useFunnel';
import { useConsultors } from '@/hooks/useWorkspaceOwner';
import { CrmBulkActions } from './CrmBulkActions';
import { useState, useMemo, useCallback } from 'react';
import {
  SIMPLE_PIPELINE_STAGES,
  SIMPLE_STAGE_SOURCES,
  STAGE_TO_SIMPLE,
  STAGE_LABELS,
  type SimplePipelineStage,
} from '@/constants/funnelStages';
import { notify } from "@/lib/notify";
import type { CrmInboxItem } from '@/hooks/useCrmInbox';
import type { FunnelStage } from '@/hooks/useFunnel';

// intentional: pipeline stage palette — distinct hue per CRM funnel stage, not state semantics
// Simplified stage visual config
const SIMPLE_STAGE_CONFIG: Record<SimplePipelineStage, { color: string; bgColor: string }> = {
  lead: { color: 'text-slate-700 dark:text-slate-300', bgColor: 'bg-slate-100 dark:bg-slate-800' },
  qualified: { color: 'text-purple-700 dark:text-purple-300', bgColor: 'bg-purple-50 dark:bg-purple-900/30' },
  proposal_negotiation: { color: 'text-amber-700 dark:text-amber-300', bgColor: 'bg-amber-50 dark:bg-amber-900/30' },
  contracting_in_progress: { color: 'text-cyan-700 dark:text-cyan-300', bgColor: 'bg-cyan-50 dark:bg-cyan-900/30' },
  signature_in_progress: { color: 'text-lime-700 dark:text-lime-300', bgColor: 'bg-lime-50 dark:bg-lime-900/30' },
  contracted: { color: 'text-green-700 dark:text-green-300', bgColor: 'bg-green-50 dark:bg-green-900/30' },
  archived_or_lost: { color: 'text-muted-foreground', bgColor: 'bg-muted' },
};

interface PipelineViewProps {
  programFilter?: string;
  assigneeFilter?: string;
  searchQuery?: string;
  myItemsOnly?: boolean;
  currentUserId?: string;
  onOpenDrawer: (item: CrmInboxItem) => void;
}

export function PipelineView({
  programFilter,
  assigneeFilter,
  searchQuery,
  myItemsOnly,
  currentUserId,
  onOpenDrawer,
}: PipelineViewProps) {
  const { t } = useTranslation();
  const [activeItem, setActiveItem] = useState<CrmInboxItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: pipeline, isLoading } = useCrmPipeline({
    programId: programFilter !== 'all' ? programFilter : undefined,
    assigneeId: assigneeFilter !== 'all' ? assigneeFilter : undefined,
    search: searchQuery || undefined,
    myItemsOnly,
    currentUserId,
  });

  const { data: consultants = [] } = useConsultors();

  const updateFunnelItem = useUpdateFunnelItem();

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Group all pipeline items by simplified stage
  const groupedBySimple = useMemo(() => {
    const groups: Record<SimplePipelineStage, CrmInboxItem[]> = {} as any;
    SIMPLE_PIPELINE_STAGES.forEach(s => { groups[s] = []; });

    if (!pipeline) return groups;

    // pipeline is keyed by fine-grained stage
    Object.entries(pipeline).forEach(([stage, items]) => {
      const simple = STAGE_TO_SIMPLE[stage as FunnelStage];
      if (simple && groups[simple]) {
        groups[simple].push(...(items as CrmInboxItem[]));
      }
    });

    return groups;
  }, [pipeline]);

  // All hooks MUST be declared before any conditional return — moved up from
  // below the loading guard to fix "Rendered more hooks than during the
  // previous render" when transitioning from skeleton → loaded.
  const flatItems = useMemo(
    () => Object.values(groupedBySimple).flat(),
    [groupedBySimple],
  );
  const selectAll = useCallback(
    () => setSelectedIds(new Set(flatItems.map((i) => i.id))),
    [flatItems],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: 200,
        tolerance: 5,
      },
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    for (const items of Object.values(groupedBySimple)) {
      const item = items.find(i => i.id === active.id);
      if (item) {
        setActiveItem(item);
        break;
      }
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);

    if (!over) return;

    const itemId = active.id as string;
    const targetSimple = over.id as SimplePipelineStage;

    // Find the item's current stage
    let currentItem: CrmInboxItem | null = null;
    for (const items of Object.values(groupedBySimple)) {
      const found = items.find(i => i.id === itemId);
      if (found) { currentItem = found; break; }
    }
    if (!currentItem) return;

    const currentSimple = STAGE_TO_SIMPLE[currentItem.stage as FunnelStage];
    if (currentSimple === targetSimple) return;

    // Map simplified stage to its first fine-grained stage as default target
    const targetFineStages = SIMPLE_STAGE_SOURCES[targetSimple];
    if (!targetFineStages?.length) return;
    const newStage = targetFineStages[0] as FunnelStage;

    const previousStage = currentItem.stage;
    try {
      await updateFunnelItem.mutateAsync({
        id: itemId,
        stage: newStage,
      });
      const stageLabel = t(`pipeline.simple.${targetSimple}`, targetSimple);
      notify.success(
        t('crm.movedTo', { stage: stageLabel, defaultValue: `Movido para ${stageLabel}` }),
        {
          action: {
            label: t('common.undo', { defaultValue: 'Desfazer' }),
            onClick: () => {
              updateFunnelItem.mutate({ id: itemId, stage: previousStage as FunnelStage });
            },
          },
        }
      );
    } catch (error) {
      notify.error(t('crm.moveError', { defaultValue: 'Erro ao mover lead' }));
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <div className="h-4 w-24 bg-muted animate-pulse rounded" />
          <div className="h-3 w-32 bg-muted animate-pulse rounded" />
        </div>
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {SIMPLE_PIPELINE_STAGES.map(i => (
              <div key={i} className="w-72 flex-shrink-0">
                <div className="h-[500px] bg-muted/30 rounded-xl animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const totalItems = Object.values(groupedBySimple).reduce((sum, items) => sum + items.length, 0);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t('crm.totalLeads')}: {totalItems}</span>
          <span className="text-xs">{t('crm.dragDropHint', 'Arraste cards para mudar fase')}</span>
        </div>

        <CrmBulkActions
          items={flatItems}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onSelectAll={selectAll}
          onClearSelection={clearSelection}
          consultants={consultants.map((c) => ({ id: c.id, full_name: c.full_name }))}
        />

        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {SIMPLE_PIPELINE_STAGES.map(simpleStage => (
              <PipelineColumn
                key={simpleStage}
                simpleStage={simpleStage}
                items={groupedBySimple[simpleStage] || []}
                config={SIMPLE_STAGE_CONFIG[simpleStage]}
                onOpenDrawer={onOpenDrawer}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>
        </div>
      </div>

      <DragOverlay dropAnimation={{
        duration: 200,
        easing: 'cubic-bezier(0.2, 0, 0, 1)',
      }}>
        {activeItem && (
          <DragCard item={activeItem} />
        )}
      </DragOverlay>
    </DndContext>
  );
}

interface PipelineColumnProps {
  simpleStage: SimplePipelineStage;
  items: CrmInboxItem[];
  config: { color: string; bgColor: string };
  onOpenDrawer: (item: CrmInboxItem) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

function PipelineColumn({ simpleStage, items, config, onOpenDrawer, selectedIds, onToggleSelect }: PipelineColumnProps) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({
    id: simpleStage,
  });

  return (
    <div className="w-72 flex-shrink-0">
      <Card 
        ref={setNodeRef}
        className={cn(
          'h-full border-0 shadow-sm transition-all duration-200',
          config.bgColor,
          isOver && 'ring-2 ring-primary ring-offset-2 scale-[1.01]'
        )}
      >
        <CardHeader className="py-3 px-4">
          <CardTitle className={cn('text-sm font-semibold flex items-center justify-between', config.color)}>
            <span>{t(`pipeline.simple.${simpleStage}`, simpleStage)}</span>
            <Badge 
              variant="secondary" 
              className={cn('text-xs font-medium', config.color, 'bg-background/80')}
            >
              {items.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 pt-0">
          <ScrollArea className="h-[calc(100vh-320px)] min-h-[400px]">
            {items.length === 0 ? (
              <div className="p-6 text-center">
                <div className="h-8 w-8 mx-auto mb-2 rounded-full bg-muted/50 flex items-center justify-center">
                  <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                </div>
                <p className="text-xs text-muted-foreground">{t('crm.dragLeadsHere', { defaultValue: 'Arraste leads para aqui' })}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map(item => (
                  <DraggableCard 
                    key={item.id} 
                    item={item} 
                    onOpenDrawer={onOpenDrawer}
                    isSelected={selectedIds.has(item.id)}
                    onToggleSelect={onToggleSelect}
                  />
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

interface DraggableCardProps {
  item: CrmInboxItem;
  onOpenDrawer: (item: CrmInboxItem) => void;
  isSelected: boolean;
  onToggleSelect: (id: string) => void;
}

function DraggableCard({ item, onOpenDrawer, isSelected, onToggleSelect }: DraggableCardProps) {
  const { t } = useTranslation();
  const now = new Date();
  const isOverdue = item.next_action_at && new Date(item.next_action_at) < now;
  const { temperature, totalScore } = calculateLeadScore(item);

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });

  const style: React.CSSProperties | undefined = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;

    // Show fine-grained sub-stage as small badge
    const subStageLabel = STAGE_LABELS[item.stage as FunnelStage];

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        'cursor-pointer bg-background border shadow-sm',
        'transition-[box-shadow,border-color,opacity] duration-150 ease-out',
        'hover:shadow-md hover:border-primary/20',
        isOverdue && 'border-l-2 border-l-amber-500',
        isSelected && 'ring-2 ring-primary border-primary/40',
        isDragging && 'opacity-0'
      )}
      data-testid="crm-record"
      onClick={() => onOpenDrawer(item)}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div
            className="pt-0.5 shrink-0"
            {...clickableProps((e) => e.stopPropagation())}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelect(item.id)}
              aria-label={t('crm.bulk.selectLead', { defaultValue: 'Selecionar lead' })}
            />
          </div>
          <div
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing p-1 -ml-1 -mt-0.5 hover:bg-muted rounded shrink-0 touch-none"
            {...clickableProps((e) => e.stopPropagation())}
            aria-label={t('crm.dragToMove', { defaultValue: 'Arrastar para mover' })}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium line-clamp-2 flex-1">
                {item.organization_name || item.contact_name || t('crm.unnamed')}
              </p>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            </div>
            
            {item.contact_email && (
              <p className="text-xs text-muted-foreground truncate mt-1">
                {item.contact_email}
              </p>
            )}

            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <div className={cn(
                'flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                temperature === 'hot' && 'bg-destructive/10 text-destructive ',
                temperature === 'warm' && 'bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))] ',
                temperature === 'cold' && 'bg-[hsl(var(--info))]/10 text-[hsl(var(--info))] ',
              )}>
                {temperature === 'hot' && <Flame className="h-3 w-3" />}
                {temperature === 'warm' && <ThermometerSun className="h-3 w-3" />}
                {temperature === 'cold' && <Snowflake className="h-3 w-3" />}
                {totalScore}
              </div>

              {subStageLabel && (
                <Badge variant="outline" className="text-[9px] h-4 px-1">
                  {subStageLabel}
                </Badge>
              )}

              {item.owner && (
                <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                  {item.owner.full_name?.split(' ')[0] || t('crm.unassigned')}
                </Badge>
              )}
              
              {item.next_action_at && (
                <span className={cn(
                  'text-[10px] flex items-center gap-1',
                  isOverdue ? 'text-[hsl(var(--warning))] font-medium' : 'text-muted-foreground'
                )}>
                  {isOverdue && <AlertTriangle className="h-3 w-3" />}
                  {formatRelativeTime(item.next_action_at)}
                </span>
              )}
            </div>

            {item.next_action_description && (
              <p className="text-[10px] text-muted-foreground line-clamp-1 mt-2 italic">
                "{item.next_action_description}"
              </p>
            )}

            {item.program && (
              <Badge variant="secondary" className="text-[9px] h-4 px-1 mt-2">
                {item.program.name}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DragCard({ item }: { item: CrmInboxItem }) {
  const { t } = useTranslation();
  const now = new Date();
  const isOverdue = item.next_action_at && new Date(item.next_action_at) < now;

  return (
    <Card
      className={cn(
        'w-68 cursor-grabbing',
        'bg-background border shadow-lg',
        'ring-1 ring-primary/30',
        isOverdue && 'border-l-2 border-l-amber-500'
      )}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <GripVertical className="h-4 w-4 text-primary/50 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium line-clamp-2">
              {item.organization_name || item.contact_name || t('crm.unnamed')}
            </p>
            {item.contact_email && (
              <p className="text-xs text-muted-foreground truncate mt-1">
                {item.contact_email}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
