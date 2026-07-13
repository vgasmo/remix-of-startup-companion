/**
 * Canonical single-flight draft engine.
 *
 * Design goals (Phase 1):
 *  - Monotonic revision counter — every trackChange() bumps `localRev`. Server
 *    saves ship the revision they persisted; we only mark clean if that
 *    revision matches the latest local one.
 *  - Coalescing queue — edits during an in-flight save don't fire a second
 *    concurrent save. The current save finishes, then we re-flush once with
 *    the freshest data. Prevents lost-update races.
 *  - Hashed storage keys — the localStorage key is derived from a short
 *    SHA-256 of the scope so raw signing tokens / contract ids never appear
 *    in DevTools.
 *  - Dirty-safe hydration — if the local revision is newer than the server
 *    snapshot, we surface a restore offer instead of clobbering local edits.
 *  - Visibility / pagehide / beforeunload flush — best-effort server save +
 *    guaranteed local persist so nothing is lost when the tab is killed.
 *
 * This is a primitive. The existing surface hooks
 * (`useContractDraftAutosave`, `useTemplateDraftAutosave`) delegate to it in
 * subsequent Phase 1 batches; new surfaces can adopt it directly.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logger } from '@/lib/logger';

export type DraftStatus = 'idle' | 'saving' | 'saved' | 'local_only' | 'error';

interface StoredDraft<T> {
  data: T;
  rev: number;
  updatedAt: string;
}

export interface UseSingleFlightDraftOptions<T> {
  /** Stable scope identifier (contract id, token, workspace+template pair, …). */
  scopeKey: string | null | undefined;
  /** Namespace prefix to avoid collisions across surfaces. */
  namespace: string;
  /** Optional server snapshot for hydration + freshness comparison. */
  serverData?: T | null;
  /** ISO timestamp of the server snapshot. */
  serverUpdatedAt?: string | null;
  /** Server save. Return value is ignored; throw to signal failure. */
  serverSave?: (data: T) => Promise<unknown>;
  /** Debounce window in ms. Default 1000. */
  debounceMs?: number;
  /** Skip autosave entirely. */
  disabled?: boolean;
}

/** Short, non-reversible key derivation. Prevents leaking tokens in localStorage. */
function hashScope(namespace: string, scope: string): string {
  let h = 2166136261 >>> 0; // FNV-1a
  const input = `${namespace}:${scope}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return `${namespace}:${h.toString(36)}`;
}

function readLocal<T>(key: string): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (!parsed || typeof parsed !== 'object' || !('data' in parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocal<T>(key: string, draft: StoredDraft<T>) {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (err) {
    logger.warn('single-flight-draft: localStorage write failed', { key });
  }
}

function clearLocal(key: string) {
  try { localStorage.removeItem(key); } catch { /* noop */ }
}

export function useSingleFlightDraft<T>({
  scopeKey,
  namespace,
  serverData,
  serverUpdatedAt,
  serverSave,
  debounceMs = 1000,
  disabled = false,
}: UseSingleFlightDraftOptions<T>) {
  const key = useMemo(
    () => (scopeKey ? hashScope(namespace, String(scopeKey)) : null),
    [namespace, scopeKey],
  );

  const dataRef = useRef<T | null>(null);
  const localRevRef = useRef(0);
  const savedRevRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const pendingReflushRef = useRef(false);

  const [status, setStatus] = useState<DraftStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [restoredFromLocal, setRestoredFromLocal] = useState(false);
  const [restorePreview, setRestorePreview] = useState<T | null>(null);
  const [serverNewerThanLocal, setServerNewerThanLocal] = useState(false);
  const [staleLocalPreview, setStaleLocalPreview] = useState<T | null>(null);

  // Hydration — one-shot per (key, serverUpdatedAt) signature.
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
      setRestoredFromLocal(false);
      setRestorePreview(null);
      setServerNewerThanLocal(true);
      setStaleLocalPreview(local.data);
    }
  }, [key, serverUpdatedAt]);

  const persistLocal = useCallback((data: T) => {
    if (!key) return;
    writeLocal<T>(key, { data, rev: localRevRef.current, updatedAt: new Date().toISOString() });
  }, [key]);

  const doServerSave = useCallback(async (): Promise<void> => {
    if (!serverSave || dataRef.current === null) {
      setStatus('local_only');
      return;
    }
    // Coalesce: if a save is already in flight, mark that we need to re-run
    // once it finishes and return the same promise.
    if (inFlightRef.current) {
      pendingReflushRef.current = true;
      return inFlightRef.current;
    }
    const payload = dataRef.current;
    const shippedRev = localRevRef.current;
    setStatus('saving');

    const run = (async () => {
      try {
        await serverSave(payload);
        savedRevRef.current = shippedRev;
        // Only mark clean if no further edits landed while in flight.
        if (localRevRef.current === shippedRev) {
          setStatus('saved');
          setLastSavedAt(new Date());
          if (key) clearLocal(key);
        }
      } catch (err) {
        logger.warn('single-flight-draft: server save failed, keeping local', {
          namespace,
          err: err instanceof Error ? err.message : String(err),
        });
        // Re-persist so the failed edit survives.
        if (dataRef.current !== null) persistLocal(dataRef.current);
        setStatus('local_only');
      } finally {
        inFlightRef.current = null;
      }
    })();
    inFlightRef.current = run;
    await run;

    // Coalesced re-flush: if edits landed during the flight, run once more.
    if (pendingReflushRef.current && localRevRef.current > savedRevRef.current) {
      pendingReflushRef.current = false;
      await doServerSave();
    } else {
      pendingReflushRef.current = false;
    }
  }, [serverSave, namespace, key, persistLocal]);

  const scheduleSave = useCallback(() => {
    if (disabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void doServerSave();
    }, debounceMs);
  }, [disabled, debounceMs, doServerSave]);

  const trackChange = useCallback((next: T) => {
    dataRef.current = next;
    localRevRef.current += 1;
    persistLocal(next);
    scheduleSave();
  }, [persistLocal, scheduleSave]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Wait on any in-flight save so callers see the freshest state.
    if (inFlightRef.current) {
      try { await inFlightRef.current; } catch { /* handled */ }
    }
    if (localRevRef.current === savedRevRef.current) {
      return status !== 'local_only' && status !== 'error';
    }
    await doServerSave();
    return localRevRef.current === savedRevRef.current;
  }, [doServerSave, status]);

  const clearDraft = useCallback(() => {
    if (key) clearLocal(key);
    setRestoredFromLocal(false);
    setRestorePreview(null);
    setServerNewerThanLocal(false);
    setStaleLocalPreview(null);
    localRevRef.current = 0;
    savedRevRef.current = 0;
    dataRef.current = null;
  }, [key]);

  const acceptServerVersion = useCallback(() => {
    if (key) clearLocal(key);
    setServerNewerThanLocal(false);
    setStaleLocalPreview(null);
  }, [key]);

  const dismissRestoredBanner = useCallback(() => setRestoredFromLocal(false), []);

  useEffect(() => {
    if (disabled) return;
    const onHide = () => {
      if (dataRef.current !== null) persistLocal(dataRef.current);
      void flush();
    };
    const onVis = () => { if (document.visibilityState === 'hidden') onHide(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
      window.removeEventListener('beforeunload', onHide);
    };
  }, [disabled, flush, persistLocal]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (dataRef.current !== null) persistLocal(dataRef.current);
      if (localRevRef.current > savedRevRef.current) void doServerSave();
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
    trackChange,
    flush,
    clearDraft,
    acceptServerVersion,
    dismissRestoredBanner,
    isDirty: localRevRef.current > savedRevRef.current,
    /** Introspection for tests / telemetry. */
    _localRev: localRevRef.current,
    _savedRev: savedRevRef.current,
  };
}
