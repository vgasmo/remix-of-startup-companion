import { differenceInDays, parseISO, isValid } from 'date-fns';

export type RelationshipStatus = 'healthy' | 'at_risk' | 'stale';

export interface RelationshipStatusConfig {
  status: RelationshipStatus;
  label: string;
  color: string;
  bgColor: string;
}

const STALE_THRESHOLD_DAYS = 14;

/**
 * Compute relationship status for a CRM lead/funnel item
 * This is a pure function - no database writes
 * 
 * Rules:
 * - "Healthy": has next_action_at in future OR last_activity within 14 days
 * - "At risk": next_action_at is overdue OR has overdue CRM tasks
 * - "Stale": no activity in 14 days AND no next_action set
 */
export function getRelationshipStatus(params: {
  next_action_at: string | null;
  last_activity_at: string | null;
  hasOverdueTasks?: boolean;
}): RelationshipStatus {
  const { next_action_at, last_activity_at, hasOverdueTasks = false } = params;
  const now = new Date();
  
  // Parse dates
  const nextAction = next_action_at ? parseISO(next_action_at) : null;
  const lastActivity = last_activity_at ? parseISO(last_activity_at) : null;
  
  // Check if next action is overdue
  const nextActionOverdue = nextAction && isValid(nextAction) && nextAction < now;
  
  // Check if next action is in future
  const nextActionFuture = nextAction && isValid(nextAction) && nextAction >= now;
  
  // Check if activity is recent (within 14 days)
  const daysSinceActivity = lastActivity && isValid(lastActivity) 
    ? differenceInDays(now, lastActivity) 
    : Infinity;
  const hasRecentActivity = daysSinceActivity < STALE_THRESHOLD_DAYS;
  
  // At Risk: next action overdue OR has overdue tasks
  if (nextActionOverdue || hasOverdueTasks) {
    return 'at_risk';
  }
  
  // Healthy: has future next action OR recent activity
  if (nextActionFuture || hasRecentActivity) {
    return 'healthy';
  }
  
  // Stale: no recent activity AND no future next action
  return 'stale';
}

/**
 * Get display configuration for a relationship status
 */
export function getRelationshipStatusConfig(status: RelationshipStatus): RelationshipStatusConfig {
  switch (status) {
    case 'healthy':
      return {
        status: 'healthy',
        label: 'Healthy',
        color: 'text-success',
        bgColor: 'bg-success/10',
      };
    case 'at_risk':
      return {
        status: 'at_risk',
        label: 'At Risk',
        color: 'text-warning',
        bgColor: 'bg-warning/10',
      };
    case 'stale':
      return {
        status: 'stale',
        label: 'Stale',
        color: 'text-muted-foreground',
        bgColor: 'bg-muted',
      };
  }
}

/**
 * Check if an item qualifies for Focus Mode display
 * Focus Mode shows only urgent items that need immediate attention
 */
export function shouldShowInFocusMode(params: {
  next_action_at: string | null;
  last_activity_at: string | null;
  hasOverdueTasks?: boolean;
  isMyItem?: boolean;
}): boolean {
  const { next_action_at, last_activity_at, hasOverdueTasks = false, isMyItem = true } = params;
  
  // Only show items assigned to current user
  if (!isMyItem) return false;
  
  const now = new Date();
  
  // Check if next action is overdue
  const nextAction = next_action_at ? parseISO(next_action_at) : null;
  const nextActionOverdue = nextAction && isValid(nextAction) && nextAction < now;
  
  // Check if item is stale (no activity in 14 days AND no next action set)
  const lastActivity = last_activity_at ? parseISO(last_activity_at) : null;
  const daysSinceActivity = lastActivity && isValid(lastActivity) 
    ? differenceInDays(now, lastActivity) 
    : Infinity;
  const isStale = daysSinceActivity >= STALE_THRESHOLD_DAYS && !next_action_at;
  
  // Show in focus mode if:
  // 1. Next action is overdue
  // 2. Has overdue CRM tasks
  // 3. Is stale with no next action
  return nextActionOverdue || hasOverdueTasks || isStale;
}

/**
 * Sort items for Focus Mode display by urgency
 * Order: overdue next_action (oldest first) > overdue tasks > stale
 */
export function sortByFocusUrgency<T extends {
  next_action_at: string | null;
  last_activity_at: string | null;
}>(items: T[]): T[] {
  const now = new Date();
  
  return [...items].sort((a, b) => {
    const aNextAction = a.next_action_at ? parseISO(a.next_action_at) : null;
    const bNextAction = b.next_action_at ? parseISO(b.next_action_at) : null;
    
    const aOverdue = aNextAction && isValid(aNextAction) && aNextAction < now;
    const bOverdue = bNextAction && isValid(bNextAction) && bNextAction < now;
    
    const aStale = !a.next_action_at && (!a.last_activity_at || 
      differenceInDays(now, parseISO(a.last_activity_at)) >= STALE_THRESHOLD_DAYS);
    const bStale = !b.next_action_at && (!b.last_activity_at || 
      differenceInDays(now, parseISO(b.last_activity_at)) >= STALE_THRESHOLD_DAYS);
    
    // Overdue items first (sorted by oldest overdue)
    if (aOverdue && !bOverdue) return -1;
    if (!aOverdue && bOverdue) return 1;
    if (aOverdue && bOverdue) {
      return aNextAction!.getTime() - bNextAction!.getTime();
    }
    
    // Then stale items (sorted by oldest last activity)
    if (aStale && !bStale) return -1;
    if (!aStale && bStale) return 1;
    if (aStale && bStale) {
      const aActivity = a.last_activity_at ? parseISO(a.last_activity_at).getTime() : 0;
      const bActivity = b.last_activity_at ? parseISO(b.last_activity_at).getTime() : 0;
      return aActivity - bActivity;
    }
    
    return 0;
  });
}
