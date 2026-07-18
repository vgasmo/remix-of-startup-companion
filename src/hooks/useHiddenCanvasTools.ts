import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export function useHiddenCanvasTools(workspaceId: string) {
  return useQuery({
    queryKey: ['hiddenCanvasTools', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspace_hidden_canvas_tools')
        .select('canvas_type')
        .eq('workspace_id', workspaceId);
      if (error) throw error;
      return (data ?? []).map((r) => r.canvas_type as string);
    },
    enabled: !!workspaceId,
  });
}

export function useToggleHiddenCanvasTool(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ canvasType, hide }: { canvasType: string; hide: boolean }) => {
      if (hide) {
        // Persist hidden_by so audit logs / RLS policies that reference the
        // staff member who hid the tool have the correct actor. Without this
        // the row was created with a null hidden_by and could later fail
        // an "only the hider can unhide" style policy.
        const { data: userData } = await supabase.auth.getUser();
        const { error } = await supabase
          .from('workspace_hidden_canvas_tools')
          .insert({
            workspace_id: workspaceId,
            canvas_type: canvasType,
            hidden_by: userData.user?.id ?? null,
          });
        if (error && !String(error.message).includes('duplicate')) throw error;
      } else {
        const { error } = await supabase
          .from('workspace_hidden_canvas_tools')
          .delete()
          .eq('workspace_id', workspaceId)
          .eq('canvas_type', canvasType);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hiddenCanvasTools', workspaceId] });
    },
  });
}
