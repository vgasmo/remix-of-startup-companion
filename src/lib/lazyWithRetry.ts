import type { ComponentType } from "react";
import { safeSessionStorage } from '@/lib/safeStorage';

export function lazyWithRetry<TModule extends { default: ComponentType<any> }>(
  importer: () => Promise<TModule>,
  storageKey: string,
) {
  return async () => {
    const hasRetried = typeof window !== 'undefined' && safeSessionStorage.getItem(storageKey) === 'true';

    try {
      const module = await importer();
      if (typeof window !== 'undefined') {
        safeSessionStorage.removeItem(storageKey);
      }
      return module;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const isDynamicImportFailure = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(message);

      if (typeof window !== 'undefined' && isDynamicImportFailure && !hasRetried) {
        safeSessionStorage.setItem(storageKey, 'true');
        safeSessionStorage.setItem('app_reload_reason', 'chunk_update');
        window.location.reload();
        return new Promise<TModule>(() => {
          // Intentionally unresolved while the page reloads.
        });
      }

      if (typeof window !== 'undefined') {
        safeSessionStorage.removeItem(storageKey);
      }

      throw error;
    }
  };
}
