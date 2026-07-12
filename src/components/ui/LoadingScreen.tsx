import { useTranslation } from 'react-i18next';

/**
 * Shared full-viewport loading screen.
 * Used by both <ProtectedRoute> auth-loading and the top-level Suspense fallback
 * so protected navigations don't flash two visually different spinners in a row.
 */
export function LoadingScreen({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-background"
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
        <p className="text-sm text-muted-foreground animate-pulse">
          {label ?? t('common.loading', { defaultValue: 'Loading...' })}
        </p>
      </div>
    </div>
  );
}

export default LoadingScreen;
