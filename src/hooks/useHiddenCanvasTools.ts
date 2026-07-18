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
        const { error } = await supabase
          .from('workspace_hidden_canvas_tools')
          .insert({ workspace_id: workspaceId, canvas_type: canvasType });
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
