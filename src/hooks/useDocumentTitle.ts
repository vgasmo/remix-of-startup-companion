import { useEffect } from 'react';

const BASE_TITLE = 'Startup Leiria';

/**
 * Sets document.title to `${title} · Startup Leiria` while mounted,
 * restoring the previous title on unmount.
 * Passing null/undefined resets to the base title.
 */
export function useDocumentTitle(title?: string | null) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
