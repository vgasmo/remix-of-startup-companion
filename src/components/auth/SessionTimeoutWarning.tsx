import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabaseClient';
import { logger } from '@/lib/logger';

const ACTIVITY_KEY = 'sl-last-activity';

interface SessionTimeoutWarningProps {
  warningTimeMs?: number; // Time before timeout to show warning (default: 10 minutes)
  timeoutMs?: number; // Total inactivity timeout (default: 8 hours)
}

export function SessionTimeoutWarning({
  warningTimeMs = 10 * 60 * 1000, // 10 minutes warning
  timeoutMs = 8 * 60 * 60 * 1000,
}: SessionTimeoutWarningProps) {
  const { t } = useTranslation();
  const { signOut, session } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(0);
  // Activity is shared across tabs through localStorage (prefix `sl-` is wiped on
  // logout). Without it, an idle background tab signs the user out GLOBALLY
  // (supabase.auth.signOut() default scope) while they work in another tab.
  const lastActivityRef = useRef(Date.now());
  const showWarningRef = useRef(false);
  const expiredRef = useRef(false);
  showWarningRef.current = showWarning;

  const readSharedActivity = () => {
    try { return Number(localStorage.getItem(ACTIVITY_KEY)) || 0; } catch { return 0; }
  };

  const touch = useCallback(() => {
    const now = Date.now();
    lastActivityRef.current = now;
    try { localStorage.setItem(ACTIVITY_KEY, String(now)); } catch { /* storage unavailable */ }
  }, []);

  const resetActivity = useCallback(() => {
    touch();
    setShowWarning(false);
  }, [touch]);

  // Attempt to refresh the session gracefully
  const refreshSession = useCallback(async () => {
    try {
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        logger.error('Session refresh failed', {}, error);
        return false;
      }
      return true;
    } catch (err) {
      logger.error('Session refresh error', {}, err);
      return false;
    }
  }, []);

  // Track user activity (ref + throttled storage write: no re-render per mousemove)
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    const handleActivity = () => {
      if (showWarningRef.current) return;
      if (Date.now() - lastActivityRef.current > 5000) touch();
    };
    events.forEach(event => document.addEventListener(event, handleActivity, { passive: true }));
    touch();
    return () => {
      events.forEach(event => document.removeEventListener(event, handleActivity));
    };
  }, [touch]);

  // Check for timeout
  useEffect(() => {
    const checkTimeout = setInterval(() => {
      const last = Math.max(lastActivityRef.current, readSharedActivity());
      const timeUntilTimeout = timeoutMs - (Date.now() - last);

      if (timeUntilTimeout <= 0) {
        // Session timed out - sign out gracefully
        if (!expiredRef.current) {
          expiredRef.current = true;
          void signOut();
        }
      } else if (timeUntilTimeout <= warningTimeMs) {
        setShowWarning(true);
        setCountdown(Math.max(0, Math.ceil(timeUntilTimeout / 1000)));
      } else if (showWarningRef.current) {
        // Another tab renewed the session: dismiss the stale warning here.
        setShowWarning(false);
      }
    }, 1000);

    return () => clearInterval(checkTimeout);
  }, [timeoutMs, warningTimeMs, signOut]);

  // Proactively refresh session periodically to prevent 401s
  useEffect(() => {
    // Refresh every 50 minutes to stay ahead of token expiry
    const refreshInterval = setInterval(async () => {
      if (session) {
        await refreshSession();
      }
    }, 50 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, [session, refreshSession]);

  const handleContinue = async () => {
    // Refresh session when user clicks continue
    if (await refreshSession()) resetActivity();
  };

  const handleLogout = () => {
    signOut();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <AlertDialog open={showWarning} onOpenChange={setShowWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-[hsl(var(--warning))]" />
            {t('sessionTimeout.title', 'Session Timeout Warning')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('sessionTimeout.description', 'Your session will expire in {{time}} due to inactivity.', { time: formatTime(countdown) })}
            <br /><br />
            {t('sessionTimeout.clickContinue', 'Click "Continue Session" to stay logged in.')}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleLogout}>
            {t('sessionTimeout.logOut', 'Log Out')}
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleContinue}>
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('sessionTimeout.continue', 'Continue Session')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
