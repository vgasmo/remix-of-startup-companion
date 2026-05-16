/**
 * Robust template draft autosave hook.
 *
 * - Debounced server save (default 850ms) via useUpsertTemplateInstance.
 * - localStorage fallback so typed work survives tab close / crash / offline.
 * - Flushes on blur / dialog close / route switch / visibilitychange /
 *   pagehide / beforeunload / unmount.
 * - Caches the created template_instance id locally so rapid edits on a
 *   brand-new instance never insert duplicates (fixes the canvas dup bug).
 * - Exposes a status state machine for UI feedback.
 *
 * Use it once per (workspace, template) editing surface.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUpsertTemplateInstance, type TemplateInstance } from '@/hooks/useTemplates';
import { logger } from '@/lib/logger';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'local_only' | 'error';

interface LocalDraft {
  data: Record<string, unknown>;
  updatedAt: string; // ISO
  instanceId?: string | null;
}

interface UseTemplateDraftAutosaveOptions {
  workspaceId: string;
  templateId: string | null | undefined;
  userId: string | null | undefined;
  instance: TemplateInstance | null;
  /** Optional initial seed when there is no instance and no local draft. */
  initial?: Record<string, unknown>;
  /** Debounce window in ms. Default 850. */
  debounceMs?: number;
  /** Skip autosave (e.g. read-only viewer). */
  disabled?: boolean;
}

function storageKey(workspaceId: string, templateId: string, userId: string) {
  return `template-draft:${workspaceId}:${templateId}:${userId}`;
}

function readLocal(key: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDraft;
    if (!parsed || typeof parsed !== 'object' || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeLocal(key: string, draft: LocalDraft) {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (err) {
    logger.error('template-draft: localStorage write failed', { key }, err);
  }
}

function clearLocal(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export function useTemplateDraftAutosave({
  workspaceId,
  templateId,
  userId,
  instance,
  initial,
  debounceMs = 850,
  disabled = false,
}: UseTemplateDraftAutosaveOptions) {
  const upsert = useUpsertTemplateInstance(workspaceId);

  const key = useMemo(() => {
    if (!workspaceId || !templateId || !userId) return null;
    return storageKey(workspaceId, templateId, userId);
  }, [workspaceId, templateId, userId]);

  // Canonical instance id lives in a ref so the hook can update the same
  // row across renders, even if the parent's `instance` prop is stale.
  const instanceIdRef = useRef<string | null>(instance?.id ?? null);

  // Latest data lives in a ref so debounced timers always read the freshest value.
  const dataRef = useRef<Record<string, unknown>>({});
  const dirtyRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<unknown> | null>(null);

  const [data, setData] = useState<Record<string, unknown>>({});
  const [status, setStatus] = useState<AutosaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [restoredFromLocal, setRestoredFromLocal] = useState(false);

  // One-shot init when template/instance changes.
  const initSigRef = useRef<string | null>(null);
  useEffect(() => {
    if (!templateId) return;
    const sig = `${templateId}:${instance?.id ?? 'new'}`;
    if (initSigRef.current === sig) return;
    initSigRef.current = sig;

    const serverData = (instance?.data_json as Record<string, unknown> | null) ?? null;
    const serverUpdatedAt = instance?.updated_at ? new Date(instance.updated_at).getTime() : 0;
    const local = key ? readLocal(key) : null;
    const localUpdatedAt = local ? new Date(local.updatedAt).getTime() : 0;

    let next: Record<string, unknown> = serverData ?? initial ?? {};
    let usedLocal = false;
    if (local && localUpdatedAt > serverUpdatedAt) {
      next = { ...(serverData ?? {}), ...local.data };
      usedLocal = true;
    }

    instanceIdRef.current = instance?.id ?? local?.instanceId ?? null;
    dataRef.current = next;
    dirtyRef.current = false;
    setData(next);
    setRestoredFromLocal(usedLocal);
    setStatus(instance?.id || usedLocal ? 'saved' : 'idle');
    setLastSavedAt(instance?.updated_at ? new Date(instance.updated_at) : null);
  }, [templateId, instance?.id, instance?.data_json, instance?.updated_at, key, initial]);

  const persistLocal = useCallback(() => {
    if (!key) return;
    writeLocal(key, {
      data: dataRef.current,
      updatedAt: new Date().toISOString(),
      instanceId: instanceIdRef.current,
    });
  }, [key]);

  const doServerSave = useCallback(async () => {
    if (!templateId) return false;
    const payload = dataRef.current;
    setStatus('saving');
    try {
      const promise = upsert.mutateAsync({
        template_id: templateId,
        data_json: payload,
        existingId: instanceIdRef.current ?? undefined,
      });
      inFlightRef.current = promise;
      const result = await promise;
      if (result?.id) instanceIdRef.current = result.id;
      // Only mark clean if no further edits happened during the round-trip.
      if (dataRef.current === payload) {
        dirtyRef.current = false;
        setStatus('saved');
        setLastSavedAt(new Date());
        if (key) clearLocal(key);
      } else {
        // Still dirty — schedule another save.
        setStatus('saving');
        persistLocal();
      }
      return true;
    } catch (err) {
      logger.error('template-draft: server save failed, keeping local draft', { templateId }, err);
      persistLocal();
      setStatus('local_only');
      return false;
    } finally {
      inFlightRef.current = null;
    }
  }, [templateId, upsert, key, persistLocal]);

  const scheduleSave = useCallback(() => {
    if (disabled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void doServerSave();
    }, debounceMs);
  }, [disabled, debounceMs, doServerSave]);

  const setField = useCallback(
    (fieldId: string, value: unknown) => {
      const next = { ...dataRef.current, [fieldId]: value };
      dataRef.current = next;
      dirtyRef.current = true;
      setData(next);
      persistLocal();
      scheduleSave();
    },
    [persistLocal, scheduleSave],
  );

  const setAll = useCallback(
    (next: Record<string, unknown>) => {
      dataRef.current = next;
      dirtyRef.current = true;
      setData(next);
      persistLocal();
      scheduleSave();
    },
    [persistLocal, scheduleSave],
  );

  /**
   * Force-write to the server now. Returns true on success.
   * Awaits any in-flight save first so callers (Submit / Complete) see latest.
   */
  const flush = useCallback(async (): Promise<boolean> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inFlightRef.current) {
      try { await inFlightRef.current; } catch { /* swallow, doServerSave handled it */ }
    }
    if (!dirtyRef.current) return status !== 'local_only' && status !== 'error';
    return doServerSave();
  }, [doServerSave, status]);

  // Flush on tab hide / pagehide / beforeunload. Localstorage always wins —
  // server attempt is best-effort because the page may already be terminating.
  useEffect(() => {
    if (disabled) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        persistLocal();
        void flush();
      }
    };
    const onPageHide = () => {
      persistLocal();
      // Best-effort; we don't await.
      void flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('beforeunload', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('beforeunload', onPageHide);
    };
  }, [disabled, flush, persistLocal]);

  // On unmount: flush pending edits (await the in-flight promise too).
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      // Best-effort sync write so reopens find latest data even if save races.
      persistLocal();
      if (dirtyRef.current) {
        void doServerSave();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Telemetry: log every status transition so production issues are
  // diagnosable from logs/Sentry without needing user repro.
  const lastLoggedStatusRef = useRef<AutosaveStatus | null>(null);
  useEffect(() => {
    if (lastLoggedStatusRef.current === status) return;
    const from = lastLoggedStatusRef.current;
    lastLoggedStatusRef.current = status;
    const context = {
      workspaceId,
      templateId: templateId ?? null,
      instanceId: instanceIdRef.current,
      userId: userId ?? null,
      from,
      to: status,
      restoredFromLocal,
      lastSavedAt: lastSavedAt?.toISOString() ?? null,
    };
    if (status === 'error') {
      logger.error('template_autosave.status_change', context);
    } else if (status === 'local_only') {
      logger.warn('template_autosave.status_change', context);
    } else {
      logger.info('template_autosave.status_change', context);
    }
  }, [status, workspaceId, templateId, userId, restoredFromLocal, lastSavedAt]);

  const dismissRestoredBanner = useCallback(() => setRestoredFromLocal(false), []);

  return {
    data,
    setField,
    setAll,
    flush,
    status,
    lastSavedAt,
    restoredFromLocal,
    dismissRestoredBanner,
    isDirty: dirtyRef.current,
    instanceId: instanceIdRef.current,
  };
}
