import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useEffect } from 'react';
import { notify } from "@/lib/notify";
import i18n from '@/i18n';
import { useAuth } from '@/contexts/AuthContext';
import { invokeWithAuth } from "@/lib/invokeWithAuth";
const t = i18n.t.bind(i18n);

export interface Conversation {
  id: string;
  workspace_id: string | null;
  title: string | null;
  is_group: boolean;
  created_at: string;
  updated_at: string;
  participants?: ConversationParticipant[];
  last_message?: Message;
  unread_count?: number;
}

export interface ConversationParticipant {
  id: string;
  conversation_id: string;
  user_id: string;
  joined_at: string;
  last_read_at: string | null;
  profile?: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  sender?: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
}

export function useConversations() {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: ['conversations', userId],
    enabled: !!userId,
    queryFn: async (): Promise<Conversation[]> => {
      if (!userId) return [];

      // Get conversations the user participates in
      const { data: participations, error: partError } = await supabase
        .from('conversation_participants')
        .select('conversation_id, last_read_at')
        .eq('user_id', userId);

      if (partError) throw partError;
      if (!participations?.length) return [];

      const conversationIds = participations.map(p => p.conversation_id);
      const lastReadMap = new Map(participations.map(p => [p.conversation_id, p.last_read_at]));

      // Get conversation details
      const { data: conversations, error: convError } = await supabase
        .from('conversations')
        .select('id, workspace_id, title, is_group, created_at, updated_at')
        .in('id', conversationIds)
        .order('updated_at', { ascending: false });

      if (convError) throw convError;
      if (!conversations?.length) return [];

      // Get participants for each conversation
      const { data: allParticipants } = await supabase
        .from('conversation_participants')
        .select('id, conversation_id, user_id, joined_at, last_read_at')
        .in('conversation_id', conversationIds);

      // Get profiles
      const userIds = [...new Set(allParticipants?.map(p => p.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email, avatar_url')
        .in('id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Get last message for each conversation (cap to recent window to avoid full-table fetch)
      const { data: lastMessages } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, content, created_at')
        .in('conversation_id', conversationIds)
        .order('created_at', { ascending: false })
        .limit(200);

      const lastMessageMap = new Map<string, Message>();
      lastMessages?.forEach(m => {
        if (!lastMessageMap.has(m.conversation_id)) {
          lastMessageMap.set(m.conversation_id, m);
        }
      });

      // Count unread messages — batched approach instead of N+1 per-conversation loop
      const unreadCounts = new Map<string, number>();
      // Get all messages across conversations that could be unread (recent window only)
      const { data: allUnreadMessages } = await supabase
        .from('messages')
        .select('conversation_id, created_at')
        .in('conversation_id', conversationIds)
        .neq('sender_id', userId)
        .order('created_at', { ascending: false })
        .limit(500);

      if (allUnreadMessages) {
        for (const msg of allUnreadMessages) {
          const lastRead = lastReadMap.get(msg.conversation_id);
          if (!lastRead || msg.created_at > lastRead) {
            unreadCounts.set(msg.conversation_id, (unreadCounts.get(msg.conversation_id) || 0) + 1);
          }
        }
      }

      return conversations.map(conv => ({
        ...conv,
        participants: allParticipants
          ?.filter(p => p.conversation_id === conv.id)
          .map(p => ({
            ...p,
            profile: profileMap.get(p.user_id),
          })),
        last_message: lastMessageMap.get(conv.id),
        unread_count: unreadCounts.get(conv.id) || 0,
      }));
    },
  });
}

export function useMessages(conversationId: string | undefined) {
  const queryClient = useQueryClient();

  // Real-time subscription
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`messages-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async (): Promise<Message[]> => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('messages')
        .select('id, conversation_id, sender_id, content, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      if (!data?.length) return [];

      // Get sender profiles
      const senderIds = [...new Set(data.map(m => m.sender_id))];
      const { data: profiles } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email, avatar_url')
        .in('id', senderIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      return data.map(msg => ({
        ...msg,
        sender: profileMap.get(msg.sender_id),
      }));
    },
    enabled: !!conversationId,
  });
}

export function useSendMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('messages')
        .insert([{ conversation_id: conversationId, sender_id: user.id, content }])
        .select()
        .single();

      if (error) throw error;

      // Update conversation updated_at
      await supabase
        .from('conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId);

      // Fire-and-forget email alert to other participants
      try {
        void invokeWithAuth('send-message-email-alert', {
          body: { messageId: data.id },
        });
      } catch {
        // ignore — best-effort
      }

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['messages', variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      participantIds,
      title,
      workspaceId,
    }: {
      participantIds: string[];
      title?: string;
      workspaceId?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: convId, error: rpcError } = await supabase.rpc('create_conversation', {
        participant_ids: participantIds,
        _title: title ?? null,
        _workspace_id: workspaceId ?? null,
      });

      if (rpcError) throw rpcError;

      const { data: conv, error: convError } = await supabase
        .from('conversations')
        .select('id, workspace_id, title, is_group, created_at, updated_at')
        .eq('id', convId)
        .single();

      if (convError) throw convError;
      return conv;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
    onError: (err: any) => {
      notify.error(t('messaging.conversationFailed', 'Não foi possível iniciar conversa'), {
        description: err?.message ?? t('common.tryAgain', 'Tente novamente.'),
      });
    },
  });
}

export function useMarkConversationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('conversation_participants')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['workspace-tab-badges'] });
      queryClient.invalidateQueries({ queryKey: ['unread-messages-count'] });
    },

  });
}
