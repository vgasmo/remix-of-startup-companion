/**
 * useIsFirstWeek — pure date math, no queries.
 * Returns true when the latest of (profile.created_at, workspace.created_at)
 * is within the last 7 days.
 */
export function useIsFirstWeek(
  profileCreatedAt?: string | null,
  workspaceCreatedAt?: string | null,
): boolean {
  const candidates = [profileCreatedAt, workspaceCreatedAt]
    .filter(Boolean)
    .map((d) => new Date(d as string).getTime())
    .filter((t) => Number.isFinite(t));

  if (candidates.length === 0) return false;
  const latest = Math.max(...candidates);
  const ageMs = Date.now() - latest;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return ageMs >= 0 && ageMs < sevenDaysMs;
}
