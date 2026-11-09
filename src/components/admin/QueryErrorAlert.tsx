import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

/** Shown when a read failed. Never present a failed read as an empty list or as "0". */
export function QueryErrorAlert({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const { t } = useTranslation();
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{t('admin.loadFailed.title', 'Não foi possível carregar os dados')}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>{message ?? t('admin.loadFailed.hint', 'Os valores apresentados podem estar incompletos. Verifique a ligação e tente novamente.')}</span>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry}>
            {t('common.retry', 'Tentar novamente')}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
