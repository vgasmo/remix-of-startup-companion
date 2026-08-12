/**
 * Lightweight local draft persistence for plain forms (P0.1c).
 *
 * Why this exists
 * ---------------
 * Only three surfaces had autosave (`useContractDraftAutosave`,
 * `useTemplateDraftAutosave`, `useSingleFlightDraft`). Every other form lost
 * everything the user had typed whenever:
 *   - a deploy renamed a chunk and `lazyWithRetry` reloaded the tab, or
 *   - the browser discarded the tab (Chrome Memory Saver / Edge sleeping tabs)
 *     while the user was working in another window.
 *
 * This hook is deliberately *local only* — it never touches the server. It
 * mirrors the flush semantics of the existing hooks:
 *   - debounced write while typing,
 *   - guaranteed write on `visibilitychange` (hidden) and `pagehide`,
 *   - `beforeunload` guard while there is unsaved content,
 *   - restore-on-open with a discreet notice.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { logger } from '@/lib/logger';

const PREFIX = 'sl-draft:';

export interface UseLocalFormDraftOptions<T> {
  /** Stable key for this form instance (e.g. `new-lead`, `session:<wsId>`). */
  key: string | null | undefined;
  /** Current form value. */
  value: T;
  /** Called once when a stored draft is found. */
  onRestore: (draft: T) => void;
  /** True when the value holds content worth preserving. */
  isDirty: (value: T) => boolean;
  /** Skip everything (e.g. dialog closed). Default false. */
  disabled?: boolean;
  /** Debounce for the periodic write. Default 700ms. */
  debounceMs?: number;
}

export function useLocalFormDraft<T>({
  key,
  value,
  onRestore,
  isDirty,
  disabled = false,
  debounceMs = 700,
}: UseLocalFormDraftOptions<T>) {
  const storageKey = key ? `${PREFIX}${key}` : null;
  const [restored, setRestored] = useState(false);
  const hydratedFor = useRef<string | null>(null);

  // Keep the latest value/predicate in refs so event listeners stay stable.
  const valueRef = useRef(value);
  valueRef.current = value;
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;

  const write = useCallback(() => {
    if (!storageKey) return;
    try {
      if (dirtyRef.current(valueRef.current)) {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ data: valueRef.current, updatedAt: new Date().toISOString() }),
        );
      } else {
        localStorage.removeItem(storageKey);
      }
    } catch (e) {
      logger.warn('local_form_draft_write_failed', { key: storageKey });
    }
  }, [storageKey]);

  const clear = useCallback(() => {
    if (!storageKey) return;
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    setRestored(false);
    hydratedFor.current = storageKey;
  }, [storageKey]);

  const dismissRestored = useCallback(() => setRestored(false), []);

  // Hydration — once per key, only while active.
  useEffect(() => {
    if (disabled || !storageKey) return;
    if (hydratedFor.current === storageKey) return;
    hydratedFor.current = storageKey;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { data?: T };
      if (parsed?.data == null) return;
      if (!dirtyRef.current(parsed.data)) {
        localStorage.removeItem(storageKey);
        return;
      }
      restoreRef.current(parsed.data);
      setRestored(true);
    } catch {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    }
  }, [disabled, storageKey]);

  // Reset hydration marker when the form goes inactive so reopening restores again.
  useEffect(() => {
    if (disabled) hydratedFor.current = null;
  }, [disabled]);

  // Debounced write while typing.
  useEffect(() => {
    if (disabled || !storageKey) return;
    const id = window.setTimeout(write, debounceMs);
    return () => window.clearTimeout(id);
  }, [disabled, storageKey, value, write, debounceMs]);

  // Guaranteed flush when the tab is hidden / discarded, plus unload guard.
  useEffect(() => {
    if (disabled || !storageKey) return;
    const onHide = () => write();
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') write();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      write();
      if (dirtyRef.current(valueRef.current)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onBeforeUnload);
      write();
    };
  }, [disabled, storageKey, write]);

  return { restored, clear, dismissRestored, flush: write };
}
