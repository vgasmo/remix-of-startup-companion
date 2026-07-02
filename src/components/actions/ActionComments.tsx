import { useState } from 'react';
import { logger } from '@/lib/logger';
import { format } from 'date-fns';
import { MessageSquare, Send, User, MoreVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { notify } from "@/lib/notify";
import { useAuth } from '@/contexts/AuthContext';

import i18n from '@/i18n';
const t = i18n.t.bind(i18n);


interface ActionCommentsProps {
  actionId: string;
  canWrite: boolean;
}

interface Comment {
  id: string;
  content: string;
  created_at: string;
  user_id: string;
  profile: {
    id: string;
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  } | null;
}

export function ActionComments({ actionId, canWrite }: ActionCommentsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [newComment, setNewComment] = useState('');
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Note: This requires an action_comments table - we'll create it if needed
  const { data: comments, isLoading } = useQuery({
    queryKey: ['action-comments', actionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('action_comments' as any)
        .select(`
          id,
          content,
          created_at,
          user_id,
          profile:profiles(id, full_name, email, avatar_url)
        `)
        .eq('action_id', actionId)
        .order('created_at', { ascending: true });
      
      if (error) {
        // Table might not exist yet
        logger.warn('comments_table_unavailable', { message: error.message });
        return [];
      }
      return data as unknown as Comment[];
    },
    enabled: isOpen,
  });

  const addComment = useMutation({
    mutationFn: async (content: string) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('action_comments' as any)
        .insert({
          action_id: actionId,
          content,
          user_id: userData.user.id,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-comments', actionId] });
      setNewComment('');
      notify.success(t('actions.commentAdded'));
    },
    onError: () => {
      notify.error(t('actions.failedToAddComment'));
    },
  });

  const deleteComment = useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('action_comments' as any)
        .delete()
        .eq('id', commentId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-comments', actionId] });
      notify.success(t('actions.commentDeleted'));
    },
    onError: () => {
      notify.error(t('actions.failedToDeleteComment'));
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    addComment.mutate(newComment.trim());
  };

  const commentCount = comments?.length || 0;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
          <MessageSquare className="h-3 w-3" />
          {commentCount > 0 && <span>{commentCount}</span>}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3 border-t pt-3">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : comments && comments.length > 0 ? (
          <div className="space-y-2 max-h-[200px] overflow-y-auto">
            {comments.map((comment) => (
              <div key={comment.id} className="flex gap-2 group">
                <Avatar className="h-6 w-6 shrink-0">
                  <AvatarImage src={comment.profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-[10px]">
                    {comment.profile?.full_name?.slice(0, 2).toUpperCase() || <User className="h-3 w-3" />}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">
                      {comment.profile?.full_name || comment.profile?.email || 'User'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(comment.created_at), 'MMM d, h:mm a')}
                    </span>
                    {canWrite && comment.user_id === user?.id && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" aria-label="Comment options">
                            <MoreVertical className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem 
                            onClick={() => deleteComment.mutate(comment.id)}
                            className="text-destructive"
                          >
                            <Trash2 className="h-3 w-3 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{comment.content}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">{t('actions.noCommentsYet', 'No comments yet')}</p>
        )}

        {canWrite && (
          <form onSubmit={handleSubmit} className="flex gap-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={t("common.placeholders.addComment")}
              className="min-h-[60px] text-xs resize-none"
            />
            <Button 
              type="submit" 
              size="icon" 
              className="shrink-0"
              disabled={!newComment.trim() || addComment.isPending} loading={addComment.isPending}
             aria-label="Send">
              <Send className="h-4 w-4" />
            </Button>
          </form>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
