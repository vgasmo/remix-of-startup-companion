import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export interface ConsultantNote {
  id: string;
  workspace_id: string;
  author_id: string;
  content: string;
  is_private: boolean;
  visibility?: string | null;
  created_at: string;
  updated_at: string;
  author?: {
    full_name: string | null;
    email: string;
    avatar_url: string | null;
  };
}

export function useConsultantNotes(workspaceId: string | undefined) {
  return useQuery({
    queryKey: ['consultant-notes', workspaceId],
    queryFn: async (): Promise<ConsultantNote[]> => {
      if (!workspaceId) return [];

      const { data, error } = await supabase
        .from('consultant_notes')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data?.length) return [];

      // Author lookup goes through profiles_safe. RLS on consultant_notes already restricts
      // reads to staff, and profiles_safe returns email only for self/staff — so peer callers
      // that ever slip past the notes RLS still get a masked payload.
      const authorIds = [...new Set(data.map(n => n.author_id))];
      const { data: profiles } = await supabase
        .from('profiles_safe')
        .select('id, full_name, email, avatar_url')
        .in('id', authorIds);

      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      return data.map(note => ({
        ...note,
        author: profileMap.get(note.author_id),
      }));
    },
    enabled: !!workspaceId,
  });
}

export function useCreateConsultantNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ workspaceId, content, isPrivate = true }: {
      workspaceId: string;
      content: string;
      isPrivate?: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('consultant_notes')
        .insert([{
          workspace_id: workspaceId,
          author_id: user.id,
          content,
          is_private: isPrivate,
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['consultant-notes', variables.workspaceId] });
    },
  });
}

export function useUpdateConsultantNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, content, isPrivate }: {
      id: string;
      content?: string;
      isPrivate?: boolean;
    }) => {
      const updates: Record<string, unknown> = {};
      if (content !== undefined) updates.content = content;
      if (isPrivate !== undefined) updates.is_private = isPrivate;

      const { error } = await supabase
        .from('consultant_notes')
        .update(updates as never)
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultant-notes'] });
    },
  });
}

export function useDeleteConsultantNote() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('consultant_notes')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['consultant-notes'] });
    },
  });
}
