import { useState, useCallback } from 'react';
import { Check, Trash2, MoreHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface BulkActionsBarProps<T> {
  items: T[];
  selectedIds: Set<string>;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onDelete?: (ids: string[]) => Promise<void>;
  onStatusChange?: (ids: string[], status: string) => Promise<void>;
  statusOptions?: { value: string; label: string }[];
  getItemId: (item: T) => string;
  className?: string;
}

export function BulkActionsBar<T>({
  items,
  selectedIds,
  onSelectAll,
  onDeselectAll,
  onDelete,
  onStatusChange,
  statusOptions,
  getItemId,
  className,
}: BulkActionsBarProps<T>) {
  const [isLoading, setIsLoading] = useState(false);
  const selectedCount = selectedIds.size;
  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < items.length;

  const handleDelete = useCallback(async () => {
    if (!onDelete || selectedIds.size === 0) return;
    setIsLoading(true);
    try {
      await onDelete(Array.from(selectedIds));
      onDeselectAll();
    } finally {
      setIsLoading(false);
    }
  }, [onDelete, selectedIds, onDeselectAll]);

  const handleStatusChange = useCallback(async (status: string) => {
    if (!onStatusChange || selectedIds.size === 0) return;
    setIsLoading(true);
    try {
      await onStatusChange(Array.from(selectedIds), status);
      onDeselectAll();
    } finally {
      setIsLoading(false);
    }
  }, [onStatusChange, selectedIds, onDeselectAll]);

  if (selectedCount === 0) return null;

  return (
    <div className={cn(
      'fixed bottom-4 left-1/2 -translate-x-1/2 z-50',
      'bg-background border shadow-lg rounded-lg px-4 py-3',
      'flex items-center gap-4 animate-fade-in',
      className
    )}>
      <div className="flex items-center gap-2">
        <Checkbox
          checked={allSelected}
          onCheckedChange={() => allSelected ? onDeselectAll() : onSelectAll()}
          className="data-[state=indeterminate]:bg-primary"
          {...(someSelected && { 'data-state': 'indeterminate' })}
        />
        <Badge variant="secondary">
          {selectedCount} selected
        </Badge>
      </div>

      <div className="h-6 w-px bg-border" />

      {statusOptions && onStatusChange && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={isLoading}>
              <Check className="h-4 w-4 mr-1" />
              Set Status
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {statusOptions.map(option => (
              <DropdownMenuItem 
                key={option.value}
                onClick={() => handleStatusChange(option.value)}
              >
                {option.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {onDelete && (
        <Button 
          variant="destructive" 
          size="sm" 
          onClick={handleDelete}
          disabled={isLoading}
        >
          <Trash2 className="h-4 w-4 mr-1" />
          Delete
        </Button>
      )}

      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8"
        onClick={onDeselectAll}
       aria-label="Close">
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

// Hook for managing bulk selection
export function useBulkSelection<T>(items: T[], getItemId: (item: T) => string) {
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
    setSelectedIds(new Set(items.map(getItemId)));
  }, [items, getItemId]);

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
