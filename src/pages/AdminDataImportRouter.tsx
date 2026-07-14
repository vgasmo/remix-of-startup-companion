// Feature-flag dispatcher between legacy AdminDataImport and v2.
// When `hubspot_importer_v2` is enabled (global or per-workspace override for
// admins), the new staged, server-side importer is served; otherwise the
// legacy component stays as-is for rollback safety.

import { lazy, Suspense } from 'react';
import { useFeatureFlag } from '@/hooks/useFeatureFlags';
import { Skeleton } from '@/components/ui/skeleton';

const Legacy = lazy(() => import('./AdminDataImport'));
const V2 = lazy(() => import('./AdminDataImportV2'));

export default function AdminDataImportRouter() {
  const useV2 = useFeatureFlag('hubspot_importer_v2', false);
  const Comp = useV2 ? V2 : Legacy;
  return (
    <Suspense fallback={<div className="p-6"><Skeleton className="h-40 w-full" /></div>}>
      <Comp />
    </Suspense>
  );
}
