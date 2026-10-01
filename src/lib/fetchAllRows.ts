import { logger } from '@/lib/logger';

export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
  hardCap = 20000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < hardCap; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) return out;
  }
  logger.warn('[fetchAllRows] hard cap reached', { hardCap });
  return out;
}
