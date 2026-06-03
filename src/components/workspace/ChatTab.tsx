import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Send, MessageSquare } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { notify } from "@/lib/notify";
import { format } from 'date-fns';

interface ChatTabProps {
  workspaceId: string;
}

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  conversation_id: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Participant {
  user_id: string;
  role: string;
  full_name: string | null;
  avatar_url: string | null;
}

export function ChatTab({ workspaceId }: ChatTabProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get or create workspace conversation
  const { data: conversation, isLoading: convLoading } = useQuery({
    queryKey: ['workspace-conversation', workspaceId],
    queryFn: async () => {
      // Try to find existing workspace conversation
      const { data: existing, error: findErr } = await supabase
        .from('conversations')
        .select('id')
        .eq('workspace_id', workspaceId)
        .limit(1)
        .maybeSingle();

      if (findErr) throw findErr;
      if (existing) return existing;

      // Create new conversation for this workspace
      const { data: newConv, error: createErr } = await supabase.rpc('create_conversation', {
        participant_ids: [],
        _title: null,
        _workspace_id: workspaceId,
      });

      if (createErr) throw createErr;

      // Add all workspace members as participants
      const { data: members } = await supabase
        .from('workspace_users')
        .select('user_id')
        .eq('workspace_id', workspaceId)
        .eq('active', true);

      if (members) {
        for (const member of members) {
          await supabase
            .from('conversation_participants')
            .upsert({ conversation_id: newConv, user_id: member.user_id }, { onConflict: 'conversation_id,user_id' })
            .select();
        }
      }

      return { id: newConv as string };
    },
    enabled: !!workspaceId && !!user,
  });

  // Fetch messages
  const { data: messages = [], isLoading: msgsLoading } = useQuery({
    queryKey: ['chat-messages', conversation?.id],
    queryFn: async () => {
      if (!conversation?.id) return [];
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversation.id)
        .order('created_at', { ascending: true })
        .limit(200);

      if (error) throw error;
      return data as Message[];
    },
    enabled: !!conversation?.id,
    refetchInterval: 5000, // Fallback polling
  });

  // Fetch profiles for senders
  const senderIds = [...new Set(messages.map(m => m.sender_id))];
  const { data: profiles = [] } = useQuery({
    queryKey: ['chat-profiles', senderIds.join(',')],
    queryFn: async () => {
      if (senderIds.length === 0) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', senderIds);
      if (error) throw error;
      return data as Profile[];
    },
    enabled: senderIds.length > 0,
  });

  const profileMap = new Map(profiles.map(p => [p.id, p]));

  // Fetch chat participants (workspace members) to show in header
  const { data: participants = [] } = useQuery({
    queryKey: ['chat-participants', workspaceId],
    queryFn: async (): Promise<Participant[]> => {
      const { data: members, error: mErr } = await supabase
        .from('workspace_users')
        .select('user_id, role')
        .eq('workspace_id', workspaceId)
        .eq('active', true);
      if (mErr) throw mErr;
      if (!members || members.length === 0) return [];
      const ids = members.map(m => m.user_id);
      const { data: profs, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url')
        .in('id', ids);
      if (pErr) throw pErr;
      const pMap = new Map((profs || []).map((p: any) => [p.id, p]));
      return members.map(m => ({
        user_id: m.user_id,
        role: m.role,
        full_name: (pMap.get(m.user_id) as any)?.full_name ?? null,
        avatar_url: (pMap.get(m.user_id) as any)?.avatar_url ?? null,
      }));
    },
    enabled: !!workspaceId,
  });

  const roleLabel = (role: string): string => {
    switch (role) {
      case 'founder':
        return t('roles.founder', { defaultValue: 'Fundador' });
      case 'consultor':
        return t('roles.consultor', { defaultValue: 'Consultor' });
      case 'mentor_externo':
        return t('roles.mentor', { defaultValue: 'Mentor' });
      case 'admin':
        return t('roles.admin', { defaultValue: 'Admin' });
      default:
        return role;
    }
  };

  // Realtime subscription
  useEffect(() => {
    if (!conversation?.id) return;

    const channel = supabase
      .channel(`chat-${conversation.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversation.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['chat-messages', conversation.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id, queryClient]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Send message
  const sendMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!conversation?.id || !user?.id) throw new Error('Not ready');
      const { error } = await supabase.from('messages').insert({
        conversation_id: conversation.id,
        sender_id: user.id,
        content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setNewMessage('');
      queryClient.invalidateQueries({ queryKey: ['chat-messages', conversation?.id] });
    },
    onError: () => {
      notify.error(t('chat.sendError', 'Failed to send message'));
    },
  });

  const handleSend = useCallback(() => {
    const trimmed = newMessage.trim();
    if (!trimmed) return;
    sendMutation.mutate(trimmed);
  }, [newMessage, sendMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isLoading = convLoading || msgsLoading;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-1 flex-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-3/4" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex flex-col h-[calc(100vh-16rem)]">
      <CardHeader className="flex-none pb-3 border-b">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" />
          {t('chat.title', 'Workspace Chat')}
        </CardTitle>
        {participants.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">
              {t('chat.participants', { defaultValue: 'Participantes' })}:
            </span>
            {participants.map((p) => {
              const initials =
                p.full_name
                  ?.split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase() || '?';
              return (
                <div
                  key={p.user_id}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 py-0.5 pl-0.5 pr-2"
                  title={`${p.full_name || t('chat.unknown', { defaultValue: 'Desconhecido' })} · ${roleLabel(p.role)}`}
                >
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={p.avatar_url || undefined} />
                    <AvatarFallback className="text-[9px]">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs truncate max-w-[140px]">
                    {p.full_name || t('chat.unknown', { defaultValue: 'Desconhecido' })}
                  </span>
                  <span className="text-[10px] text-muted-foreground">· {roleLabel(p.role)}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardHeader>

      {/* Messages area */}
      <CardContent className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">{t('chat.empty', 'No messages yet. Start the conversation!')}</p>
          </div>
        ) : (
          messages.map((msg, i) => {
            const isOwn = msg.sender_id === user?.id;
            const profile = profileMap.get(msg.sender_id);
            const showAvatar = i === 0 || messages[i - 1].sender_id !== msg.sender_id;
            const initials = profile?.full_name
              ?.split(' ')
              .map(n => n[0])
              .join('')
              .slice(0, 2)
              .toUpperCase() || '?';

            return (
              <div
                key={msg.id}
                className={`flex gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}
              >
                {showAvatar ? (
                  <Avatar className="h-8 w-8 flex-none mt-1">
                    <AvatarImage src={profile?.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                ) : (
                  <div className="w-8 flex-none" />
                )}
                <div className={`max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
                  {showAvatar && (
                    <p className={`text-xs text-muted-foreground mb-0.5 ${isOwn ? 'text-right' : ''}`}>
                      {profile?.full_name || t('chat.unknown', 'Unknown')}
                    </p>
                  )}
                  <div
                    className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                      isOwn
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {msg.content}
                  </div>
                  <p className={`text-[10px] text-muted-foreground mt-0.5 ${isOwn ? 'text-right' : ''}`}>
                    {format(new Date(msg.created_at), 'HH:mm')}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </CardContent>

      {/* Input area */}
      <div className="flex-none border-t p-3">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('chat.placeholder', 'Type a message...')}
            className="min-h-[40px] max-h-[120px] resize-none"
            rows={1}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!newMessage.trim() || sendMutation.isPending}
            className="flex-none"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
