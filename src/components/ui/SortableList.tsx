import { useTranslation } from 'react-i18next';
import React from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SortableItem {
  id: string;
  [key: string]: any;
}

interface SortableListProps<T extends SortableItem> {
  items: T[];
  onReorder: (items: T[]) => void;
  renderItem: (item: T, index: number, dragHandle: React.ReactNode) => React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export function SortableList<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
  disabled = false,
  className,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      const reordered = arrayMove(items, oldIndex, newIndex);
      onReorder(reordered);
    }
  };

  if (disabled) {
    return (
      <div className={cn('space-y-2', className)}>
        {items.map((item, index) => renderItem(item, index, null))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
        <div className={cn('space-y-2', className)}>
          {items.map((item, index) => (
            <SortableItemWrapper key={item.id} id={item.id}>
              {(dragHandle) => renderItem(item, index, dragHandle)}
            </SortableItemWrapper>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

interface SortableItemWrapperProps {
  id: string;
  children: (dragHandle: React.ReactNode) => React.ReactNode;
}

function SortableItemWrapper({ id, children }: SortableItemWrapperProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 1 : 0,
  };

  const dragHandle = (
    <button
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded touch-none"
      aria-label={t('accessibility.dragReorder')}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style}>
      {children(dragHandle)}
    </div>
  );
}

// Simple drag handle component for use outside SortableList
export function DragHandle({ className }: { className?: string }) {
  return (
    <div className={cn('cursor-grab active:cursor-grabbing', className)}>
      <GripVertical className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}
