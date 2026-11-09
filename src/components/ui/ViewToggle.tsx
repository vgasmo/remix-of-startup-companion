import { LayoutGrid, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ViewMode = 'table' | 'card';

interface ViewToggleProps {
  view: ViewMode;
  onChange: (view: ViewMode) => void;
  className?: string;
}

export function ViewToggle({ view, onChange, className }: ViewToggleProps) {
  const { t } = useTranslation();
  return (
    <div className={cn('inline-flex rounded-lg border bg-muted p-1', className)} data-tour="view-toggle">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-8 px-3 rounded-md transition-all',
          view === 'table' && 'bg-primary/10 text-primary shadow-sm'
        )}
        onClick={() => onChange('table')}
      >
        <List className="h-4 w-4" />
        <span className="sr-only">{t('accessibility.tableView')}</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-8 px-3 rounded-md transition-all',
          view === 'card' && 'bg-primary/10 text-primary shadow-sm'
        )}
        onClick={() => onChange('card')}
      >
        <LayoutGrid className="h-4 w-4" />
        <span className="sr-only">{t('accessibility.cardView')}</span>
      </Button>
    </div>
  );
}
