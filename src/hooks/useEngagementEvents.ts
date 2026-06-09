/**
 * useEngagementEvents — Cross-role engagement signals (views, comments, acks, completions).
 *
 * GDPR-safe: only IDs + timestamps + enums are persisted. Names/emails are resolved
 * client-side from existing member data.
 *
 * Backed by `workspace_engagement_events` (RLS: members + staff can read; only the
 * actor can insert).
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

export type EngagementEventType = 'view' | 'comment' | 'acknowledge' | 'react' | 'complete';
export type EngagementTargetType =
  | 'action'
  | 'milestone'
  | 'kpi'
  | 'session'
  | 'document'
  | 'checkin';

export interface EngagementEvent {
  id: string;
  event_type: EngagementEventType;
  target_type: EngagementTargetType;
  target_id: string | null;
  actor_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

/**
 * Fire-and-forget tracker. Never throws — engagement signals must never break the UI.
 */
export function useTrackEngagement(workspaceId: string | undefined) {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({
      eventType,
      targetType,
      targetId,
      metadata,
    }: {
      eventType: EngagementEventType;
      targetType: EngagementTargetType;
      targetId?: string;
      metadata?: Record<string, unknown>;
    }) => {
      if (!workspaceId || !user?.id) return null;
      const { error } = await (supabase as any)
        .from('workspace_engagement_events')
        .insert({
          workspace_id: workspaceId,
          actor_id: user.id,
          event_type: eventType,
          target_type: targetType,
          target_id: targetId ?? null,
          metadata: metadata ?? {},
        });
      if (error) {
        // Silent: engagement tracking is best-effort.
        // eslint-disable-next-line no-console
        console.warn('[engagement] insert failed', error.message);
      }
      return null;
    },
  });
}

/**
 * Recent engagement events for a workspace (capped at 20).
 */
export function useEngagementFeed(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['engagement-feed', workspaceId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    queryFn: async (): Promise<EngagementEvent[]> => {
      const { data } = await (supabase as any)
        .from('workspace_engagement_events')
        .select('id, event_type, target_type, target_id, actor_id, metadata, created_at')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(20);
      return (data as EngagementEvent[]) ?? [];
    },
  });
}

/**
 * Last 5 view events for a given target. Used by <ViewReceipt /> to show "seen by".
 */
export function useLastViewByRole(
  workspaceId: string | undefined,
  targetType: EngagementTargetType,
  targetId: string | undefined,
) {
  return useQuery({
    queryKey: ['last-view', workspaceId, targetType, targetId],
    enabled: !!workspaceId && !!targetId,
    staleTime: 120_000,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('workspace_engagement_events')
        .select('actor_id, created_at')
        .eq('workspace_id', workspaceId)
        .eq('event_type', 'view')
        .eq('target_type', targetType)
        .eq('target_id', targetId)
        .order('created_at', { ascending: false })
        .limit(5);
      return (data as Array<{ actor_id: string | null; created_at: string }>) ?? [];
    },
  });
}
