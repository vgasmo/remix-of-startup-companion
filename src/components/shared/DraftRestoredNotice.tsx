import { useTranslation } from 'react-i18next';
import { History, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  onDiscard: () => void;
  className?: string;
}

/**
 * Discreet inline notice shown when `useLocalFormDraft` restored a draft.
 * Gives the user an explicit way to throw the recovered content away.
 */
export function DraftRestoredNotice({ onDiscard, className }: Props) {
  const { t } = useTranslation();
  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground ${className ?? ''}`}
      role="status"
    >
      <History className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="flex-1">
        {t('common.draftRestored', 'Rascunho recuperado — continue de onde ficou.')}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={onDiscard}
      >
        <X className="h-3 w-3 mr-1" aria-hidden />
        {t('common.discardDraft', 'Descartar rascunho')}
      </Button>
    </div>
  );
}
