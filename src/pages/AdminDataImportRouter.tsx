// Feature-flag dispatcher between legacy AdminDataImport and v2.
// When `hubspot_importer_v2` is enabled (global or per-workspace override for
// admins), the new staged, server-side importer is served; otherwise the
// legacy component stays as-is for rollback safety.

import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeatureFlag, useFeatureFlags } from '@/hooks/useFeatureFlags';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

const Legacy = lazy(() => import('./AdminDataImport'));
const V2 = lazy(() => import('./AdminDataImportV2'));

export default function AdminDataImportRouter() {
  const { t } = useTranslation();
  const { data: flags, isError, refetch } = useFeatureFlags();
  const useV2 = useFeatureFlag('hubspot_importer_v2');
  // Sem flags (a carregar ou a 1.ª leitura falhou) não se monta nenhum importador:
  // escolher o antigo e trocar para o V2 depois desmontava o ecrã e perdia o ficheiro já carregado.
  if (!flags) {
    return isError ? (
      <div className="p-6 space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('admin.import.flagUnavailable', 'Não foi possível confirmar qual o importador ativo.')}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          {t('common.retry', 'Tentar novamente')}
        </Button>
      </div>
    ) : (
      <div className="p-6"><Skeleton className="h-40 w-full" /></div>
    );
  }
  const Comp = useV2 ? V2 : Legacy;
  return (
    <Suspense fallback={<div className="p-6"><Skeleton className="h-40 w-full" /></div>}>
      <Comp />
    </Suspense>
  );
}
