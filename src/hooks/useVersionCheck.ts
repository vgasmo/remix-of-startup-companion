import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { notify } from "@/lib/notify";

const POLL_INTERVAL = 2 * 60 * 1000; // 2 minutes (was 5)

export function useVersionCheck() {
  const { t } = useTranslation();
  const initialVersion = useRef<string | null>(null);
  const hasNotified = useRef(false);

  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch(`/version.json?_=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const remote = data.version as string;

      if (initialVersion.current === null) {
        initialVersion.current = remote;
        return;
      }

      if (remote !== initialVersion.current && !hasNotified.current) {
        hasNotified.current = true;

        // Show persistent, unmissable toast with clear action.
        // IMPORTANT: never auto-reload — that would silently destroy
        // unsaved work / scroll position when the user returns to the tab.
        notify.info(
          t('app.newVersionAvailable', 'Nova versão disponível!'),
          {
            description: t(
              'app.clickToUpdate',
              'A app foi atualizada. Clique no botão para carregar a nova versão.'
            ),
            duration: Infinity,
            position: 'top-center',
            action: {
              label: t('app.updateNow', 'Atualizar agora'),
              onClick: () => {
                // Destroy stale caches ONLY when the user opts in — doing it at
                // detection time leaves the old tab without a safety net and the
                // next navigation blows up mid-form.
                void (async () => {
                  if ('serviceWorker' in navigator) {
                    try {
                      const registrations = await navigator.serviceWorker.getRegistrations();
                      for (const reg of registrations) {
                        await reg.unregister();
                      }
                    } catch {
                      // ignore SW errors
                    }
                  }
                  if ('caches' in window) {
                    try {
                      const names = await caches.keys();
                      await Promise.all(names.map((n) => caches.delete(n)));
                    } catch {
                      // ignore cache errors
                    }
                  }
                  window.location.reload();
                })();
              },
            },
          },
        );
      }
    } catch {
      // silently ignore network errors
    }
  }, [t]);

  useEffect(() => {
    // Surface the involuntary reload caused by lazyWithRetry after a deploy.
    try {
      if (sessionStorage.getItem('app_reload_reason') === 'chunk_update') {
        sessionStorage.removeItem('app_reload_reason');
        notify.info(
          t('app.reloadedAfterUpdate', 'A app foi atualizada e recarregada. Se estava a preencher algo, pode ter-se perdido.'),
          { duration: 8000, position: 'top-center' },
        );
      }
    } catch {
      // sessionStorage unavailable
    }

    checkVersion();
    const id = setInterval(checkVersion, POLL_INTERVAL);

    const onFocus = () => checkVersion();
    window.addEventListener('focus', onFocus);

    // Listen for SW update events — surface the same toast instead of
    // silently reloading, so the user never loses their current view.
    const onControllerChange = () => {
      checkVersion();
    };
    navigator.serviceWorker?.addEventListener('controllerchange', onControllerChange);

    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
      navigator.serviceWorker?.removeEventListener('controllerchange', onControllerChange);
    };
  }, [checkVersion, t]);
}

