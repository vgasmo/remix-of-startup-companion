import { useState, useEffect, useCallback } from 'react';
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

interface SessionTimeoutWarningProps {
  warningTimeMs?: number; // Time before timeout to show warning (default: 10 minutes)
  timeoutMs?: number; // Total inactivity timeout (default: 24 hours for founders)
}

export function SessionTimeoutWarning({
  warningTimeMs = 10 * 60 * 1000, // 10 minutes warning
  timeoutMs = 24 * 60 * 60 * 1000, // 24 hours (founder-friendly)
}: SessionTimeoutWarningProps) {
  const { t } = useTranslation();
  const { signOut, session } = useAuth();
  const [showWarning, setShowWarning] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [lastActivity, setLastActivity] = useState(Date.now());

  const resetActivity = useCallback(() => {
    setLastActivity(Date.now());
    setShowWarning(false);
  }, []);

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

  // Track user activity
  useEffect(() => {
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    
    const handleActivity = () => {
      if (!showWarning) {
        setLastActivity(Date.now());
      }
    };

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
    };
  }, [showWarning]);

  // Check for timeout
  useEffect(() => {
    const checkTimeout = setInterval(() => {
      const now = Date.now();
      const timeSinceActivity = now - lastActivity;
      const timeUntilTimeout = timeoutMs - timeSinceActivity;

      if (timeUntilTimeout <= 0) {
        // Session timed out - sign out gracefully
        signOut();
      } else if (timeUntilTimeout <= warningTimeMs && !showWarning) {
        // Show warning
        setShowWarning(true);
        setCountdown(Math.ceil(timeUntilTimeout / 1000));
      }

      if (showWarning) {
        setCountdown(Math.max(0, Math.ceil(timeUntilTimeout / 1000)));
      }
    }, 1000);

    return () => clearInterval(checkTimeout);
  }, [lastActivity, timeoutMs, warningTimeMs, showWarning, signOut]);

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
    await refreshSession();
    resetActivity();
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
