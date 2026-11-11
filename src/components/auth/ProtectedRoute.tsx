import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useMentorNdaStatus } from '@/hooks/useMentorNdaStatus';
import { useFounderOnboardingState } from '@/hooks/useFounderOnboardingState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Button } from '@/components/ui/button';
import { SessionTimeoutWarning } from './SessionTimeoutWarning';
import { CommandPalette } from '@/components/command/CommandPalette';
import { BugReportWidget } from '@/components/support/BugReportWidget';

export function ProtectedRoute({ children, adminOnly = false, staffOnly = false }: { children: ReactNode; adminOnly?: boolean; staffOnly?: boolean }) {
  const { user, isLoading, isAuthReady, isAdmin, isStaff, isAccountPending, isAccountSuspended, authError, retryUserData, signOut } = useAuth();
  const { needsNda, isLoading: ndaLoading, verificationError, retryVerification } = useMentorNdaStatus();
  const founderState = useFounderOnboardingState();
  const location = useLocation();
  const { t } = useTranslation();

  if (isLoading || !isAuthReady || ndaLoading) {
    return <LoadingScreen />;
  }

  if (!user) {
    const returnTo = location.pathname + location.search + location.hash;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  // P0.3-bis: profile/roles could not be loaded — never render the app as if the
  // user had no permissions. Offer an explicit retry instead.
  if (authError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold">
          {t('auth.loadError.title', { defaultValue: 'Não foi possível carregar o seu perfil e permissões.' })}
        </p>
        <p className="text-sm text-muted-foreground">
          {t('auth.loadError.hint', { defaultValue: 'Verifique a ligação e tente novamente.' })}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button onClick={() => void retryUserData()}>
            {t('common.retry', { defaultValue: 'Tentar novamente' })}
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            {t('auth.signOut', { defaultValue: 'Terminar sessão' })}
          </Button>
        </div>
      </div>
    );
  }

  if (isAccountSuspended) {
    return <Navigate to="/suspended" replace />;
  }

  if (isAccountPending) {
    return <Navigate to="/pending-approval" replace />;
  }

  if (verificationError) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-lg font-semibold">{t('auth.loadError.title')}</p>
        <p className="text-sm text-muted-foreground">{t('auth.loadError.hint')}</p>
        <Button onClick={() => void retryVerification()}>{t('common.retry')}</Button>
      </div>
    );
  }

  if (needsNda && location.pathname !== '/mentor-nda') {
    return <Navigate to="/mentor-nda" replace />;
  }

  // Claim-first gate: founders without active workspace → /claim-startup.
  // No `/notifications` route exists — dead exemption removed. Add it back only
  // when a top-level page is introduced.
  const claimExemptPaths = [
    '/claim-startup',
    '/settings',
    '/my-workspaces',
    '/mentors',
    '/resources',
    '/help',
  ];
  const isPendingWorkspaceRoute =
    founderState.status === 'has_pending_workspace' && location.pathname.startsWith('/workspace/');
  if (
    !founderState.isLoading &&
    founderState.status !== 'not_founder' &&
    founderState.status !== 'staff_exempt' &&
    founderState.status !== 'has_active_workspace' &&
    founderState.status !== 'needs_onboarding' &&
    founderState.status !== 'error' &&
    !claimExemptPaths.some((p) => location.pathname === p || location.pathname.startsWith(p + '/')) &&
    !isPendingWorkspaceRoute
  ) {
    return <Navigate to="/claim-startup" replace />;
  }

  if (staffOnly && !isStaff) {
    return <Navigate to="/my-workspaces" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/my-workspaces" replace />;
  }

  return (
    <>
      <SessionTimeoutWarning timeoutMs={8 * 60 * 60 * 1000} warningTimeMs={10 * 60 * 1000} />
      <CommandPalette />
      <BugReportWidget />
      {children}
    </>
  );
}

