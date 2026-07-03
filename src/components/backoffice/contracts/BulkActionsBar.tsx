import { useTranslation } from 'react-i18next';
import { Ban, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface BulkActionsBarProps {
  selectedCount: number;
  /** Terminates selected contracts (status='terminated'). Historically mislabeled as "archive". */
  onArchive: () => void;
  onClearSelection: () => void;
  isArchiving: boolean;
}

export function BulkActionsBar({ selectedCount, onArchive, onClearSelection, isArchiving }: BulkActionsBarProps) {
  const { t } = useTranslation();

  if (selectedCount === 0) return null;

  return (
    <div className="sticky top-2 z-20 flex items-center gap-3 p-3 bg-primary/10 backdrop-blur supports-[backdrop-filter]:bg-primary/10 border border-primary/30 rounded-lg shadow-sm animate-in slide-in-from-top-2">
      <Badge variant="secondary" className="text-sm">
        {t('contracts.bulk.selected', { count: selectedCount, defaultValue: '{{count}} selected' })}
      </Badge>
      <div className="flex-1" />
      <Button
        variant="outline"
        size="sm"
        className="gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
        onClick={onArchive}
        disabled={isArchiving}
      >
        <Ban className="h-4 w-4" />
        {t('contracts.bulk.terminateSelected', { defaultValue: 'Terminar selecionados' })}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={onClearSelection}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
