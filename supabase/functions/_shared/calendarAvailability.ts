/** A missing, truncated or errored Graph schedule never establishes free time. */
export function verifiedAvailabilityView(schedule: unknown, expectedBlocks: number): string | null {
  if (!schedule || typeof schedule !== 'object') return null;
  const row = schedule as { error?: unknown; availabilityView?: unknown };
  if (row.error || typeof row.availabilityView !== 'string' ||
      row.availabilityView.length !== expectedBlocks || !/^[0-4]+$/.test(row.availabilityView)) return null;
  return row.availabilityView;
}

export function calendarBlocksAreFree(view: string, start: number, count: number): boolean {
  return start >= 0 && count > 0 && view.length >= start + count &&
    /^0+$/.test(view.slice(start, start + count));
}