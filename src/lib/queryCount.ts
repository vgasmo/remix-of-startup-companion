/** Failed statistics are errors, never fabricated zero values. */
export function countOrThrow(res: { count: number | null; error: unknown }): number {
  if (res.error) throw res.error;
  if (res.count === null || res.count === undefined) throw new Error('count_unavailable');
  return res.count;
}

/** Para widgets "settled": a contagem, ou null (mostrar '—') quando só essa estatística falhou. */
export function countOrNull(
  r: PromiseSettledResult<{ count: number | null; error: unknown }>,
): number | null {
  if (r.status !== 'fulfilled' || r.value.error || r.value.count === null || r.value.count === undefined) return null;
  return r.value.count;
}
