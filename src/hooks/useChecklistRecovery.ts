import { useState, useCallback } from 'react';
import { safeLocalStorage } from '@/lib/safeStorage';

const CHECKLIST_DISMISSED_KEY = 'founder_checklist_dismissed';
const WELCOME_DISMISSED_KEY = 'founder_welcome_dismissed';

function scopedKey(base: string, userId?: string) {
  return userId ? `${base}_${userId}` : base;
}

/**
 * Hook to manage checklist dismiss state and provide recovery functionality.
 * Keys are scoped to user ID to avoid cross-user collision on shared browsers.
 */
export function useChecklistRecovery(userId?: string) {
  const checklistKey = scopedKey(CHECKLIST_DISMISSED_KEY, userId);
  const welcomeKey = scopedKey(WELCOME_DISMISSED_KEY, userId);

  const [dismissed, setDismissed] = useState(() => ({
    checklist: safeLocalStorage.getItem(checklistKey) === 'true',
    welcome: safeLocalStorage.getItem(welcomeKey) === 'true',
  }));

  const restoreChecklist = useCallback(() => {
    safeLocalStorage.removeItem(checklistKey);
    safeLocalStorage.removeItem(welcomeKey);
    setDismissed({ checklist: false, welcome: false });
  }, [checklistKey, welcomeKey]);

  const dismissChecklist = useCallback(() => {
    safeLocalStorage.setItem(checklistKey, 'true');
    setDismissed(prev => ({ ...prev, checklist: true }));
  }, [checklistKey]);

  const dismissWelcome = useCallback(() => {
    safeLocalStorage.setItem(welcomeKey, 'true');
    setDismissed(prev => ({ ...prev, welcome: true }));
  }, [welcomeKey]);

  return {
    isChecklistDismissed: dismissed.checklist,
    isWelcomeDismissed: dismissed.welcome,
    restoreChecklist,
    dismissChecklist,
    dismissWelcome,
    canRestore: dismissed.checklist || dismissed.welcome,
  };
}
