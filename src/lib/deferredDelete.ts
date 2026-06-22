/**
 * deferredDelete — optimistic, undoable deletes.
 *
 * Pattern: optimistically remove the item from a list-shaped query cache,
 * defer the actual mutation by `delayMs`, and show an undo toast.
 * If the user clicks "Undo" within the window, we clear the timer and
 * restore the cache snapshot. If the mutation later fails, the snapshot
 * is also restored.
 *
 * The query at `queryKey` MUST hold an array of `{ id: string }` items.
 */
import { QueryClient, QueryKey } from '@tanstack/react-query';
import { notify } from '@/lib/notify';

interface Opts<T extends { id: string }> {
  queryClient: QueryClient;
  queryKey: QueryKey;
  itemId: string;
  deletedLabel: string;
  undoLabel: string;
  mutate: (id: string) => unknown;
  delayMs?: number;
}

export function deferredDelete<T extends { id: string }>({
  queryClient,
  queryKey,
  itemId,
  deletedLabel,
  undoLabel,
  mutate,
  delayMs = 5000,
}: Opts<T>) {
  const previous = queryClient.getQueryData<T[]>(queryKey);
  if (previous) {
    queryClient.setQueryData<T[]>(
      queryKey,
      previous.filter((x) => x.id !== itemId)
    );
  }

  let cancelled = false;
  const timer = setTimeout(() => {
    if (cancelled) return;
    try {
      const result = mutate(itemId);
      if (result && typeof (result as Promise<unknown>).catch === 'function') {
        (result as Promise<unknown>).catch(() => {
          if (previous) queryClient.setQueryData(queryKey, previous);
        });
      }
    } catch {
      if (previous) queryClient.setQueryData(queryKey, previous);
    }
  }, delayMs);

  notify.success(deletedLabel, {
    duration: delayMs,
    action: {
      label: undoLabel,
      onClick: () => {
        cancelled = true;
        clearTimeout(timer);
        if (previous) queryClient.setQueryData(queryKey, previous);
      },
    },
  });
}
