/**
 * Centralized session reset — single source of truth for clearing
 * all user-specific runtime state on logout or user switch.
 * 
 * Called from AuthContext.signOut() and user-switch detection.
 */

import { QueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';

/** Keys persisted by the cache layer */
const CACHE_KEY = 'sl-query-cache';
const CACHE_USER_KEY = 'sl-cache-uid';

/** Prefixes for user-specific localStorage keys that must be cleared */
const USER_KEY_PREFIXES = [
  'quickkpi-dismissed-',
  'founder_',
  'shown_quickguide_',
  'sl-',
  // Legacy key (no user id) of the investor template drafts; current ones use `sl-investor-draft:<uid>:<tpl>`
  'investor_template_draft_',
];

/** Keys that are always safe to keep (not user-specific) */
const KEEP_KEYS = new Set([
  'theme',
  'i18nextLng',
  'vite-ui-theme',
]);

export function resetSession(queryClient: QueryClient, reason: 'logout' | 'user_switch' | 'cache_mismatch') {
  logger.info('session_reset', { reason });

  // 1. Clear persisted query cache
  try {
    localStorage.removeItem(CACHE_KEY);
    localStorage.removeItem(CACHE_USER_KEY);
  } catch { /* ignore */ }

  // 2. Clear user-specific localStorage keys
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || KEEP_KEYS.has(key)) continue;
      if (USER_KEY_PREFIXES.some(prefix => key.startsWith(prefix))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }

  // 3. Clear sessionStorage (entirely user-scoped)
  try {
    sessionStorage.clear();
  } catch { /* ignore */ }

  // 4. Wipe all in-memory query cache
  queryClient.clear();
}

/**
 * Validates that the persisted cache belongs to the given user.
 * Returns true if safe to hydrate, false if cache was cleared.
 */
export function validateCacheOwnership(userId: string): boolean {
  try {
    const cachedUid = localStorage.getItem(CACHE_USER_KEY);
    if (cachedUid && cachedUid !== userId) {
      logger.warn('cache_owner_mismatch', { cachedUid: cachedUid.slice(0, 8), currentUid: userId.slice(0, 8) });
      localStorage.removeItem(CACHE_KEY);
      localStorage.removeItem(CACHE_USER_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Stamps the current user as the cache owner.
 */
export function setCacheOwner(userId: string) {
  try {
    localStorage.setItem(CACHE_USER_KEY, userId);
  } catch { /* ignore */ }
}
