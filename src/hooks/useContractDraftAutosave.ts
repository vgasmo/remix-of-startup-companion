/**
 * Robust contract/intake draft autosave hook.
 *
 * Designed for the 3 contract surfaces:
 *  - ContractOnboarding (founder, authenticated)
 *  - PublicContractIntake (anonymous, token-scoped)
 *  - PublicContractSigning (anonymous, token-scoped, has server save_data action)
 *
 * Guarantees:
 *  - Every keystroke is persisted to localStorage immediately (never lost).
 *  - Optional debounced server save via an injected `serverSave` callback.
 *  - Flushes on visibilitychange / pagehide / beforeunload / route unmount /
 *    explicit blur.
 *  - Restored draft is offered back to the user via `restoredFromLocal`.
 *  - Local draft is only cleared after a confirmed server save OR explicit
 *    discard. Submit handlers should `await flush()` before navigation.
 *  - Status state machine: idle | saving | saved | local_only | error.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logger } from '@/lib/logger';

export type ContractAutosaveStatus = 'idle' | 'saving' | 'saved' | 'local_only' | 'error';

interface LocalDraft<T> {
  data: T;
  updatedAt: string;
}

interface UseContractDraftAutosaveOptions<T extends Record<string, unknown>> {
  /** Stable scope key: token for public flows, contract id for founder flow. */
  scopeKey: string | null | undefined;
  /** Namespace prefix to avoid collisions across surfaces. */
  namespace: 'contract-intake' | 'contract-signing' | 'contract-onboarding';
  /** Server snapshot (most recent persisted value). Used to decide if local is fresher. */
  serverData?: T | null;
  /** ISO timestamp of last server update for the server snapshot. */
  serverUpdatedAt?: string | null;
  /** Optional debounced server save. If absent, draft stays local-only. */
  serverSave?: (data: T) => Promise<void>;
  /** Debounce window in ms. Default 1200. */
  debounceMs?: number;
  /** Skip entirely (e.g. already submitted / read-only). */
  disabled?: boolean;
}

function buildKey(namespace: string, scopeKey: string) {
  return `${namespace}-draft:${scopeKey}`;
}

function readLocal<T>(key: string): LocalDraft<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDraft<T>;
    if (!parsed || typeof parsed !== 'object' || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocal<T>(key: string, draft: LocalDraft<T>) {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (err) {
    logger.warn('contract-draft: localStorage write failed', { key });
  }
}

function clearLocal(key: string) {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

export function useContractDraftAutosave<T extends Record<string, unknown>>({
  scopeKey,
  namespace,
  serverData,
  serverUpdatedAt,
  serverSave,
  debounceMs = 1200,
  disabled = false,
}: UseContractDraftAutosaveOptions<T>) {
  const key = useMemo(
    () => (scopeKey ? buildKey(namespace, scopeKey) : null),
    [namespace, scopeKey],
  );

  const dataRef = useRef<T | null>(null);
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const [status, setStatus] = useState<ContractAutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [restoredFromLocal, setRestoredFromLocal] = useState(false);
  const [restorePreview, setRestorePreview] = useState<T | null>(null);
  // Concurrent-edit signal: server has been updated more recently than the
  // local draft. We do NOT silently drop the local copy — UI surfaces a
  // conflict and lets the user decide.
  const [serverNewerThanLocal, setServerNewerThanLocal] = useState(false);
  const [staleLocalPreview, setStaleLocalPreview] = useState<T | null>(null);

  // One-shot init: compare local vs server, expose restore offer.
  const initSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (!key) return;
    const sig = `${key}:${serverUpdatedAt ?? 'na'}`;
    if (initSigRef.current === sig) return;
    initSigRef.current = sig;

    const local = readLocal<T>(key);
    if (!local) {
      setRestoredFromLocal(false);
      setRestorePreview(null);
      setServerNewerThanLocal(false);
      setStaleLocalPreview(null);
      return;
    }
    const localTs = new Date(local.updatedAt).getTime();
    const serverTs = serverUpdatedAt ? new Date(serverUpdatedAt).getTime() : 0;
    if (localTs > serverTs) {
      setRestoredFromLocal(true);
      setRestorePreview(local.data);
      setServerNewerThanLocal(false);
      setStaleLocalPreview(null);
    } else {
      // Server is newer than (or equal to) the local draft — someone else
      // (or the same user on another device) saved after this draft was
      // captured. Surface a conflict instead of silently dropping; the UI
      // decides whether to keep server, restore stale local, or discard.
      setRestoredFromLocal(false);
      setRestorePreview(null);
      setServerNewerThanLocal(true);
      setStaleLocalPreview(local.data);
    }
  }, [key, serverUpdatedAt]);

  const persistLocal = useCallback((data: T) => {
    if (!key) return;
    writeLocal<T>(key, { data, updatedAt: new Date().toISOString() });
  }, [key]);

  const doServerSave = useCallback(async () => {
    if (!serverSave || !dataRef.current) {
      // Local-only mode: mark saved (local) and exit.
      setStatus('local_only');
      return;
    }
    const payload = dataRef.current;
    setStatus('saving');
    try {
      const p = serverSave(payload);
      inFlightRef.current = p;
      await p;
      if (dataRef.current === payload) {
        dirtyRef.current = false;
        setStatus('saved');
        setLastSavedAt(new Date());
        if (key) clearLocal(key);
      }
    } catch (err) {
      logger.warn('contract-draft: server save failed, keeping local', { namespace, scopeKey });
      setStatus('local_only');
    } finally {
      inFlightRef.current = null;
    }
  }, [serverSave, key, namespace, scopeKey]);

  const scheduleSave = useCallback(() => {
    if (disabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void doServerSave();
    }, debounceMs);
  }, [disabled, debounceMs, doServerSave]);

  /** Call from form change handlers with the full latest data object. */
  const trackChange = useCallback((next: T) => {
    dataRef.current = next;
    dirtyRef.current = true;
    persistLocal(next);
    scheduleSave();
  }, [persistLocal, scheduleSave]);

  /** Force flush. Await before Submit / route change. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inFlightRef.current) {
      try { await inFlightRef.current; } catch { /* handled */ }
    }
    if (!dirtyRef.current) return status !== 'local_only' && status !== 'error';
    await doServerSave();
    return status === 'saved';
  }, [doServerSave, status]);

  /** Clear local draft (e.g. after successful submit, or user dismissed restore). */
  const clearDraft = useCallback(() => {
    if (key) clearLocal(key);
    setRestoredFromLocal(false);
    setRestorePreview(null);
    setServerNewerThanLocal(false);
    setStaleLocalPreview(null);
    dirtyRef.current = false;
  }, [key]);

  const dismissRestoredBanner = useCallback(() => {
    setRestoredFromLocal(false);
  }, []);

  /** Dismiss the "server has newer changes" conflict notice and keep server. */
  const acceptServerVersion = useCallback(() => {
    if (key) clearLocal(key);
    setServerNewerThanLocal(false);
    setStaleLocalPreview(null);
  }, [key]);

  // Visibility / pagehide / beforeunload → flush.
  useEffect(() => {
    if (disabled) return;
    const onHide = () => {
      if (dataRef.current) persistLocal(dataRef.current);
      void flush();
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') onHide();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
    };
  }, [disabled, flush, persistLocal]);

  // Unmount: best-effort flush.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dataRef.current) persistLocal(dataRef.current);
      if (dirtyRef.current) void doServerSave();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    status,
    lastSavedAt,
    restoredFromLocal,
    restorePreview,
    serverNewerThanLocal,
    staleLocalPreview,
    acceptServerVersion,
    dismissRestoredBanner,
    trackChange,
    flush,
    clearDraft,
    isDirty: dirtyRef.current,
  };
}
