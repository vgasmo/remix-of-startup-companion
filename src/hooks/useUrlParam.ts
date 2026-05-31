import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Read/write a single URL query parameter while preserving the other params.
 *
 * Writes use `replace: false` so each change pushes a new history entry, which
 * makes the browser back/forward buttons toggle the value naturally. Components
 * that derive UI state from the returned `value` automatically stay in sync
 * when the user navigates through history.
 */
export function useUrlParam(key: string): [string | null, (next: string | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(key);

  const setValue = useCallback(
    (next: string | null) => {
      const params = new URLSearchParams(searchParams);
      if (next) params.set(key, next);
      else params.delete(key);
      setSearchParams(params, { replace: false });
    },
    [key, searchParams, setSearchParams],
  );

  return [value, setValue];
}
