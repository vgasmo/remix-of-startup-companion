import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Fetches lightweight counts for workspace tab badges:
 * - actions: pending action items count
 * - chat: unread messages in this workspace's conversation
 */
export function useWorkspaceTabBadges(workspaceId: string | undefined) {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const { data } = useQuery({
    queryKey: ['workspace-tab-badges', workspaceId, userId],
    enabled: !!workspaceId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    queryFn: async () => {
      if (!workspaceId) return { pendingActions: 0, unreadChat: 0 };

      const { count } = await supabase
        .from('action_items')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .in('status', ['pending', 'in_progress', 'awaiting_validation']);

      let unreadChat = 0;
      if (userId) {
        try {
          const { data: convs } = await supabase
            .from('conversations')
            .select('id')
            .eq('workspace_id', workspaceId);
          const convIds = (convs || []).map(c => c.id);
          if (convIds.length > 0) {
            const { data: parts } = await supabase
              .from('conversation_participants')
              .select('conversation_id, last_read_at')
              .in('conversation_id', convIds)
              .eq('user_id', userId);
            const lastReadMap = new Map<string, string | null>();
            (parts || []).forEach(p => lastReadMap.set(p.conversation_id, p.last_read_at));
            const { data: msgs } = await supabase
              .from('messages')
              .select('conversation_id, created_at')
              .in('conversation_id', convIds)
              .neq('sender_id', userId)
              .order('created_at', { ascending: false })
              .limit(200);
            (msgs || []).forEach(m => {
              const lr = lastReadMap.get(m.conversation_id);
              if (!lr || m.created_at > lr) unreadChat += 1;
            });
          }
        } catch { /* ignore */ }
      }

      return { pendingActions: count ?? 0, unreadChat };
    },
  });

  return useMemo(() => {
    const badges: Record<string, number> = {};
    if (data?.pendingActions && data.pendingActions > 0) {
      badges['actions'] = data.pendingActions;
    }
    if (data?.unreadChat && data.unreadChat > 0) {
      badges['chat'] = data.unreadChat;
    }
    return badges;
  }, [data]);
}
